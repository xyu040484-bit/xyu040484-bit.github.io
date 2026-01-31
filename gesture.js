import * as THREE from 'three';
// 引入后处理库 (Post-processing)
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
    particleCount: 1500, // 增加粒子数，更梦幻
    treeHeight: 60,
    treeRadius: 25,
    scatterRadius: 80,
    photoScale: 4.5 // 照片大小
};

// --- STATE MANAGEMENT ---
const STATE = {
    active: false,
    mode: 'TREE', // TREE, SCATTER, FOCUS
    handPresent: false,
    rotationTarget: { x: 0, y: 0 },
    focusedPhotoIndex: -1
};

// --- THREE.JS GLOBALS ---
let scene, camera, renderer, composer;
let ornaments = []; 
let photoMeshes = [];
let hands, cameraPipe, rafId;

// DOM Elements
const overlay = document.getElementById('gesture-overlay');
const container = document.getElementById('canvas-container');
const statusText = document.getElementById('status-text');
const loader = document.getElementById('gesture-loading');

// --- INIT 3D WORLD ---
function initThree() {
    if (scene) return; // 防止重复初始化

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.bg);
    scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.015);

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 80);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 优化性能
    renderer.toneMapping = THREE.ReinhardToneMapping;
    container.appendChild(renderer.domElement);

    // Post Processing (Cinematic Glow - 辉光效果)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.1;
    bloomPass.strength = 1.0; // 辉光强度
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5b6, 1.5);
    dirLight.position.set(20, 50, 20);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(CONFIG.colors.gold, 2, 100);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    // Create Base Particles (Ornaments)
    createParticles();

    // Resize Handler
    window.addEventListener('resize', onWindowResize);
}

function createParticles() {
    const geometrySphere = new THREE.SphereGeometry(0.6, 16, 16);
    const geometryBox = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    
    const matGold = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.gold, metalness: 0.9, roughness: 0.1, 
        emissive: 0xaa6600, emissiveIntensity: 0.2 
    });
    const matRed = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.red, metalness: 0.6, roughness: 0.3,
        emissive: 0x440000, emissiveIntensity: 0.2
    });
    const matGreen = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.green, metalness: 0.1, roughness: 0.9 
    });

    for (let i = 0; i < CONFIG.particleCount; i++) {
        let mesh;
        const rand = Math.random();
        if (rand < 0.5) mesh = new THREE.Mesh(geometrySphere, rand < 0.25 ? matGold : matRed);
        else mesh = new THREE.Mesh(geometryBox, rand < 0.8 ? matGreen : matGold);

        // Calculate Tree Position (Spiral Cone)
        const theta = i * 0.5 + Math.random(); 
        const y = (i / CONFIG.particleCount) * CONFIG.treeHeight - (CONFIG.treeHeight/2);
        const r = (1 - (y + CONFIG.treeHeight/2) / CONFIG.treeHeight) * CONFIG.treeRadius + Math.random() * 2;
        
        const treePos = {
            x: Math.cos(theta) * r,
            y: y,
            z: Math.sin(theta) * r
        };

        // Calculate Scatter Position
        const scatterPos = {
            x: (Math.random() - 0.5) * CONFIG.scatterRadius * 2,
            y: (Math.random() - 0.5) * CONFIG.scatterRadius * 2,
            z: (Math.random() - 0.5) * CONFIG.scatterRadius * 2
        };

        mesh.userData = {
            treePos: treePos,
            scatterPos: scatterPos,
            originalScale: mesh.scale.clone(),
            isPhoto: false
        };

        // Init at Tree Pos
        mesh.position.set(treePos.x, treePos.y, treePos.z);
        scene.add(mesh);
        ornaments.push(mesh);
    }
}

// --- PHOTO HANDLING (Modified to load from JSON) ---
async function loadPhotos() {
    try {
        const res = await fetch('data/photos.json');
        if (!res.ok) throw new Error('Fetch failed');
        const items = await res.json();
        
        // Clear old photos if any
        photoMeshes.forEach(p => { scene.remove(p); });
        photoMeshes = [];
        // Note: We don't remove from 'ornaments' array to keep particles, 
        // but we should probably filter old photos out if re-initializing.
        // For simplicity, assuming loadPhotos called once per session.

        const loader = new THREE.TextureLoader();
        
        items.forEach((item, index) => {
            // Load Thumb first for speed, or Src for quality. Let's use Src for best look in bloom.
            loader.load(item.src, (texture) => {
                createPhotoMesh(texture, index, item);
            });
        });
        
        loader.style.display = 'none';

    } catch (err) {
        console.error(err);
        statusText.innerText = "Photo load error";
    }
}

function createPhotoMesh(texture, index, itemData) {
    const aspect = texture.image.width / texture.image.height;
    const geo = new THREE.PlaneGeometry(CONFIG.photoScale * aspect, CONFIG.photoScale);
    const mat = new THREE.MeshBasicMaterial({ 
        map: texture, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9
    });
    
    const mesh = new THREE.Mesh(geo, mat);
    
    // Positions: Spiral embedded in tree
    const theta = index * 1.5; // Distribute photos
    const y = ((index / 10) - 0.5) * 40; // Spread vertically
    const r = 18 + Math.random() * 5; // Slightly outside the tree body

    mesh.userData = {
        treePos: { x: Math.cos(theta)*r, y: y, z: Math.sin(theta)*r },
        scatterPos: { 
            x: (Math.random()-0.5)*60, 
            y: (Math.random()-0.5)*60, 
            z: (Math.random()-0.5)*60 
        },
        isPhoto: true,
        originalScale: new THREE.Vector3(1,1,1),
        desc: itemData.desc // Store description
    };

    // Start at tree
    mesh.position.set(mesh.userData.treePos.x, mesh.userData.treePos.y, mesh.userData.treePos.z);
    mesh.lookAt(0,0,0);

    scene.add(mesh);
    ornaments.push(mesh);
    photoMeshes.push(mesh);
}

