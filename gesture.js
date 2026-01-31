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
    mode: 'TREE',
    handPresent: false,
    rotationTarget: { x: 0, y: 0 },
    focusedPhotoIndex: -1,
    hoveredPhotoIndex: -1
};

// --- GLOBALS ---
let scene, camera, renderer, composer, controlsOrbit;
let ornaments = []; 
let photoMeshes = [];
let hands, cameraPipe, rafId;
let raycaster, mouse, handCursor, cursorMesh;

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
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.2; // 稍微调亮整体
    container.appendChild(renderer.domElement);

    // ✅ 辉光配置：既要有光，又不能瞎眼
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.6; // 阈值降低一点，让照片的微光能透出来
    bloomPass.strength = 0.8;  // 强度适中
    bloomPass.radius = 0.3;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // OrbitControls
    controlsOrbit = new OrbitControls(camera, renderer.domElement);
    controlsOrbit.enableDamping = true;
    controlsOrbit.dampingFactor = 0.05;
    controlsOrbit.enablePan = false;
    controlsOrbit.enabled = false; 

    // Raycaster & Cursor
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    handCursor = new THREE.Vector2();
    
    // ✅ 新增：手势光标 (一个小光点，方便瞄准)
    const cursorGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8 });
    cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    cursorMesh.visible = false; // 只有识别到手时才显示
    scene.add(cursorMesh);

    window.addEventListener('click', onDocumentClick);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xfff5b6, 1.0);
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
    
    // ✅ 粒子：高亮自发光，确保树上有“亮光点”
    const matGold = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.gold, metalness: 0.9, roughness: 0.1, 
        emissive: 0xffaa00, emissiveIntensity: 2.0 
    });
    const matRed = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.red, metalness: 0.6, roughness: 0.3,
        emissive: 0xff0000, emissiveIntensity: 1.5 
    });
    const matGreen = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.green, metalness: 0.1, roughness: 0.9,
        emissive: 0x004400, emissiveIntensity: 0.5 
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
    
    // ✅ 照片材质：Standard 材质 + 微弱自发光 (emissive: 0.2)
    // 这样照片既清晰，又带有一点点光感，不会死黑
    const mat = new THREE.MeshStandardMaterial({ 
        map: texture, side: THREE.DoubleSide, transparent: true, opacity: 1.0,
        roughness: 0.4, metalness: 0.1,
        emissive: 0xffffff, emissiveIntensity: 0.15 
    });
    const mesh = new THREE.Mesh(geo, mat);
    
    // 布局优化：照片稍往外放一点，更容易被发现
    const theta = index * 1.5; 
    const y = ((index / 10) - 0.5) * 40; 
    const r = 22 + Math.random() * 5; // 原来是 18，改大一点

    mesh.userData = {
        treePos: { x: Math.cos(theta)*r, y: y, z: Math.sin(theta)*r },
        scatterPos: { x: (Math.random()-0.5)*60, y: (Math.random()-0.5)*60, z: (Math.random()-0.5)*60 },
        isPhoto: true,
        originalScale: new THREE.Vector3(1,1,1),
        desc: itemData.desc
    };

    mesh.position.set(mesh.userData.treePos.x, mesh.userData.treePos.y, mesh.userData.treePos.z);
    mesh.lookAt(0,0,0); // 初始朝向中心
    
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
            // 回到树形时，照片重置朝向中心
            if(mesh.userData.isPhoto) {
                const dummyVec = new THREE.Vector3(0,0,0);
                // 简单的 lookAt 不能在 tween 中平滑过渡旋转，这里只复位位置
                // 旋转会在 loop 中动态处理（如果需要）
                // 简单起见，我们只 Tween 位置
                // mesh.lookAt(0,0,0); // 瞬间复位
            }
        } else if (newState === 'SCATTER') {
            target = mesh.userData.scatterPos;
        } else if (newState === 'FOCUS') {
            if (photoMeshes.indexOf(mesh) === focusIndex) {
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                
                // ✅ 手机/PC 适配逻辑
                const isPortrait = window.innerHeight > window.innerWidth;
                const dist = isPortrait ? 25 : 12; // 手机(竖屏)拉远距离，PC(横屏)拉近距离
                
                target = { 
                    x: camera.position.x + camDir.x * dist, 
                    y: camera.position.y + camDir.y * dist, 
                    z: camera.position.z + camDir.z * dist 
                };
                
                // 聚焦时，照片稍微放大
                const zoomScale = isPortrait ? 1.5 : 2.5; // 手机上不用放太大，因为距离拉远了
                targetScale = new THREE.Vector3(zoomScale, zoomScale, zoomScale); 
                
                mesh.lookAt(camera.position);
                statusText.innerText = mesh.userData.desc || "查看照片";
            } else {
                target = mesh.userData.scatterPos; 
            }
        }

        new TWEEN.Tween(mesh.position).to(target, 1500).easing(TWEEN.Easing.Exponential.InOut).start();
        
        if(mesh.userData.isPhoto) {
            new TWEEN.Tween(mesh.scale).to(targetScale, 1000).easing(TWEEN.Easing.Back.Out).start();
            // 如果是高亮状态，稍微增加一点发光，强调选中
            if (photoMeshes.indexOf(mesh) === focusIndex) {
               mesh.material.emissiveIntensity = 0.3;
            } else {
               mesh.material.emissiveIntensity = 0.15;
            }
        }
    });
}

