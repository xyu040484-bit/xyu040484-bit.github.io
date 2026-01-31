import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- CONFIGURATION ---
const CONFIG = {
    colors: {
        green: 0x1a472a,
        gold: 0xffd700,
        red: 0x8a0303,
        bg: 0x050505
    },
    particleCount: 1500,
    treeHeight: 60,
    treeRadius: 25,
    scatterRadius: 80,
    photoScale: 6,
    // 聚焦距离配置
    focus: {
        mobileDist: 22, // 手机拉近一点
        pcDist: 35,     // PC 拉远一点 (小一号)
        scale: 2.0      // 统一放大倍率
    }
};

// --- STATE ---
const STATE = {
    active: false,
    inputMode: 'GESTURE',
    mode: 'TREE',
    handPresent: false,
    rotationTarget: { x: 0, y: 0 },
    focusedPhotoIndex: -1,
    lastFocusedIndices: [] // 记录最近看过的照片，防止重复
};

// --- GLOBALS ---
let scene, camera, renderer, composer, controlsOrbit;
let ornaments = []; 
let photoMeshes = [];
let hands, cameraPipe, rafId;
let raycaster, mouse; // 移除了 handCursor

// DOM
const overlay = document.getElementById('gesture-overlay');
const container = document.getElementById('canvas-container');
const statusText = document.getElementById('status-text');
const loader = document.getElementById('gesture-loading');
const videoElement = document.getElementById('video-input');
const gestureGuide = document.getElementById('gesture-guide');
const mouseControls = document.getElementById('mouse-controls');
const btnInputMode = document.getElementById('btn-input-mode');

// --- INIT 3D ---
function initThree() {
    if (scene) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.bg);
    scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.015);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 80);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // ✅ 移除 ToneMapping，保证照片色彩原汁原味，不发灰
    renderer.toneMapping = THREE.NoToneMapping; 
    container.appendChild(renderer.domElement);

    // 辉光 (只对铃铛生效，照片不发光)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.9; // 只有极亮的铃铛发光
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.4;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    controlsOrbit = new OrbitControls(camera, renderer.domElement);
    controlsOrbit.enabled = false; 

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    window.addEventListener('click', onDocumentClick);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // 充足的环境光
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xfff5b6, 1.5);
    dirLight.position.set(20, 50, 20);
    scene.add(dirLight);
    
    // 铃铛点光
    const pointLight = new THREE.PointLight(CONFIG.colors.gold, 2, 100);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    createParticles();
    window.addEventListener('resize', onWindowResize);
}

function createParticles() {
    const geometrySphere = new THREE.SphereGeometry(0.6, 16, 16);
    const geometryBox = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    
    // 铃铛材质：高亮自发光，确保有光点
    const matGold = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.gold, metalness: 0.9, roughness: 0.1, 
        emissive: 0xffaa00, emissiveIntensity: 4.0 
    });
    const matRed = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.red, metalness: 0.6, roughness: 0.3,
        emissive: 0xff0000, emissiveIntensity: 3.0 
    });
    const matGreen = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.green, metalness: 0.1, roughness: 0.9,
        emissive: 0x004400, emissiveIntensity: 1.0 
    });

    for (let i = 0; i < CONFIG.particleCount; i++) {
        let mesh;
        const rand = Math.random();
        if (rand < 0.5) mesh = new THREE.Mesh(geometrySphere, rand < 0.25 ? matGold : matRed);
        else mesh = new THREE.Mesh(geometryBox, rand < 0.8 ? matGreen : matGold);

        const theta = i * 0.5 + Math.random(); 
        const y = (i / CONFIG.particleCount) * CONFIG.treeHeight - (CONFIG.treeHeight/2);
        const r = (1 - (y + CONFIG.treeHeight/2) / CONFIG.treeHeight) * CONFIG.treeRadius + Math.random() * 2;
        const treePos = { x: Math.cos(theta) * r, y: y, z: Math.sin(theta) * r };
        const scatterPos = { x: (Math.random() - 0.5) * CONFIG.scatterRadius * 2, y: (Math.random() - 0.5) * CONFIG.scatterRadius * 2, z: (Math.random() - 0.5) * CONFIG.scatterRadius * 2 };

        mesh.userData = { treePos, scatterPos, originalScale: mesh.scale.clone(), isPhoto: false };
        mesh.position.set(treePos.x, treePos.y, treePos.z);
        scene.add(mesh);
        ornaments.push(mesh);
    }
}

