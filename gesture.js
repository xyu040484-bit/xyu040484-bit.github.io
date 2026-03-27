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
    lastFocusedIndices: []
};

// --- GLOBALS ---
let scene, camera, renderer, composer, controlsOrbit;
let ornaments = [];
let photoMeshes = [];
let hands, cameraPipe, rafId;
let raycaster, mouse;
let ambientLight, dirLight, pointLight;
let resizeHandlerBound = false;
let clickHandlerBound = false;
let photosLoaded = false;

// DOM
const overlay = document.getElementById('gesture-overlay');
const container = document.getElementById('canvas-container');
const statusText = document.getElementById('status-text');
const loader = document.getElementById('gesture-loading');
const videoElement = document.getElementById('video-input');
const gestureGuide = document.getElementById('gesture-guide');
const mouseControls = document.getElementById('mouse-controls');
const btnInputMode = document.getElementById('btn-input-mode');

// --- HELPERS ---
function stopAllTweens() {
    if (typeof TWEEN !== 'undefined' && typeof TWEEN.removeAll === 'function') {
        TWEEN.removeAll();
    }
}

function resetStateForOpen() {
    STATE.active = true;
    STATE.mode = 'TREE';
    STATE.handPresent = false;
    STATE.focusedPhotoIndex = -1;
    STATE.lastFocusedIndices = [];
    STATE.rotationTarget = { x: 0, y: 0 };
}

function resetUIForOpen() {
    loader.style.display = 'block';
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';

    if (STATE.inputMode === 'GESTURE') {
        btnInputMode.innerText = '🖐️ 手势模式';
        statusText.innerText = '等待手势...';
        gestureGuide.style.display = 'block';
        videoElement.style.opacity = 0.7;
        mouseControls.style.display = 'none';
        if (controlsOrbit) controlsOrbit.enabled = false;
    } else {
        btnInputMode.innerText = '🖱️ 鼠标模式';
        statusText.innerText = '鼠标控制中...';
        gestureGuide.style.display = 'none';
        videoElement.style.opacity = 0;
        mouseControls.style.display = 'flex';
        if (controlsOrbit) controlsOrbit.enabled = true;
    }
}

function disposeMaterial(material) {
    if (!material) return;

    if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
        return;
    }

    if (material.map) {
        material.map.dispose();
    }
    material.dispose();
}

function clearPhotoMeshes() {
    photoMeshes.forEach(mesh => {
        if (!mesh) return;

        if (scene) {
            scene.remove(mesh);
        }

        if (mesh.geometry) {
            mesh.geometry.dispose();
        }

        if (mesh.material) {
            disposeMaterial(mesh.material);
        }
    });

    ornaments = ornaments.filter(mesh => !mesh.userData?.isPhoto);
    photoMeshes = [];
    STATE.focusedPhotoIndex = -1;
    STATE.lastFocusedIndices = [];
    photosLoaded = false;
}

function clearNonPhotoOrnaments() {
    ornaments.forEach(mesh => {
        if (!mesh || mesh.userData?.isPhoto) return;

        if (scene) {
            scene.remove(mesh);
        }

        if (mesh.geometry) {
            mesh.geometry.dispose();
        }

        if (mesh.material) {
            disposeMaterial(mesh.material);
        }
    });

    ornaments = ornaments.filter(mesh => mesh.userData?.isPhoto);
}

function stopVideoStream() {
    const stream = videoElement?.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach(track => track.stop());
    }
    if (videoElement) {
        videoElement.srcObject = null;
    }
}

function resetSceneTransforms() {
    ornaments.forEach(mesh => {
        if (!mesh || !mesh.userData) return;

        const { treePos, originalScale, isPhoto } = mesh.userData;
        if (treePos) {
            mesh.position.set(treePos.x, treePos.y, treePos.z);
        }

        if (isPhoto) {
            mesh.scale.set(0, 0, 0);
        } else if (originalScale) {
            mesh.scale.copy(originalScale);
        }

        if (isPhoto) {
            mesh.lookAt(0, 0, 0);
        }
    });
}

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
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,
        0.4,
        0.85
    );
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

    ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0xfff5b6, 1.5);
    dirLight.position.set(20, 50, 20);
    scene.add(dirLight);

    pointLight = new THREE.PointLight(CONFIG.colors.gold, 2, 100);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    createParticles();

    if (!clickHandlerBound) {
        window.addEventListener('click', onDocumentClick);
        clickHandlerBound = true;
    }

    if (!resizeHandlerBound) {
        window.addEventListener('resize', onWindowResize);
        resizeHandlerBound = true;
    }
}

