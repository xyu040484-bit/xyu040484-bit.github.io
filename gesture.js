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
    inputMode: 'GESTURE', // 'GESTURE' or 'MOUSE'
    mode: 'TREE', // TREE, SCATTER, FOCUS
    handPresent: false,
    rotationTarget: { x: 0, y: 0 },
    focusedPhotoIndex: -1
};

// --- GLOBALS ---
let scene, camera, renderer, composer, controlsOrbit;
let ornaments = []; 
let photoMeshes = [];
let hands, cameraPipe, rafId;
let raycaster, mouse;

// DOM Elements
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
    // 使用 Cineon 色调映射，让高光更柔和，不至于过曝
    renderer.toneMapping = THREE.CineonToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // ✅ 辉光修复：大幅提高阈值，只让光源发光，不让照片发光
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.85; // 只有极亮的部分才会发光 (原0.2)
    bloomPass.strength = 0.4;   // 强度减半 (原0.6)
    bloomPass.radius = 0.2;     // 半径减小，防止晕开

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // OrbitControls (Mouse Mode Only)
    controlsOrbit = new OrbitControls(camera, renderer.domElement);
    controlsOrbit.enableDamping = true;
    controlsOrbit.dampingFactor = 0.05;
    controlsOrbit.enablePan = false;
    controlsOrbit.enabled = false; 

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    window.addEventListener('click', onDocumentClick);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // 提高环境光，让照片更亮
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xfff5b6, 1.2);
    dirLight.position.set(20, 50, 20);
    scene.add(dirLight);
    
    // 金色点光源（用于照亮粒子，但不照亮照片）
    const pointLight = new THREE.PointLight(CONFIG.colors.gold, 2, 100);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    createParticles();
    window.addEventListener('resize', onWindowResize);
}

function createParticles() {
    const geometrySphere = new THREE.SphereGeometry(0.6, 16, 16);
    const geometryBox = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    
    // 增加 emissive (自发光)，确保粒子依然闪亮
    const matGold = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.gold, metalness: 0.9, roughness: 0.1, 
        emissive: 0xaa6600, emissiveIntensity: 2.0 
    });
    const matRed = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.red, metalness: 0.6, roughness: 0.3,
        emissive: 0xff0000, emissiveIntensity: 1.5 
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
    // 使用 Basic 材质，不受光照和 Bloom 影响，保持原图色彩
    const mat = new THREE.MeshBasicMaterial({ 
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
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                const dist = 15;
                // 让照片始终在相机正前方
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

        // 动画时间
        new TWEEN.Tween(mesh.position)
            .to(target, 1500)
            .easing(TWEEN.Easing.Exponential.InOut)
            .start();
        
        if(mesh.userData.isPhoto) {
            new TWEEN.Tween(mesh.scale)
                .to(targetScale, 1000)
                .easing(TWEEN.Easing.Back.Out)
                .start();
        }
    });
}

// --- CONTROL: Toggle Input Mode ---
function toggleInputMode() {
    if (STATE.inputMode === 'GESTURE') {
        // 切换到鼠标模式
        STATE.inputMode = 'MOUSE';
        btnInputMode.innerText = "🖱️ 鼠标模式";
        statusText.innerText = "鼠标控制中...";
        statusText.style.color = "#fff";
        gestureGuide.style.display = 'none';
        videoElement.classList.add('hidden'); // 隐藏摄像头
        videoElement.style.opacity = 0;
        
        mouseControls.style.display = 'flex'; // 显示鼠标按钮
        controlsOrbit.enabled = true; // 启用鼠标旋转
        camera.position.set(0, 20, 80); // 重置一下位置
    } else {
        // 切换回手势模式
        STATE.inputMode = 'GESTURE';
        btnInputMode.innerText = "🖐️ 手势模式";
        statusText.innerText = "等待手势...";
        gestureGuide.style.display = 'block';
        videoElement.classList.remove('hidden');
        videoElement.style.opacity = 0.7;
        
        mouseControls.style.display = 'none';
        controlsOrbit.enabled = false;
        
        // 如果手势模式下想重置状态，可以在这里加 transitionTo('TREE');
    }
}

