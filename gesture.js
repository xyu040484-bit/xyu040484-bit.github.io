import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 数值保持您调教的版本
const CONFIG = {
  rotSpeed: 0.005,
  zoomSensitivity: 1.0,
  autoSnapDist: 10,
  mouseReturnDist: 15,
  flightSpeed: 0.08,
  anchorDist: 4.5
};

const STATE = {
  active: false,
  mode: 'GESTURE',
  radius: 40,
  targetRadius: 40,
  isFlying: false, flyTargetPos: new THREE.Vector3(), flyTargetLook: new THREE.Vector3(),
  isAnchored: false, anchorTarget: null, isZoomingOut: false
};

let scene, camera, renderer, treeGroup, controls, raycaster, pointer;
let photoObjects = [], hands, cameraPipe, rafId;

// DOM 元素
const overlay = document.getElementById('gesture-overlay');
const captionEl = document.getElementById('gesture-caption');
const hudBorder = document.getElementById('hud-border');
const lockStatus = document.getElementById('lock-status');
const loadingEl = document.getElementById('gesture-loading');

// 1. 初始化 3D 场景
function init3D() {
  if (scene) return;
  scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, 0.01);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, STATE.radius);

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas-layer'), antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // 粒子星空
  treeGroup = new THREE.Group();
  const geo = new THREE.BufferGeometry(), pos = [], col = [];
  const c1 = new THREE.Color(0x00ffcc), c2 = new THREE.Color(0x9900ff);
  for (let i = 0; i < 5000; i++) {
    const t = i / 5000;
    const r = (1 - t) * 7 + (Math.random() - 0.5);
    const a = t * Math.PI * 40;
    pos.push(r * Math.cos(a), t * 18 - 9, r * Math.sin(a));
    const c = Math.random() > 0.5 ? c1 : c2;
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  treeGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.25, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  scene.add(treeGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.05; controls.enablePan = false;
  controls.zoomSpeed = 3.0;
  controls.minDistance = 2; controls.maxDistance = 60;
  controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
  controls.enabled = false;

  raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('click', checkIntersection);
  window.addEventListener('touchstart', (e) => {
    pointer.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
    checkIntersection();
  });
  window.addEventListener('resize', onResize);
}

// 2. 加载照片 (高清修复版)
async function loadPhotos() {
  try {
    const res = await fetch('data/photos.json');
    if (!res.ok) throw new Error('Load failed');
    const items = await res.json();
    
    photoObjects.forEach(p => treeGroup.remove(p)); photoObjects = [];

    // 预加载所有图片
    const promises = items.map((item, index) => {
      return new Promise((resolve) => {
        const t = index / items.length;
        const r = (1 - t) * 7; 
        const angle = t * Math.PI * 10; // 这里的 10 可以调大让螺旋更密
        
        // ✅ 升级：大幅提升画布分辨率 (从300升至800)，保证放大后清晰
        const canvas = document.createElement('canvas'); 
        canvas.width = 800; canvas.height = 960; 
        const ctx = canvas.getContext('2d');
        
        const img = new Image();
        img.crossOrigin = "Anonymous";
        
        // ✅ 关键修复：强制加载 src (高清原图)，不再用 thumb
        img.src = item.src;

        img.onload = () => {
          // 绘制高清拍立得边框
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 800, 960);
          ctx.fillStyle = "#111"; ctx.fillRect(40, 40, 720, 720);
          
          // 绘制高清图片
          ctx.drawImage(img, 40, 40, 720, 720);

          const tex = new THREE.CanvasTexture(canvas); 
          tex.colorSpace = THREE.SRGBColorSpace;
          // 开启各向异性过滤，让侧面看也清晰
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          
          const mat = new THREE.SpriteMaterial({ map: tex });
          const sprite = new THREE.Sprite(mat);
          
          // 位置
          sprite.position.set((r + 0.5) * Math.cos(angle), t * 18 - 9, (r + 0.5) * Math.sin(angle));
          
          // 尺寸保持不变 (物理尺寸)
          sprite.scale.set(3, 3.6, 1);
          
          sprite.userData = { 
            id: index, 
            desc: item.desc || item.title || "No Desc", 
            orgScale: { x: 3, y: 3.6 } 
          };
          
          treeGroup.add(sprite);
          photoObjects.push(sprite);
          resolve();
        };
        img.onerror = resolve; // 即使失败也继续，避免卡死
      });
    });

    await Promise.all(promises);
    loadingEl.style.display = 'none';

  } catch (e) { 
    console.error(e); 
    loadingEl.innerText = "照片数据加载失败"; 
  }
}

