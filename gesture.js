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
    focus: {
        mobileDist: 22, 
        pcDist: 20, 
        scale: 2.0      
    },
    gesture: {
        confirmFrames: 8,   // ✅ 8帧：折中方案，既稳又快
        cooldown: 500       // 0.5秒冷却，防止连击
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
    lastFocusedIndices: [],
    lastGestureName: null,
    gestureFrameCount: 0,
    lastTriggerTime: 0
};

// --- GLOBALS ---
let scene, camera, renderer, composer, controlsOrbit;
let ornaments = []; 
let photoMeshes = [];
let hands, cameraPipe, rafId;
let raycaster, mouse;

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
    // ✅ 摄像机位置微调：稍微拉远一点点，视角更广
    camera.position.set(0, 10, 85);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping; 
    container.appendChild(renderer.domElement);

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.95; 
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.4;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    controlsOrbit = new OrbitControls(camera, renderer.domElement);
    controlsOrbit.enableDamping = true;
    controlsOrbit.dampingFactor = 0.1;
    controlsOrbit.rotateSpeed = 0.4;
    controlsOrbit.enablePan = false;
    controlsOrbit.enabled = false; 

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    window.addEventListener('click', onDocumentClick);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xfff5b6, 1.5);
    dirLight.position.set(20, 50, 20);
    scene.add(dirLight);
    
    const pointLight = new THREE.PointLight(CONFIG.colors.gold, 2, 100);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    createParticles();
    window.addEventListener('resize', onWindowResize);
}