// --- MOUSE CONTROL LOGIC ---
function onDocumentClick(event) {
    if (STATE.inputMode !== 'MOUSE' || !STATE.active) return;
    if (event.target.closest('#controls') || event.target.closest('#ui-layer button')) return; // 忽略点击UI

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
        
        if (pinchDist < 0.05 && photoMeshes.length > 0) {
            statusText.innerText = "👌 FOCUS (捏合聚焦)";
            statusText.style.color = "#0f0";
            if (STATE.mode !== 'FOCUS') {
                const idx = Math.floor(Math.random() * photoMeshes.length);
                transitionTo('FOCUS', idx);
            }
        } else if (distance < 0.25) {
            statusText.innerText = "✊ TREE (握拳聚树)";
            statusText.style.color = "#d4af37";
            transitionTo('TREE');
        } else {
            statusText.innerText = "🖐 SCATTER (张手散开)";
            statusText.style.color = "#fff";
            transitionTo('SCATTER');
        }

        // ✅ 修复：在 FOCUS 模式下，禁用相机大幅旋转，防止照片乱跑
        const handX = (landmarks[9].x - 0.5) * 2; 
        const handY = (landmarks[9].y - 0.5) * 2;
        
        if (STATE.mode === 'SCATTER') {
            STATE.rotationTarget.x = handX * 2; 
            STATE.rotationTarget.y = handY * 2;
        } else if (STATE.mode === 'FOCUS') {
            // 聚焦时，手势只能微调，不能大转
            STATE.rotationTarget.x = handX * 0.2; 
            STATE.rotationTarget.y = handY * 0.2;
        }
    } else {
        STATE.handPresent = false;
        statusText.innerText = "Waiting for hand...";
        statusText.style.color = "#aaa";
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
        // 手势模式相机逻辑
        if (STATE.mode === 'SCATTER') {
            const radius = 80;
            const targetTheta = STATE.rotationTarget.x;
            const targetPhi = STATE.rotationTarget.y;
            const timeAngle = time * 0.0001;
            
            camera.position.x += (Math.sin(targetTheta + timeAngle) * radius - camera.position.x) * 0.05;
            camera.position.z += (Math.cos(targetTheta + timeAngle) * radius - camera.position.z) * 0.05;
            camera.position.y += (-targetPhi * 20 - camera.position.y + 10) * 0.05;
            camera.lookAt(0, 0, 0);
        } else if (STATE.mode === 'FOCUS') {
            // ✅ 聚焦模式：锁定相机位置，只允许微小的漂浮感
            // 这样照片就不会因为手抖而乱动了
            // 如果手势有输入，会稍微偏移一点点
            const targetX = STATE.rotationTarget.x * 5; 
            const targetY = 10 + STATE.rotationTarget.y * 5;
            
            // 平滑归位到观察点
            camera.position.x += (0 - camera.position.x + targetX) * 0.05;
            camera.position.z += (80 - camera.position.z) * 0.05; // 保持距离
            camera.position.y += (targetY - camera.position.y) * 0.05;
            camera.lookAt(0, 10, 0);
        } else {
             // TREE Mode: 自动缓慢旋转
             const radius = 80;
             const timeAngle = time * 0.0002;
             camera.position.x = Math.sin(timeAngle) * radius;
             camera.position.z = Math.cos(timeAngle) * radius;
             camera.position.y = THREE.MathUtils.lerp(camera.position.y, 10, 0.05);
             camera.lookAt(0, 10, 0);
        }
    }

    // ✅ 聚焦照片始终看向相机 (Billboard effect)
    if (STATE.mode === 'FOCUS' && STATE.focusedPhotoIndex > -1) {
        const p = photoMeshes[STATE.focusedPhotoIndex];
        if(p) p.lookAt(camera.position);
    }

    // 粒子自旋特效
    if (STATE.mode !== 'TREE') {
        ornaments.forEach((mesh) => {
            if (mesh.userData.isPhoto && photoMeshes.indexOf(mesh) === STATE.focusedPhotoIndex) return;
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
    const treeBtn = document.getElementById('btn-tree');
    const scatterBtn = document.getElementById('btn-scatter');
    
    if (openBtn) openBtn.addEventListener('click', startGestureSystem);
    if (closeBtn) closeBtn.addEventListener('click', stopGestureSystem);
    
    // ✅ 修复：确保事件绑定正确，解决切换模式无效的问题
    if (btnInputMode) {
        btnInputMode.removeEventListener('click', toggleInputMode); // 防止重复绑定
        btnInputMode.addEventListener('click', toggleInputMode);
    }
    
    if (treeBtn) treeBtn.addEventListener('click', () => transitionTo('TREE'));
    if (scatterBtn) scatterBtn.addEventListener('click', () => transitionTo('SCATTER'));
});