function createParticles() {
    const geometrySphere = new THREE.SphereGeometry(0.6, 16, 16);
    const geometryBox = new THREE.BoxGeometry(0.9, 0.9, 0.9);

    const matGold = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.gold,
        metalness: 0.9,
        roughness: 0.1,
        emissive: 0xffaa00,
        emissiveIntensity: 4.0
    });
    const matRed = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.red,
        metalness: 0.6,
        roughness: 0.3,
        emissive: 0xff0000,
        emissiveIntensity: 3.0
    });
    const matGreen = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.green,
        metalness: 0.1,
        roughness: 0.9,
        emissive: 0x004400,
        emissiveIntensity: 1.0
    });

    for (let i = 0; i < CONFIG.particleCount; i++) {
        let mesh;
        const rand = Math.random();

        if (rand < 0.5) {
            mesh = new THREE.Mesh(geometrySphere, rand < 0.25 ? matGold : matRed);
        } else {
            mesh = new THREE.Mesh(geometryBox, rand < 0.8 ? matGreen : matGold);
        }

        const theta = i * 0.5 + Math.random();
        const y = (i / CONFIG.particleCount) * CONFIG.treeHeight - (CONFIG.treeHeight / 2);
        const r = (1 - (y + CONFIG.treeHeight / 2) / CONFIG.treeHeight) * CONFIG.treeRadius + Math.random() * 2;

        const treePos = {
            x: Math.cos(theta) * r,
            y: y + 15,
            z: Math.sin(theta) * r
        };

        const scatterPos = {
            x: (Math.random() - 0.5) * CONFIG.scatterRadius * 2,
            y: (Math.random() - 0.5) * CONFIG.scatterRadius * 2,
            z: (Math.random() - 0.5) * CONFIG.scatterRadius * 2
        };

        mesh.userData = {
            treePos,
            scatterPos,
            originalScale: mesh.scale.clone(),
            isPhoto: false
        };

        mesh.position.set(treePos.x, treePos.y, treePos.z);
        scene.add(mesh);
        ornaments.push(mesh);
    }
}

async function loadPhotos() {
    try {
        loader.style.display = 'block';

        const res = await fetch('data/photos.json');
        if (!res.ok) {
            throw new Error('Fetch failed');
        }

        const items = await res.json();

        clearPhotoMeshes();

        const textureLoader = new THREE.TextureLoader();

        await Promise.all(
            items.map((item, index) => {
                return new Promise((resolve, reject) => {
                    textureLoader.load(
                        item.src,
                        (texture) => {
                            createPhotoMesh(texture, index, item);
                            resolve();
                        },
                        undefined,
                        (err) => reject(err)
                    );
                });
            })
        );

        photosLoaded = true;
        loader.style.display = 'none';
    } catch (err) {
        console.error(err);
        loader.style.display = 'none';
        statusText.innerText = 'Error loading photos';
    }
}

function createPhotoMesh(texture, index, itemData) {
    const aspect = texture.image.width / texture.image.height;
    const geo = new THREE.PlaneGeometry(CONFIG.photoScale * aspect, CONFIG.photoScale);

    const mat = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        fog: false,
        color: 0xd9d9d9
    });

    const mesh = new THREE.Mesh(geo, mat);

    const theta = index * 1.5;
    const y = ((index / 10) - 0.5) * 40;
    const r = 15 + Math.random() * 8;

    const treePos = {
        x: Math.cos(theta) * r,
        y: y + 15,
        z: Math.sin(theta) * r
    };

    const scatterPos = {
        x: (Math.random() - 0.5) * 80,
        y: (Math.random() - 0.5) * 20,
        z: (Math.random() - 0.5) * 40 + 20
    };

    mesh.userData = {
        treePos,
        scatterPos,
        isPhoto: true,
        originalScale: new THREE.Vector3(1, 1, 1),
        desc: itemData.desc,
        aspect: aspect
    };

    mesh.position.set(treePos.x, treePos.y, treePos.z);
    mesh.lookAt(0, 0, 0);
    mesh.scale.set(0, 0, 0);

    scene.add(mesh);
    ornaments.push(mesh);
    photoMeshes.push(mesh);
}