// --- MOUSE CONTROL ---
function toggleInputMode() {
    if (STATE.inputMode === 'GESTURE') {
        STATE.inputMode = 'MOUSE';
        btnInputMode.innerText = "🖱️ 鼠标模式";
        statusText.innerText = "鼠标控制中...";
        statusText.style.color = "#fff";
        gestureGuide.style.display = 'none';
        videoElement.classList.add('hidden'); 
        videoElement.style.opacity = 0;
        mouseControls.style.display = 'flex';
        controlsOrbit.enabled = true;
        camera.position.set(0, 20, 80);
        cursorMesh.visible = false;
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
        
        // 1. 光标定位 (食指指尖)
        const indexTip = landmarks[8];
        // 映射坐标：Mediapipe (0~1) -> NDC (-1~1) -> 光标 3D 位置
        // 注意：Webcam 画面通常是镜像的，x 需要反转？CSS里 video 已经 scaleX(-1) 了
        // 这里的坐标逻辑：x: 0(left) -> 1(right). 
        handCursor.x = (indexTip.x - 0.5) * 2;
        handCursor.y = -(indexTip.y - 0.5) * 2; 

        // 更新光标小球位置 (投影到摄像机前方固定距离)
        const cursorDist = 30; // 光标在相机前方30单位
        const cursorVec = new THREE.Vector3(handCursor.x, handCursor.y, 0.5).unproject(camera);
        const dir = cursorVec.sub(camera.position).normalize();
        const cursorPos = camera.position.clone().add(dir.multiplyScalar(cursorDist));
        cursorMesh.position.copy(cursorPos);
        cursorMesh.visible = true;

        // 2. 射线检测 (Hover & Select)
        raycaster.setFromCamera(handCursor, camera);
        const intersects = raycaster.intersectObjects(photoMeshes);
        
        // Hover 效果 (悬停高亮)
        if (intersects.length > 0) {
            const target = intersects[0].object;
            const idx = photoMeshes.indexOf(target);
            if (STATE.hoveredPhotoIndex !== idx) {
                // 恢复上一个
                if (STATE.hoveredPhotoIndex !== -1 && photoMeshes[STATE.hoveredPhotoIndex]) {
                    photoMeshes[STATE.hoveredPhotoIndex].material.emissive.setHex(0xffffff);
                }
                // 高亮当前
                target.material.emissive.setHex(0xff00ff); // 悬停变紫红
                STATE.hoveredPhotoIndex = idx;
            }
        } else {
            if (STATE.hoveredPhotoIndex !== -1 && photoMeshes[STATE.hoveredPhotoIndex]) {
                photoMeshes[STATE.hoveredPhotoIndex].material.emissive.setHex(0xffffff);
                STATE.hoveredPhotoIndex = -1;
            }
        }

        // 3. 捏合检测
        const thumbTip = landmarks[4];
        const pinchDist = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));
        const isPinching = pinchDist < 0.08; // 放宽判定，稍微捏一下就算

        // 4. 握拳检测
        const wrist = landmarks[0];
        const middleTip = landmarks[12];
        const fistDist = Math.sqrt(Math.pow(middleTip.x - wrist.x, 2) + Math.pow(middleTip.y - wrist.y, 2));

        // --- 触发逻辑 ---
        if (isPinching) {
            if (intersects.length > 0) {
                statusText.innerText = "👌 锁定照片";
                statusText.style.color = "#0f0";
                const targetMesh = intersects[0].object;
                const idx = photoMeshes.indexOf(targetMesh);
                if (STATE.focusedPhotoIndex !== idx) transitionTo('FOCUS', idx);
            }
        } else if (fistDist < 0.25) {
            statusText.innerText = "✊ 聚树";
            transitionTo('TREE');
        } else {
            statusText.innerText = "🖐 浏览 (移动手指瞄准)";
            // 只有当前不在 FOCUS 状态，或者指向空白处时才允许 SCATTER
            if (STATE.mode === 'FOCUS' && intersects.length === 0) {
                 // 稍微延迟防误触？直接散开也行
                 transitionTo('SCATTER');
            } else if (STATE.mode !== 'FOCUS') {
                 transitionTo('SCATTER');
            }
        }

        // 5. 视角旋转 (FOCUS 模式下完全静止)
        if (STATE.mode === 'FOCUS') {
            // 静止
        } else {
            // 手势控制旋转
            const handX = (landmarks[9].x - 0.5) * 2; 
            const handY = (landmarks[9].y - 0.5) * 2;
            STATE.rotationTarget.x = handX * 2; 
            STATE.rotationTarget.y = handY * 2;
        }

    } else {
        STATE.handPresent = false;
        cursorMesh.visible = false;
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

// --- LOOP ---
function animate(time) {
    if (!STATE.active) return;
    rafId = requestAnimationFrame(animate);
    TWEEN.update(time);

    if (STATE.inputMode === 'MOUSE') {
        controlsOrbit.update();
    } else {
        if (STATE.mode === 'FOCUS') {
            // 绝对静止，仅 TWEEN 负责照片移动
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
             // Tree Auto Rotate
             const radius = 80;
             const timeAngle = time * 0.0002;
             camera.position.x = Math.sin(timeAngle) * radius;
             camera.position.z = Math.cos(timeAngle) * radius;
             camera.position.y = THREE.MathUtils.lerp(camera.position.y, 10, 0.05);
             camera.lookAt(0, 10, 0);
        }
    }

    // Billboard effect for focus
    if (STATE.mode === 'FOCUS' && STATE.focusedPhotoIndex > -1) {
        const p = photoMeshes[STATE.focusedPhotoIndex];
        if(p) p.lookAt(camera.position);
    }

    // Particles rotate
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
    
    if (btnInputMode) {
        btnInputMode.removeEventListener('click', toggleInputMode);
        btnInputMode.addEventListener('click', toggleInputMode);
    }
    
    const treeBtn = document.getElementById('btn-tree');
    const scatterBtn = document.getElementById('btn-scatter');
    if (treeBtn) treeBtn.addEventListener('click', () => transitionTo('TREE'));
    if (scatterBtn) scatterBtn.addEventListener('click', () => transitionTo('SCATTER'));
});