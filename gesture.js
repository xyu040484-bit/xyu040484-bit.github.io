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
    photoScale: 6
};

// --- STATE ---
const STATE = {
    active: false,
    inputMode: 'GESTURE',
    mode: 'TREE', // TREE, SCATTER, FOCUS
    handPresent: false,
    rotationTarget: { x: 0, y: 0 },
    focusedPhotoIndex: -1,
    hoveredPhotoIndex: -1 // 新增：手势悬停的目标
};

// --- GLOBALS ---
let scene, camera, renderer, composer, controlsOrbit;
let ornaments = []; 
let photoMeshes = [];
let hands, cameraPipe, rafId;
let raycaster, mouse, handCursor;

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
    // 使用 Reinhard 映射，能更好处理高亮而不失真
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // ✅ 辉光策略：阈值设为 1.0，只要物体亮度不超过 1.0 就绝对不发光
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 1.0; // 关键：只有亮度 > 1.0 的物体才发光
    bloomPass.strength = 1.2;  // 强度恢复，保证铃铛够亮
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // OrbitControls (Mouse Only)
    controlsOrbit = new OrbitControls(camera, renderer.domElement);
    controlsOrbit.enableDamping = true;
    controlsOrbit.dampingFactor = 0.05;
    controlsOrbit.enablePan = false;
    controlsOrbit.enabled = false; 

    // Raycaster
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    handCursor = new THREE.Vector2(); // 手势光标
    window.addEventListener('click', onDocumentClick);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); // 提高环境光，保证照片清晰
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xfff5b6, 1.0);
    dirLight.position.set(20, 50, 20);
    scene.add(dirLight);

    createParticles();
    window.addEventListener('resize', onWindowResize);
}

function createParticles() {
    const geometrySphere = new THREE.SphereGeometry(0.6, 16, 16);
    const geometryBox = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    
    // ✅ 粒子材质：自发光强度设为 3.0，远超阈值 1.0，所以会发光
    const matGold = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.gold, metalness: 0.9, roughness: 0.1, 
        emissive: 0xaa6600, emissiveIntensity: 3.0 
    });
    const matRed = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.red, metalness: 0.6, roughness: 0.3,
        emissive: 0xff0000, emissiveIntensity: 3.0 
    });
    const matGreen = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.green, metalness: 0.1, roughness: 0.9 
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

// --- PHOTO LOADING ---
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
    
    // ✅ 照片材质：使用 Lambert 材质，不设置 emissive (自发光)，亮度受环境光控制，不会超过 1.0，所以不发光
    const mat = new THREE.MeshLambertMaterial({ 
        map: texture, side: THREE.DoubleSide, transparent: true, opacity: 1.0
    });
    const mesh = new THREE.Mesh(geo, mat);
    
    const theta = index * 1.5; 
    const y = ((index / 10) - 0.5) * 40; 
    const r = 18 + Math.random() * 5; 

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

// --- TRANSITIONS ---
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
            if(mesh.userData.isPhoto) mesh.lookAt(0,0,0);
        } else if (newState === 'SCATTER') {
            target = mesh.userData.scatterPos;
        } else if (newState === 'FOCUS') {
            if (photoMeshes.indexOf(mesh) === focusIndex) {
                // 选中照片：飞到屏幕正中央
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                const dist = 12; // 距离稍微拉近一点
                target = { 
                    x: camera.position.x + camDir.x * dist, 
                    y: camera.position.y + camDir.y * dist, 
                    z: camera.position.z + camDir.z * dist 
                };
                targetScale = new THREE.Vector3(2, 2, 2); 
                mesh.lookAt(camera.position);
                statusText.innerText = mesh.userData.desc || "查看照片";
            } else {
                target = mesh.userData.scatterPos; // 其他照片散开
            }
        }

        new TWEEN.Tween(mesh.position).to(target, 1500).easing(TWEEN.Easing.Exponential.InOut).start();
        if(mesh.userData.isPhoto) {
            new TWEEN.Tween(mesh.scale).to(targetScale, 1000).easing(TWEEN.Easing.Back.Out).start();
        }
    });
}