// 3. 高亮逻辑
function highlightPhoto(target) {
  photoObjects.forEach(p => {
    p.renderOrder = 0; p.material.depthTest = true; 
    p.scale.set(p.userData.orgScale.x, p.userData.orgScale.y, 1); 
    p.material.opacity = target ? 0.3 : 1;
  });
  
  if (target) {
    target.renderOrder = 999; target.material.depthTest = false; target.material.opacity = 1;
    // 放大倍数
    target.scale.set(3.5, 4.2, 1);
    captionEl.innerText = target.userData.desc; captionEl.style.opacity = 1;
  } else { captionEl.style.opacity = 0; }
}

function flyToPhoto(obj) {
  STATE.isFlying = true; highlightPhoto(obj);
  const tPos = new THREE.Vector3(); obj.getWorldPosition(tPos);
  const dir = tPos.clone().normalize();
  STATE.flyTargetPos.copy(tPos).add(dir.multiplyScalar(CONFIG.anchorDist));
  STATE.flyTargetLook.copy(tPos);
  STATE.targetRadius = STATE.flyTargetPos.length(); STATE.radius = STATE.targetRadius;
  if (STATE.mode === 'GESTURE') engageAnchor(obj);
}

function engageAnchor(target) { STATE.isAnchored = true; STATE.anchorTarget = target; highlightPhoto(target); lockStatus.style.display = 'block'; hudBorder.style.display = 'block'; }
function releaseAnchor() { STATE.isAnchored = false; STATE.anchorTarget = null; highlightPhoto(null); lockStatus.style.display = 'none'; hudBorder.style.display = 'none'; }

function animate() {
  if (!STATE.active) return;
  rafId = requestAnimationFrame(animate);
  
  if (STATE.isFlying) {
    camera.position.lerp(STATE.flyTargetPos, CONFIG.flightSpeed);
    if (STATE.mode === 'MOUSE') { controls.target.lerp(STATE.flyTargetLook, CONFIG.flightSpeed); controls.update(); } else { camera.lookAt(STATE.flyTargetLook); }
    if (camera.position.distanceTo(STATE.flyTargetPos) < 0.1) STATE.isFlying = false;
    renderer.render(scene, camera); return;
  }
  
  if (STATE.mode === 'GESTURE') {
    if (STATE.isZoomingOut && STATE.isAnchored) releaseAnchor();
    if (STATE.isAnchored && STATE.anchorTarget) {
      const tPos = new THREE.Vector3(); STATE.anchorTarget.getWorldPosition(tPos);
      const ideal = tPos.clone().add(tPos.clone().normalize().multiplyScalar(CONFIG.anchorDist));
      camera.position.lerp(ideal, 0.1); camera.lookAt(tPos);
    } else {
      treeGroup.rotation.y += 0.003; 
      STATE.radius += (STATE.targetRadius - STATE.radius) * 0.1;
      camera.position.set(0, 0, STATE.radius); camera.lookAt(0, 0, 0);
      if (STATE.radius < CONFIG.autoSnapDist && !STATE.isZoomingOut) {
        let closest = null, minD = Infinity;
        photoObjects.forEach(p => { const d = camera.position.distanceTo(p.position); if (d < minD) { minD = d; closest = p; } });
        if (closest && minD < 6) engageAnchor(closest);
      }
    }
  } else {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(photoObjects);
    document.body.style.cursor = hits.length > 0 ? 'pointer' : 'default';
    controls.update();
    const distToCenter = camera.position.length();
    if (distToCenter > CONFIG.mouseReturnDist && controls.target.length() > 0.1) {
       controls.target.lerp(new THREE.Vector3(0,0,0), 0.05);
       highlightPhoto(null);
    }
  }
  renderer.render(scene, camera);
}