// --- 状态逻辑锁 ---
function transitionTo(newState, focusIndex = -1) {
    if (!scene || !camera) return;
    if (STATE.mode === newState && newState !== 'FOCUS') return;

    STATE.mode = newState;
    STATE.focusedPhotoIndex = focusIndex;

    stopAllTweens();

    ornaments.forEach(mesh => {
        let target;
        let targetScale = mesh.userData.originalScale;

        if (newState === 'TREE') {
            target = mesh.userData.treePos;

            if (mesh.userData.isPhoto) {
                targetScale = new THREE.Vector3(0, 0, 0);
            }
        } else if (newState === 'SCATTER') {
            target = mesh.userData.scatterPos;

            if (mesh.userData.isPhoto) {
                targetScale = new THREE.Vector3(1, 1, 1);
            }
        } else if (newState === 'FOCUS') {
            if (photoMeshes.indexOf(mesh) === focusIndex) {
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);

                const screenAspect = window.innerWidth / window.innerHeight;
                const photoAspect = mesh.userData.aspect;
                let dist = CONFIG.focus.pcDist;

                if (screenAspect < photoAspect) {
                    dist = CONFIG.focus.mobileDist * (photoAspect / screenAspect) * 0.6;
                } else if (screenAspect < 1.0) {
                    dist = CONFIG.focus.mobileDist;
                }

                dist = Math.max(15, Math.min(dist, 60));

                target = {
                    x: camera.position.x + camDir.x * dist,
                    y: camera.position.y + camDir.y * dist,
                    z: camera.position.z + camDir.z * dist
                };

                targetScale = new THREE.Vector3(
                    CONFIG.focus.scale,
                    CONFIG.focus.scale,
                    CONFIG.focus.scale
                );

                mesh.lookAt(camera.position);
                statusText.innerText = mesh.userData.desc || '查看照片';
            } else {
                target = {
                    x: mesh.position.x,
                    y: mesh.position.y,
                    z: mesh.position.z
                };

                if (mesh.userData.isPhoto) {
                    targetScale = new THREE.Vector3(0, 0, 0);
                }
            }
        }

        new TWEEN.Tween(mesh.position)
            .to(target, 1500)
            .easing(TWEEN.Easing.Exponential.InOut)
            .start();

        if (mesh.userData.isPhoto) {
            new TWEEN.Tween(mesh.scale)
                .to(targetScale, 1000)
                .easing(TWEEN.Easing.Back.Out)
                .start();
        }
    });
}

// --- 手势判定逻辑 (状态锁) ---
function detectGesture(landmarks) {
    const wrist = landmarks[0];
    const middleTip = landmarks[12];
    const distance = Math.sqrt(
        Math.pow(middleTip.x - wrist.x, 2) +
        Math.pow(middleTip.y - wrist.y, 2)
    );

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinchDist = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2)
    );

    if (pinchDist < 0.05) return 'PINCH';
    if (distance < 0.25) return 'FIST';
    return 'OPEN';
}

function onResults(results) {
    if (!STATE.active || STATE.inputMode === 'MOUSE') return;

    loader.style.display = 'none';

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        STATE.handPresent = true;
        const landmarks = results.multiHandLandmarks[0];
        const rawGesture = detectGesture(landmarks);

        if (rawGesture === 'FIST') {
            statusText.innerText = '✊ 聚树';
            statusText.style.color = '#d4af37';

            if (STATE.mode !== 'TREE') {
                transitionTo('TREE');
            }
        } else if (rawGesture === 'OPEN') {
            statusText.innerText = '🖐 浏览 (张手)';
            statusText.style.color = '#fff';

            if (STATE.mode === 'TREE' || STATE.mode === 'FOCUS') {
                transitionTo('SCATTER');
            }
        } else if (rawGesture === 'PINCH') {
            statusText.innerText = '👌 锁定 (捏合)';
            statusText.style.color = '#0f0';

            if (STATE.mode === 'SCATTER') {
                const indexTip = landmarks[8];
                const handCursor = {
                    x: (indexTip.x - 0.5) * 2,
                    y: -(indexTip.y - 0.5) * 2
                };

                raycaster.setFromCamera(handCursor, camera);
                const intersects = raycaster.intersectObjects(photoMeshes);

                if (intersects.length > 0) {
                    const targetMesh = intersects[0].object;
                    const idx = photoMeshes.indexOf(targetMesh);

                    if (STATE.focusedPhotoIndex !== idx) {
                        transitionTo('FOCUS', idx);
                    }
                } else {
                    const bestIdx = findBestPhotoToFocus();
                    if (bestIdx !== -1 && STATE.focusedPhotoIndex !== bestIdx) {
                        transitionTo('FOCUS', bestIdx);
                    }
                }
            } else if (STATE.mode === 'FOCUS') {
                const indexTip = landmarks[8];
                const handCursor = {
                    x: (indexTip.x - 0.5) * 2,
                    y: -(indexTip.y - 0.5) * 2
                };

                raycaster.setFromCamera(handCursor, camera);
                const intersects = raycaster.intersectObjects(photoMeshes);

                if (intersects.length > 0) {
                    const targetMesh = intersects[0].object;
                    const idx = photoMeshes.indexOf(targetMesh);

                    if (STATE.focusedPhotoIndex !== idx) {
                        transitionTo('FOCUS', idx);
                    }
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
        statusText.innerText = '请举起手...';
        statusText.style.color = '#fff';
    }
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
        if (candidates.length > 1 && candidates[1].angle < 0.5) {
            best = candidates[1];
        }
    }

    STATE.lastFocusedIndices = [best.index];
    return best.index;
}

function toggleInputMode() {
    if (STATE.inputMode === 'GESTURE') {
        STATE.inputMode = 'MOUSE';
        btnInputMode.innerText = '🖱️ 鼠标模式';
        statusText.innerText = '鼠标控制中...';
        gestureGuide.style.display = 'none';
        videoElement.style.opacity = 0;
        mouseControls.style.display = 'flex';

        if (controlsOrbit) {
            controlsOrbit.enabled = true;
        }

        camera.position.set(0, 20, 80);
    } else {
        STATE.inputMode = 'GESTURE';
        btnInputMode.innerText = '🖐️ 手势模式';
        statusText.innerText = '等待手势...';
        gestureGuide.style.display = 'block';
        videoElement.style.opacity = 0.7;
        mouseControls.style.display = 'none';

        if (controlsOrbit) {
            controlsOrbit.enabled = false;
        }
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
    } else if (STATE.mode === 'FOCUS') {
        transitionTo('SCATTER');
    }
}

async function initHands() {
    if (hands) return;

    const video = document.getElementById('video-input');

    hands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onResults);

    cameraPipe = new window.Camera(video, {
        onFrame: async () => {
            if (STATE.active) {
                await hands.send({ image: video });
            }
        },
        width: 320,
        height: 240
    });
}