// --- MOUSE CONTROL ---
function toggleInputMode() {
    if (STATE.inputMode === 'GESTURE') {
        STATE.inputMode = 'MOUSE';
        btnInputMode.innerText = "🖱️ 鼠标模式";
        statusText.innerText = "鼠标控制中...";
        gestureGuide.style.display = 'none';
        videoElement.classList.add('hidden'); 
        videoElement.style.opacity = 0;
        mouseControls.style.display = 'flex';
        controlsOrbit.enabled = true;
        camera.position.set(0, 20, 80);
    } else {
        STATE.inputMode = 'GESTURE';
        btnInputMode.innerText = "🖐️ 手势模式";
        statusText.innerText = "等待手势...";
        gestureGuide.style.display = 'block';
        videoElement.classList.remove('hidden');
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

// --- MEDIAPIPE (HANDS) ---
function onResults(results) {
    if(!STATE.active || STATE.inputMode === 'MOUSE') return;
    loader.style.display = 'none';

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        STATE.handPresent = true;
        const landmarks = results.multiHandLandmarks[0];
        
        // 1. 获取食指指尖 (Index Tip) 用于瞄准
        const indexTip = landmarks[8];
        handCursor.x = (indexTip.x - 0.5) * 2;
        handCursor.y = -(indexTip.y - 0.5) * 2; // Y轴反转

        // 2. 射线检测：看手有没有指着照片
        raycaster.setFromCamera(handCursor, camera);
        const intersects = raycaster.intersectObjects(photoMeshes);
        
        // 3. 捏合检测 (Pinch)
        const thumbTip = landmarks[4];
        const pinchDist = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));
        const isPinching = pinchDist < 0.05;

        // 4. 握拳检测 (Fist)
        const wrist = landmarks[0];
        const middleTip = landmarks[12];
        const fistDist = Math.sqrt(Math.pow(middleTip.x - wrist.x, 2) + Math.pow(middleTip.y - wrist.y, 2));

        // --- 逻辑判断 ---
        if (isPinching) {
            if (intersects.length > 0) {
                // ✅ 精准聚焦：指哪张看哪张
                statusText.innerText = "👌 FOCUS (锁定照片)";
                statusText.style.color = "#0f0";
                const targetMesh = intersects[0].object;
                const idx = photoMeshes.indexOf(targetMesh);
                
                // 只有当目标改变时才触发
                if (STATE.focusedPhotoIndex !== idx) {
                    transitionTo('FOCUS', idx);
                }
            } else {
                // 捏合但没指着照片 -> 保持当前状态或无操作
            }
        } else if (fistDist < 0.25) {
            statusText.innerText = "✊ TREE (聚树)";
            transitionTo('TREE');
        } else {
            // 张开手
            // 如果之前是 FOCUS 状态，手张开不应该立刻散开，除非捏合释放？
            // 逻辑优化：如果正在看照片，只有指向空白处捏合/或者特殊手势才退出？
            // 简单点：张手就是散开（浏览模式）
            statusText.innerText = "🖐 SCATTER (散开)";
            if (STATE.mode !== 'FOCUS') transitionTo('SCATTER'); 
            // 如果是 FOCUS，保持 FOCUS，直到用户做“散开”手势？
            // 或者：只要不捏合，就允许退出 FOCUS？
            // 为了体验流畅，我们设定：如果正在 FOCUS，只有当手移开中心区域或者张开手一段时间才退？
            // 这里为了简单直观：张手 = 散开。如果想退出查看，就张手。
            if (STATE.mode === 'FOCUS' && !intersects.length) transitionTo('SCATTER');
        }

        // 5. 视角旋转 (Hand Moving)
        // ✅ 修复：在 FOCUS 模式下，禁用相机旋转，背景也不动，绝对静止
        if (STATE.mode === 'FOCUS') {
            // Do nothing to camera rotation
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

// --- LOOP ---
function animate(time) {
    if (!STATE.active) return;
    rafId = requestAnimationFrame(animate);
    TWEEN.update(time);

    if (STATE.inputMode === 'MOUSE') {
        controlsOrbit.update();
    } else {
        // ✅ 手势模式相机逻辑：
        if (STATE.mode === 'FOCUS') {
            // 绝对静止：锁定相机位置，不做任何 lerp，防止照片乱动
            // 只有 TWEEN 在负责把照片移到相机面前，相机本身不动
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
             // TREE
             const radius = 80;
             const timeAngle = time * 0.0002;
             camera.position.x = Math.sin(timeAngle) * radius;
             camera.position.z = Math.cos(timeAngle) * radius;
             camera.position.y = THREE.MathUtils.lerp(camera.position.y, 10, 0.05);
             camera.lookAt(0, 10, 0);
        }
    }

    // 聚焦照片始终看向相机
    if (STATE.mode === 'FOCUS' && STATE.focusedPhotoIndex > -1) {
        const p = photoMeshes[STATE.focusedPhotoIndex];
        if(p) p.lookAt(camera.position);
    }

    // ✅ 粒子动画：在 FOCUS 模式下也停止自旋，保持画面纯净
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

// --- CONTROL ---
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
    
    // 绑定切换按钮
    if (btnInputMode) {
        btnInputMode.removeEventListener('click', toggleInputMode);
        btnInputMode.addEventListener('click', toggleInputMode);
    }
    
    const treeBtn = document.getElementById('btn-tree');
    const scatterBtn = document.getElementById('btn-scatter');
    if (treeBtn) treeBtn.addEventListener('click', () => transitionTo('TREE'));
    if (scatterBtn) scatterBtn.addEventListener('click', () => transitionTo('SCATTER'));
});