function createParticles() {
    const geometrySphere = new THREE.SphereGeometry(0.6, 16, 16);
    const geometryBox = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    
    const matGold = new THREE.MeshStandardMaterial({ color: CONFIG.colors.gold, metalness: 0.9, roughness: 0.1, emissive: 0xffaa00, emissiveIntensity: 4.0 });
    const matRed = new THREE.MeshStandardMaterial({ color: CONFIG.colors.red, metalness: 0.6, roughness: 0.3, emissive: 0xff0000, emissiveIntensity: 3.0 });
    const matGreen = new THREE.MeshStandardMaterial({ color: CONFIG.colors.green, metalness: 0.1, roughness: 0.9, emissive: 0x004400, emissiveIntensity: 1.0 });

    for (let i = 0; i < CONFIG.particleCount; i++) {
        let mesh;
        const rand = Math.random();
        if (rand < 0.5) mesh = new THREE.Mesh(geometrySphere, rand < 0.25 ? matGold : matRed);
        else mesh = new THREE.Mesh(geometryBox, rand < 0.8 ? matGreen : matGold);

        const theta = i * 0.5 + Math.random(); 
        const y = (i / CONFIG.particleCount) * CONFIG.treeHeight - (CONFIG.treeHeight/2);
        const r = (1 - (y + CONFIG.treeHeight/2) / CONFIG.treeHeight) * CONFIG.treeRadius + Math.random() * 2;
        
        // ✅ 修复：树整体上移 10 个单位，避免底部被切掉
        const treePos = { x: Math.cos(theta) * r, y: y + 10, z: Math.sin(theta) * r };
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
    
    const mat = new THREE.MeshBasicMaterial({ 
        map: texture, side: THREE.DoubleSide, transparent: true, fog: false, color: 0xd9d9d9 
    });
    const mesh = new THREE.Mesh(geo, mat);
    
    const theta = index * 1.5; 
    const y = ((index / 10) - 0.5) * 40; 
    const r = 15 + Math.random() * 8; 

    // ✅ 修复：照片跟随树整体上移
    const treePos = { x: Math.cos(theta)*r, y: y + 10, z: Math.sin(theta)*r };
    
    // ✅ 修复：限制散开模式的 Y 轴范围 (-25 到 25)，防止飞到天上
    const scatterPos = { 
        x: (Math.random()-0.5)*70, 
        y: (Math.random()-0.5)*50, // 限制高度
        z: (Math.random()-0.5)*50 + 20 // 稍微靠前一点
    };

    mesh.userData = {
        treePos: treePos,
        scatterPos: scatterPos,
        isPhoto: true,
        originalScale: new THREE.Vector3(1,1,1),
        desc: itemData.desc,
        aspect: aspect
    };

    mesh.position.set(treePos.x, treePos.y, treePos.z);
    mesh.lookAt(0,0,0);
    mesh.scale.set(0, 0, 0); // 初始隐藏

    scene.add(mesh);
    ornaments.push(mesh);
    photoMeshes.push(mesh);
}

function findBestPhotoToFocus() {
    if (photoMeshes.length === 0) return -1;
    const centerDir = new THREE.Vector3();
    camera.getWorldDirection(centerDir);
    const candidates = photoMeshes.map((mesh, index) => {
        const meshPos = mesh.position.clone();
        const dirToMesh = meshPos.sub(camera.position).normalize();
        const angle = centerDir.angleTo(dirToMesh);
        return { index, angle };
    });
    candidates.sort((a, b) => a.angle - b.angle);
    let best = candidates[0];
    if (STATE.lastFocusedIndices.includes(best.index)) {
        if (candidates.length > 1 && candidates[1].angle < 0.5) best = candidates[1];
    }
    STATE.lastFocusedIndices = [best.index];
    return best.index;
}

// --- 核心逻辑修复：TRANSITIONS ---
function transitionTo(newState, focusIndex = -1) {
    if (STATE.mode === newState && newState !== 'FOCUS') return;
    STATE.mode = newState;
    STATE.focusedPhotoIndex = focusIndex;
    STATE.lastTriggerTime = Date.now();

    new TWEEN.Group().removeAll();

    ornaments.forEach(mesh => {
        let target;
        let targetScale = mesh.userData.originalScale;

        if (newState === 'TREE') {
            // 回到树模式
            target = mesh.userData.treePos;
            if(mesh.userData.isPhoto) {
                mesh.lookAt(0, 0, 0);
                // 捉迷藏：极少数显示，大部分隐藏
                if (Math.random() > 0.85) targetScale = new THREE.Vector3(0.8, 0.8, 0.8);
                else targetScale = new THREE.Vector3(0.01, 0.01, 0.01);
            }
        } else if (newState === 'SCATTER') {
            // 散开模式
            target = mesh.userData.scatterPos;
            if (mesh.userData.isPhoto) targetScale = new THREE.Vector3(1, 1, 1);
        } else if (newState === 'FOCUS') {
            // 聚焦模式
            if (photoMeshes.indexOf(mesh) === focusIndex) {
                // 1. 选中的照片：计算位置并放大
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                const screenAspect = window.innerWidth / window.innerHeight;
                const photoAspect = mesh.userData.aspect;
                let dist = CONFIG.focus.pcDist; 
                if (screenAspect < photoAspect) dist = CONFIG.focus.mobileDist * (photoAspect / screenAspect) * 0.6; 
                else if (screenAspect < 1.0) dist = CONFIG.focus.mobileDist;
                dist = Math.max(15, Math.min(dist, 60));

                target = { 
                    x: camera.position.x + camDir.x * dist, 
                    y: camera.position.y + camDir.y * dist, 
                    z: camera.position.z + camDir.z * dist 
                };
                targetScale = new THREE.Vector3(CONFIG.focus.scale, CONFIG.focus.scale, CONFIG.focus.scale);
                mesh.lookAt(camera.position);
                statusText.innerText = mesh.userData.desc || "查看照片";
            } else {
                // 2. ✅ 没选中的照片：强制隐藏！
                // 之前这里设为 scatterPos 且 scale=1，导致所有照片突然闪现
                // 现在改成：未选中照片去 scatterPos，但缩放为 0 (隐藏)
                target = mesh.userData.scatterPos;
                if (mesh.userData.isPhoto) {
                    targetScale = new THREE.Vector3(0, 0, 0); 
                }
            }
        }

        new TWEEN.Tween(mesh.position).to(target, 1500).easing(TWEEN.Easing.Exponential.InOut).start();
        
        if(mesh.userData.isPhoto) {
            new TWEEN.Tween(mesh.scale).to(targetScale, 1000).easing(TWEEN.Easing.Back.Out).start();
        }
    });
}

function toggleInputMode() {
    if (STATE.inputMode === 'GESTURE') {
        STATE.inputMode = 'MOUSE';
        btnInputMode.innerText = "🖱️ 鼠标模式";
        statusText.innerText = "鼠标控制中...";
        gestureGuide.style.display = 'none';
        videoElement.style.opacity = 0;
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

function detectGesture(landmarks) {
    const wrist = landmarks[0];
    const middleTip = landmarks[12];
    const distance = Math.sqrt(Math.pow(middleTip.x - wrist.x, 2) + Math.pow(middleTip.y - wrist.y, 2));
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinchDist = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));

    if (pinchDist < 0.05) return 'PINCH'; 
    if (distance < 0.25) return 'FIST';   
    return 'OPEN';                        
}

function onResults(results) {
    if(!STATE.active || STATE.inputMode === 'MOUSE') return;
    loader.style.display = 'none';

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        STATE.handPresent = true;
        const landmarks = results.multiHandLandmarks[0];
        const rawGesture = detectGesture(landmarks);

        if (rawGesture === STATE.lastGestureName) {
            STATE.gestureFrameCount++;
        } else {
            STATE.gestureFrameCount = 0;
            STATE.lastGestureName = rawGesture;
        }

        const isStable = STATE.gestureFrameCount > CONFIG.gesture.confirmFrames;
        const isCooldownOver = (Date.now() - STATE.lastTriggerTime) > CONFIG.gesture.cooldown;

        if (isStable) {
            if (rawGesture === 'PINCH') {
                // ✅ 优化：如果是 TREE 模式，捏合无效，提示先张开
                if (STATE.mode === 'TREE') {
                    statusText.innerText = "ℹ️ 请先张开手 (OPEN)";
                    statusText.style.color = "#aaa";
                } else {
                    statusText.innerText = "👌 锁定 (捏合)";
                    statusText.style.color = "#0f0";
                    const indexTip = landmarks[8];
                    const handCursor = { x: (indexTip.x - 0.5) * 2, y: -(indexTip.y - 0.5) * 2 };
                    raycaster.setFromCamera(handCursor, camera);
                    const intersects = raycaster.intersectObjects(photoMeshes);
                    if (intersects.length > 0) {
                        const targetMesh = intersects[0].object;
                        const idx = photoMeshes.indexOf(targetMesh);
                        if (STATE.focusedPhotoIndex !== idx) transitionTo('FOCUS', idx);
                    } 
                }
            } else if (rawGesture === 'FIST') {
                statusText.innerText = "✊ 聚树 (握拳)";
                statusText.style.color = "#d4af37";
                if (STATE.mode !== 'TREE' && isCooldownOver) transitionTo('TREE');
            } else { // OPEN
                statusText.innerText = "🖐 浏览 (张手)";
                statusText.style.color = "#fff";
                if (STATE.mode !== 'SCATTER' && STATE.mode !== 'FOCUS' && isCooldownOver) {
                     transitionTo('SCATTER');
                }
                if (STATE.mode === 'FOCUS' && isCooldownOver) {
                     transitionTo('SCATTER');
                }
            }
        }

        if (STATE.mode !== 'FOCUS') {
            const handX = (landmarks[9].x - 0.5) * 2; 
            const handY = (landmarks[9].y - 0.5) * 2;
            STATE.rotationTarget.x = handX * 2; 
            STATE.rotationTarget.y = handY * 2;
        }
    } else {
        STATE.handPresent = false;
        STATE.gestureFrameCount = 0;
        statusText.innerText = "请举起手...";
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

function animate(time) {
    if (!STATE.active) return;
    rafId = requestAnimationFrame(animate);
    TWEEN.update(time);

    if (STATE.inputMode === 'MOUSE') {
        controlsOrbit.update();
    } else {
        if (STATE.mode === 'FOCUS') {
            // 静止
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