// 4. 手势
async function initHands() {
  if (hands) return;
  const video = document.getElementById('input-video'), canvas = document.getElementById('output-canvas'), ctx = canvas.getContext('2d'), hudText = document.getElementById('zoom-status');
  hands = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  hands.onResults(results => {
    if (!STATE.active || STATE.mode === 'MOUSE') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    if (results.multiHandLandmarks.length > 0) {
      const lm = results.multiHandLandmarks[0];
      window.drawConnectors(ctx, lm, window.HAND_CONNECTIONS, { color: '#00ffcc', lineWidth: 2 });
      window.drawLandmarks(ctx, lm, { color: '#fff', radius: 2 });
      const d = Math.sqrt(Math.pow(lm[8].x - lm[4].x, 2) + Math.pow(lm[8].y - lm[4].y, 2));
      if (d > 0.25) { 
        STATE.isZoomingOut = false; 
        if (!STATE.isAnchored) { STATE.targetRadius -= CONFIG.zoomSensitivity; if (STATE.targetRadius < 3) STATE.targetRadius = 3; hudText.innerText = "ZOOM IN"; hudText.style.color = "#0f0"; } 
        else { hudText.innerText = "VIEWING"; hudText.style.color = "#0f0"; }
      } else if (d < 0.22) { 
        STATE.isZoomingOut = true; 
        STATE.targetRadius += CONFIG.zoomSensitivity; 
        if (STATE.targetRadius > 50) STATE.targetRadius = 50; 
        hudText.innerText = "ZOOM OUT"; hudText.style.color = "#f55"; 
      } else { STATE.isZoomingOut = false; hudText.innerText = "HOLD"; hudText.style.color = "#ccc"; }
    } else { hudText.innerText = "NO HAND"; hudText.style.color = "#555"; }
  });
  cameraPipe = new window.Camera(video, { onFrame: async () => { if (STATE.active) await hands.send({ image: video }) }, width: 320, height: 240 });
}

function onPointerMove(e) { pointer.x = (e.clientX / window.innerWidth) * 2 - 1; pointer.y = -(e.clientY / window.innerHeight) * 2 + 1; }
function checkIntersection() { raycaster.setFromCamera(pointer, camera); const intersects = raycaster.intersectObjects(photoObjects); if (intersects.length > 0) flyToPhoto(intersects[0].object); }
function onResize() { if (!camera) return; camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

async function startGestureSystem() {
  overlay.style.display = 'block'; STATE.active = true; document.body.style.overflow = 'hidden';
  init3D(); await loadPhotos(); await initHands(); cameraPipe.start(); animate();
}
function stopGestureSystem() {
  overlay.style.display = 'none'; STATE.active = false; document.body.style.overflow = ''; if (rafId) cancelAnimationFrame(rafId);
}

document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('btn-open-gesture');
  const closeBtn = document.getElementById('btn-close-gesture');
  const modeBtn = document.getElementById('mode-switch');
  
  if (openBtn) openBtn.addEventListener('click', startGestureSystem);
  if (closeBtn) closeBtn.addEventListener('click', stopGestureSystem);
  
  if (modeBtn) {
    modeBtn.onclick = () => {
      if (STATE.mode === 'GESTURE') {
        STATE.mode = 'MOUSE'; controls.enabled = true; document.getElementById('hud-container').style.opacity = 0; modeBtn.innerHTML = '<span id="mode-icon">🖱️</span> 鼠标模式'; releaseAnchor();
      } else {
        STATE.mode = 'GESTURE'; controls.enabled = false; STATE.targetRadius = camera.position.distanceTo(new THREE.Vector3(0, 0, 0)); STATE.radius = STATE.targetRadius; document.getElementById('hud-container').style.opacity = 1; modeBtn.innerHTML = '<span id="mode-icon">🖐️</span> 手势模式';
      }
    };
  }
});