async function loadPhotos() {
    try {
        const res = await fetch('data/photos.json');
        if (!res.ok) throw new Error('Fetch failed');
        const items = await res.json();
        
        photoMeshes.forEach(p => scene.remove(p));
        photoMeshes = [];

        const loader = new THREE.TextureLoader();
        items.forEach((item, index) => {
            loader.load(item.src, (texture) => {
                createPhotoMesh(texture, index, item);
            });
        });
        loader.style.display = 'none';
    } catch (err) {
        console.error(err);
        statusText.innerText = "Error loading photos";
    }
}

function createPhotoMesh(texture, index, itemData) {
    const aspect = texture.image.width / texture.image.height;
    const geo = new THREE.PlaneGeometry(CONFIG.photoScale * aspect, CONFIG.photoScale);
    
    // ✅ 照片材质升级：MeshBasicMaterial + fog: false
    // 这样照片完全不受光照和雾气影响，永远显示最真实的颜色
    const mat = new THREE.MeshBasicMaterial({ 
        map: texture, 
        side: THREE.DoubleSide, 
        transparent: true,
        fog: false // 关键：关闭雾效，防止变灰
    });
    const mesh = new THREE.Mesh(geo, mat);
    
    // 布局：尽量靠外，避免被树挡住
    const theta = index * 1.5; 
    const y = ((index / 10) - 0.5) * 40; 
    const r = 25 + Math.random() * 5; 

    mesh.userData = {
        treePos: { x: Math.cos(theta)*r, y: y, z: Math.sin(theta)*r },
        scatterPos: { x: (Math.random()-0.5)*60, y: (Math.random()-0.5)*60, z: (Math.random()-0.5)*60 },
        isPhoto: true,
        originalScale: new THREE.Vector3(1,1,1),
        desc: itemData.desc
    };

    mesh.position.set(mesh.userData.treePos.x, mesh.userData.treePos.y, mesh.userData.treePos.z);
    mesh.lookAt(0,0,0);
    scene.add(mesh);
    ornaments.push(mesh);
    photoMeshes.push(mesh);
}

// --- INTELLIGENT SELECTION LOGIC ---
function findBestPhotoToFocus() {
    if (photoMeshes.length === 0) return -1;

    // 1. 计算所有照片到屏幕中心的距离（Angle distance）
    const centerDir = new THREE.Vector3();
    camera.getWorldDirection(centerDir); // 相机正前方

    const candidates = photoMeshes.map((mesh, index) => {
        const meshPos = mesh.position.clone();
        const dirToMesh = meshPos.sub(camera.position).normalize();
        const angle = centerDir.angleTo(dirToMesh); // 夹角越小，说明越靠近屏幕中心
        return { index, angle };
    });

    // 2. 按夹角从小到大排序
    candidates.sort((a, b) => a.angle - b.angle);

    // 3. 智能轮播逻辑
    // 如果最近的照片就是刚才看过的那张，尝试选第二近的
    let best = candidates[0];
    
    // 如果最近的照片是当前正在看的，或者刚刚才看过的
    if (STATE.lastFocusedIndices.includes(best.index)) {
        // 如果第二近的照片也在视野范围内（比如夹角小于 30度），就切过去
        if (candidates.length > 1 && candidates[1].angle < 0.5) {
            best = candidates[1];
        }
    }

    // 更新历史记录（只保留最近一张）
    STATE.lastFocusedIndices = [best.index];
    
    return best.index;
}