function animate(time) {
    if (!STATE.active) return;

    rafId = requestAnimationFrame(animate);
    TWEEN.update(time);

    if (STATE.inputMode === 'MOUSE') {
        if (controlsOrbit) {
            controlsOrbit.update();
        }
    } else {
        if (STATE.mode === 'FOCUS') {
            // 聚焦时保持静止
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
        if (p) {
            p.lookAt(camera.position);
        }
    }

    if (STATE.mode !== 'TREE' && STATE.mode !== 'FOCUS') {
        ornaments.forEach(mesh => {
            mesh.rotation.x += 0.01;
            mesh.rotation.y += 0.01;
        });
    }

    if (composer) {
        composer.render();
    }
}

function onWindowResize() {
    if (!camera || !renderer || !composer) return;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

function disposeThree() {
    stopAllTweens();

    if (clickHandlerBound) {
        window.removeEventListener('click', onDocumentClick);
        clickHandlerBound = false;
    }

    if (resizeHandlerBound) {
        window.removeEventListener('resize', onWindowResize);
        resizeHandlerBound = false;
    }

    clearPhotoMeshes();
    clearNonPhotoOrnaments();

    if (controlsOrbit) {
        controlsOrbit.dispose();
        controlsOrbit = null;
    }

    if (composer) {
        composer = null;
    }

    if (renderer) {
        renderer.dispose();

        if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }

        renderer = null;
    }

    ambientLight = null;
    dirLight = null;
    pointLight = null;
    raycaster = null;
    mouse = null;
    scene = null;
    camera = null;
}

async function startGestureSystem() {
    if (STATE.active) return;

    resetStateForOpen();
    resetUIForOpen();

    initThree();
    resetSceneTransforms();

    await loadPhotos();
    await initHands();

    if (cameraPipe && typeof cameraPipe.start === 'function') {
        await cameraPipe.start();
    }

    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    animate();
}

function stopGestureSystem() {
    overlay.style.display = 'none';
    STATE.active = false;
    document.body.style.overflow = '';
    statusText.style.color = '#fff';

    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }

    stopAllTweens();

    if (cameraPipe && typeof cameraPipe.stop === 'function') {
        cameraPipe.stop();
    }

    stopVideoStream();

    disposeThree();
}

document.addEventListener('DOMContentLoaded', () => {
    const openBtn = document.getElementById('btn-open-gesture');
    const closeBtn = document.getElementById('btn-close-gesture');

    if (openBtn) {
        openBtn.addEventListener('click', startGestureSystem);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', stopGestureSystem);
    }

    if (btnInputMode) {
        btnInputMode.removeEventListener('click', toggleInputMode);
        btnInputMode.addEventListener('click', toggleInputMode);
    }

    const treeBtn = document.getElementById('btn-tree');
    const scatterBtn = document.getElementById('btn-scatter');

    if (treeBtn) {
        treeBtn.addEventListener('click', () => transitionTo('TREE'));
    }

    if (scatterBtn) {
        scatterBtn.addEventListener('click', () => transitionTo('SCATTER'));
    }
});