// --- TRANSITIONS ---
function transitionTo(newState, focusIndex = -1) {
    if (STATE.mode === newState && newState !== 'FOCUS') return;
    if (newState === 'FOCUS' && STATE.focusedPhotoIndex === focusIndex) return;

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
                // Bring to front center
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                const dist = 15;
                target = {
                    x: camera.position.x + camDir.x * dist,
                    y: camera.position.y + camDir.y * dist,
                    z: camera.position.z + camDir.z * dist
                };
                targetScale = new THREE.Vector3(2, 2, 2); // Zoom in
                mesh.lookAt(camera.position);
                
                // Show desc (Optional UI update)
                statusText.innerText = mesh.userData.desc || "Focus Mode";
                
            } else {
                target = mesh.userData.scatterPos;
            }
        }

        // Tween Position
        new TWEEN.Tween(mesh.position)
            .to(target, 1500)
            .easing(TWEEN.Easing.Exponential.InOut)
            .start();
        
        // Tween Scale (Photos only)
        if(mesh.userData.isPhoto) {
            new TWEEN.Tween(mesh.scale)
                .to(targetScale, 1000)
                .easing(TWEEN.Easing.Back.Out)
                .start();
        }
    });
}

// --- MEDIAPIPE LOGIC ---
function onResults(results) {
    if(!STATE.active) return;
    loader.style.display = 'none';

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        STATE.handPresent = true;
        const landmarks = results.multiHandLandmarks[0];

        // 1. Detect Open Palm vs Fist (Wrist to Middle Tip)
        const wrist = landmarks[0];
        const middleTip = landmarks[12];
        const distance = Math.sqrt(Math.pow(middleTip.x - wrist.x, 2) + Math.pow(middleTip.y - wrist.y, 2));

        // 2. Detect Pinch (Thumb & Index)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const pinchDist = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));
        const isPinching = pinchDist < 0.05;

        // LOGIC MAPPING
        if (isPinching && photoMeshes.length > 0) {
            statusText.innerText = "👌 FOCUS (Pinch)";
            statusText.style.color = "#0f0";
            if (STATE.mode !== 'FOCUS') {
                // Pick a random photo to focus on (or cycle)
                const idx = Math.floor(Math.random() * photoMeshes.length);
                transitionTo('FOCUS', idx);
            }
        } else if (distance < 0.25) { // Fist-like
            statusText.innerText = "✊ TREE (Fist)";
            statusText.style.color = "#d4af37";
            transitionTo('TREE');
        } else {
            statusText.innerText = "🖐 SCATTER (Open Hand)";
            statusText.style.color = "#fff";
            transitionTo('SCATTER');
        }

        // 3. Rotation Logic (Hand X/Y position)
        const handX = (landmarks[9].x - 0.5) * 2; 
        const handY = (landmarks[9].y - 0.5) * 2;
        
        if (STATE.mode === 'SCATTER' || STATE.mode === 'FOCUS') {
            STATE.rotationTarget.x = handX * 2; 
            STATE.rotationTarget.y = handY * 2;
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
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });
    hands.onResults(onResults);

    cameraPipe = new window.Camera(video, {
        onFrame: async () => { if (STATE.active) await hands.send({image: video}); },
        width: 320, height: 240
    });
}

// --- MAIN LOOP ---
function animate(time) {
    if (!STATE.active) return;
    rafId = requestAnimationFrame(animate);
    TWEEN.update(time);

    // Camera Rotation Logic
    if (STATE.mode === 'SCATTER' || STATE.mode === 'FOCUS') {
        const radius = 80;
        const targetTheta = STATE.rotationTarget.x;
        const targetPhi = STATE.rotationTarget.y;
        const timeAngle = time * 0.0001;
        
        camera.position.x += (Math.sin(targetTheta + timeAngle) * radius - camera.position.x) * 0.05;
        camera.position.z += (Math.cos(targetTheta + timeAngle) * radius - camera.position.z) * 0.05;
        camera.position.y += (-targetPhi * 20 - camera.position.y + 10) * 0.05;
        camera.lookAt(0, 0, 0);
    } else {
        // Tree mode: slow auto rotate
         const radius = 80;
         const timeAngle = time * 0.0002;
         camera.position.x = Math.sin(timeAngle) * radius;
         camera.position.z = Math.cos(timeAngle) * radius;
         camera.position.y = THREE.MathUtils.lerp(camera.position.y, 10, 0.05);
         camera.lookAt(0, 10, 0);
    }

    // Individual ornament animation (floating)
    if (STATE.mode !== 'TREE') {
        ornaments.forEach((mesh) => {
            if (mesh.userData.isPhoto && photoMeshes.indexOf(mesh) === STATE.focusedPhotoIndex) return;
            mesh.rotation.x += 0.01;
            mesh.rotation.y += 0.01;
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

// --- SYSTEM CONTROL ---
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

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('btn-open-gesture');
    const closeBtn = document.getElementById('btn-close-gesture');
    
    if (openBtn) openBtn.addEventListener('click', startGestureSystem);
    if (closeBtn) closeBtn.addEventListener('click', stopGestureSystem);
});