function transitionTo(newState, focusIndex = -1) {
    if (STATE.mode === newState && newState !== 'FOCUS') return;
    STATE.mode = newState;
    STATE.focusedPhotoIndex = focusIndex;

    new TWEEN.Group().removeAll();

    ornaments.forEach(mesh => {
        let target;
        let targetScale = mesh.userData.originalScale;

        if (newState === 'TREE') {
            target = mesh.userData.treePos;
            if(mesh.userData.isPhoto) mesh.lookAt(0,0,0); // 复位朝向
        } else if (newState === 'SCATTER') {
            target = mesh.userData.scatterPos;
        } else if (newState === 'FOCUS') {
            if (photoMeshes.indexOf(mesh) === focusIndex) {
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                
                // ✅ 距离适配：检测屏幕宽高比
                const isPortrait = window.innerHeight > window.innerWidth;
                // 手机(竖屏)拉得近一点(22)，PC(横屏)拉得远一点(35)
                const dist = isPortrait ? CONFIG.focus.mobileDist : CONFIG.focus.pcDist;
                
                target = { 
                    x: camera.position.x + camDir.x * dist, 
                    y: camera.position.y + camDir.y * dist, 
                    z: camera.position.z + camDir.z * dist 
                };
                
                // 统一放大
                targetScale = new THREE.Vector3(CONFIG.focus.scale, CONFIG.focus.scale, CONFIG.focus.scale);
                mesh.lookAt(camera.position); // 脸朝相机
                
                statusText.innerText = mesh.userData.desc || "查看照片";
            } else {
                target = mesh.userData.scatterPos;
            }
        }

        new TWEEN.Tween(mesh.position).to(target, 1500).easing(TWEEN.Easing.Exponential.InOut).start();
        
        if(mesh.userData.isPhoto) {
            new TWEEN.Tween(mesh.scale).to(targetScale, 1000).easing(TWEEN.Easing.Back.Out).start();
        }
    });
}

// --- MEDIAPIPE ---
function onResults(results) {
    if(!STATE.active || STATE.inputMode === 'MOUSE') return;
    loader.style.display = 'none';

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        STATE.handPresent = true;
        const landmarks = results.multiHandLandmarks[0];
        
        const wrist = landmarks[0];
        const middleTip = landmarks[12];
        const distance = Math.sqrt(Math.pow(middleTip.x - wrist.x, 2) + Math.pow(middleTip.y - wrist.y, 2));
        
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const pinchDist = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));
        
        // 1. 捏合逻辑 (聚焦)
        if (pinchDist < 0.05) {
            statusText.innerText = "👌 FOCUS (锁定)";
            statusText.style.color = "#0f0";
            
            // 只有当不在 FOCUS 状态，或者当前照片不是想要的，才触发寻找
            // 为了防止频繁闪烁，这里加个简单的锁：如果已经是 FOCUS，需要手松开再捏才能换？
            // 简化逻辑：捏合就不断寻找最近的。
            // 但加上了 transitionTo 内部的防抖，不会一直重置动画。
            
            if (STATE.mode !== 'FOCUS') {
                const bestIdx = findBestPhotoToFocus();
                if (bestIdx !== -1) transitionTo('FOCUS', bestIdx);
            }
        } 
        // 2. 握拳逻辑 (聚树)
        else if (distance < 0.25) {
            statusText.innerText = "✊ TREE (聚树)";
            statusText.style.color = "#d4af37";
            transitionTo('TREE');
        } 
        // 3. 张手逻辑 (散开)
        else {
            statusText.innerText = "🖐 SCATTER (浏览)";
            statusText.style.color = "#fff";
            transitionTo('SCATTER');
        }

        // 4. 旋转逻辑 (FOCUS 状态下强制静止)
        if (STATE.mode === 'FOCUS') {
            // 绝对静止，忽略手势移动
        } else {
            const handX = (landmarks[9].x - 0.5) * 2; 
            const handY = (landmarks[9].y - 0.5) * 2;
            STATE.rotationTarget.x = handX * 2; 
            STATE.rotationTarget.y = handY * 2;
        }

    } else {
        STATE.handPresent = false;
        statusText.innerText = "Waiting for hand...";
    }
}

async function initHands() {
    if(hands) return;
    const video = document.getElementById('video-input');
    hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    hands.onResults(onResults);
    cameraPipe = new window.Camera(video, { onFrame: async () => { if (STATE.active) await hands.send({image: video}); }, width: 320, height: 240 });
}

// --- MOUSE & CONTROLS ---
function toggleInputMode() {
    if (STATE.inputMode === 'GESTURE') {
        STATE.inputMode = 'MOUSE';
        btnInputMode.innerText = "🖱️ 鼠标模式";
        statusText.innerText = "鼠标控制中...";
        gestureGuide.style.display = 'none';
        videoElement.style.opacity = 0; // 隐藏视频
        mouseControls.style.display = 'flex';
        controlsOrbit.enabled = true;
        camera.position.set(0, 20, 80);
    } else {
        STATE.inputMode = 'GESTURE';
        btnInputMode.innerText = "🖐️ 手势模式";
        statusText.innerText = "等待手势...";
        gestureGuide.style.display = 'block';
        videoElement.style.opacity = 0.7;
        mouseControls.style.display = 'none';
        controlsOrbit.enabled = false;
    }
}

function onDocumentClick(event) {
    if (STATE.inputMode !== 'MOUSE' || !STATE.active) return;
    if (event.target.closest('#controls') || event.target.closest('#ui-layer button')) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(photoMeshes);

    if (intersects.length > 0) {
        const selected = intersects[0].object;
        const idx = photoMeshes.indexOf(selected);
        transitionTo('FOCUS', idx);
    } else {
        if (STATE.mode === 'FOCUS') transitionTo('SCATTER');
    }
}

// --- MAIN LOOP ---
function animate(time) {
    if (!STATE.active) return;
    rafId = requestAnimationFrame(animate);
    TWEEN.update(time);

    if (STATE.inputMode === 'MOUSE') {
        controlsOrbit.update();
    } else {
        if (STATE.mode === 'FOCUS') {
            // 绝对静止，不跟随手势，不自动旋转
        } else if (STATE.mode === 'SCATTER') {
            const radius = 80;
            const targetTheta = STATE.rotationTarget.x;
            const targetPhi = STATE.rotationTarget.y;
            const timeAngle = time * 0.0001;
            camera.position.x += (Math.sin(targetTheta + timeAngle) * radius - camera.position.x) * 0.05;
            camera.position.z += (Math.cos(targetTheta + timeAngle) * radius - camera.position.z) * 0.05;
            camera.position.y += (-targetPhi * 20 - camera.position.y + 10) * 0.05;
            camera.lookAt(0, 0, 0);
        } else {
             const radius = 80;
             const timeAngle = time * 0.0002;
             camera.position.x = Math.sin(timeAngle) * radius;
             camera.position.z = Math.cos(timeAngle) * radius;
             camera.position.y = THREE.MathUtils.lerp(camera.position.y, 10, 0.05);
             camera.lookAt(0, 10, 0);
        }
    }

    if (STATE.mode === 'FOCUS' && STATE.focusedPhotoIndex > -1) {
        const p = photoMeshes[STATE.focusedPhotoIndex];
        if(p) p.lookAt(camera.position);
    }

    // 粒子自旋 (仅在非聚焦时)
    if (STATE.mode !== 'TREE' && STATE.mode !== 'FOCUS') {
        ornaments.forEach((mesh) => {
            mesh.rotation.x += 0.01; mesh.rotation.y += 0.01;
        });
    }
    composer.render();
}

function onWindowResize() {
    if(!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// --- SYSTEM START/STOP ---
async function startGestureSystem() {
    overlay.style.display = 'block';
    STATE.active = true;
    document.body.style.overflow = 'hidden';
    initThree();
    await loadPhotos();
    await initHands();
    cameraPipe.start();
    animate();
}

function stopGestureSystem() {
    overlay.style.display = 'none';
    STATE.active = false;
    document.body.style.overflow = '';
    if (rafId) cancelAnimationFrame(rafId);
}

document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('btn-open-gesture');
    const closeBtn = document.getElementById('btn-close-gesture');
    if (openBtn) openBtn.addEventListener('click', startGestureSystem);
    if (closeBtn) closeBtn.addEventListener('click', stopGestureSystem);
    
    if (btnInputMode) {
        btnInputMode.removeEventListener('click', toggleInputMode);
        btnInputMode.addEventListener('click', toggleInputMode);
    }
    
    const treeBtn = document.getElementById('btn-tree');
    const scatterBtn = document.getElementById('btn-scatter');
    if (treeBtn) treeBtn.addEventListener('click', () => transitionTo('TREE'));
    if (scatterBtn) scatterBtn.addEventListener('click', () => transitionTo('SCATTER'));
});