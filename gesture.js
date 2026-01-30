import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CONFIG = { rotSpeed: 0.002, zoomSensitivity: 1.0, autoSnapDist: 10, mouseReturnDist: 15, flightSpeed: 0.08, anchorDist: 5.5 };
const STATE = { active: false, mode: 'GESTURE', radius: 40, targetRadius: 40, isFlying: false, flyTargetPos: new THREE.Vector3(), flyTargetLook: new THREE.Vector3(), isAnchored: false, anchorTarget: null, isZoomingOut: false };

let scene, camera, renderer, treeGroup, controls, raycaster, pointer;
let photoObjects = [], hands, cameraPipe, rafId;

const overlay = document.getElementById('gesture-overlay');
const captionEl = document.getElementById('gesture-caption');
const hudBorder = document.getElementById('hud-border');
const lockStatus = document.getElementById('lock-status');
const loadingEl = document.getElementById('gesture-loading');

function init3D() {
  if (scene) return;
  scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, 0.015);
  camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, STATE.radius);
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas-layer'), antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  treeGroup = new THREE.Group();
  const geo = new THREE.BufferGeometry(), pos = [], col = [];
  const c1 = new THREE.Color(0x00ffcc), c2 = new THREE.Color(0x9900ff);
  for(let i=0; i<3000; i++){
    const t=i/3000, r=(1-t)*12+(Math.random()-0.5)*2, a=t*Math.PI*30+Math.random(), y=t*24-12;
    pos.push(r*Math.cos(a), y, r*Math.sin(a));
    const c=Math.random()>0.5?c1:c2; col.push(c.r,c.g,c.b);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  treeGroup.add(new THREE.Points(geo, new THREE.PointsMaterial({size:0.15, vertexColors:true, blending:THREE.AdditiveBlending, depthWrite:false})));
  scene.add(treeGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=0.05; controls.enablePan=false; controls.minDistance=2; controls.maxDistance=60; controls.enabled=false;

  raycaster = new THREE.Raycaster(); pointer = new THREE.Vector2();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('click', checkIntersection);
  window.addEventListener('touchstart', (e)=>{ pointer.x=(e.touches[0].clientX/window.innerWidth)*2-1; pointer.y=-(e.touches[0].clientY/window.innerHeight)*2+1; checkIntersection(); });
  window.addEventListener('resize', onResize);
}

async function loadPhotos() {
  try {
    const res = await fetch('data/photos.json');
    if(!res.ok) throw new Error('Load failed');
    const items = await res.json();
    photoObjects.forEach(p=>treeGroup.remove(p)); photoObjects=[];
    
    items.forEach((item, index) => {
      const t=index/items.length, r=(1-t)*10+2, angle=t*Math.PI*10, y=t*20-10;
      const canvas=document.createElement('canvas'); canvas.width=300; canvas.height=360;
      const ctx=canvas.getContext('2d');
      const img=new Image(); img.crossOrigin="Anonymous"; img.src=item.url;
      img.onload=()=>{
        ctx.fillStyle="#fff"; ctx.fillRect(0,0,300,360);
        ctx.drawImage(img,15,15,270,270);
        const tex=new THREE.CanvasTexture(canvas); tex.colorSpace=THREE.SRGBColorSpace;
        const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex}));
        sprite.position.set(r*Math.cos(angle), y, r*Math.sin(angle));
        sprite.scale.set(4, 4.8, 1);
        sprite.userData={id:index, desc:item.desc||item.title||"No Desc", orgScale:{x:4,y:4.8}};
        treeGroup.add(sprite); photoObjects.push(sprite);
      };
    });
    loadingEl.style.display='none';
  } catch(e) { console.error(e); loadingEl.innerText="Load Failed"; }
}

function highlightPhoto(target) {
  photoObjects.forEach(p => {
    p.renderOrder=0; p.material.depthTest=true; p.scale.set(p.userData.orgScale.x, p.userData.orgScale.y, 1); p.material.opacity=target?0.3:1;
  });
  if(target) {
    target.renderOrder=999; target.material.depthTest=false; target.material.opacity=1; target.scale.set(p=>p.x*1.2, p=>p.y*1.2, 1);
    captionEl.innerText = target.userData.desc; captionEl.style.opacity = 1;
  } else { captionEl.style.opacity = 0; }
}

function flyToPhoto(obj) {
  STATE.isFlying=true; highlightPhoto(obj);
  const tPos=new THREE.Vector3(); obj.getWorldPosition(tPos);
  const dir=tPos.clone().normalize();
  STATE.flyTargetPos.copy(tPos).add(dir.multiplyScalar(CONFIG.anchorDist));
  STATE.flyTargetLook.copy(tPos);
  STATE.targetRadius=STATE.flyTargetPos.length(); STATE.radius=STATE.targetRadius;
  if(STATE.mode==='GESTURE') engageAnchor(obj);
}

function engageAnchor(target) { STATE.isAnchored=true; STATE.anchorTarget=target; highlightPhoto(target); lockStatus.style.display='block'; hudBorder.style.display='block'; }
function releaseAnchor() { STATE.isAnchored=false; STATE.anchorTarget=null; highlightPhoto(null); lockStatus.style.display='none'; hudBorder.style.display='none'; }

function animate() {
  if(!STATE.active) return;
  rafId = requestAnimationFrame(animate);
  if(STATE.isFlying) {
    camera.position.lerp(STATE.flyTargetPos, CONFIG.flightSpeed);
    if(STATE.mode==='MOUSE') { controls.target.lerp(STATE.flyTargetLook, CONFIG.flightSpeed); controls.update(); } else { camera.lookAt(STATE.flyTargetLook); }
    if(camera.position.distanceTo(STATE.flyTargetPos)<0.1) STATE.isFlying=false;
    renderer.render(scene, camera); return;
  }
  if(STATE.mode==='GESTURE') {
    if(STATE.isZoomingOut && STATE.isAnchored) releaseAnchor();
    if(STATE.isAnchored && STATE.anchorTarget) {
      const tPos=new THREE.Vector3(); STATE.anchorTarget.getWorldPosition(tPos);
      const ideal=tPos.clone().add(tPos.clone().normalize().multiplyScalar(CONFIG.anchorDist));
      camera.position.lerp(ideal, 0.1); camera.lookAt(tPos);
    } else {
      treeGroup.rotation.y+=0.002; STATE.radius+=(STATE.targetRadius-STATE.radius)*0.1;
      camera.position.set(0,0,STATE.radius); camera.lookAt(0,0,0);
      if(STATE.radius<CONFIG.autoSnapDist && !STATE.isZoomingOut) {
        let closest=null, minD=Infinity;
        photoObjects.forEach(p=>{ const d=camera.position.distanceTo(p.position); if(d<minD){minD=d;closest=p;} });
        if(closest && minD<5) engageAnchor(closest);
      }
    }
  } else {
    raycaster.setFromCamera(pointer, camera);
    const hits=raycaster.intersectObjects(photoObjects);
    document.body.style.cursor=hits.length>0?'pointer':'default';
    controls.update();
  }
  renderer.render(scene, camera);
}

async function initHands() {
  if(hands) return;
  const video=document.getElementById('input-video'), canvas=document.getElementById('output-canvas'), ctx=canvas.getContext('2d'), hudText=document.getElementById('zoom-status');
  hands = new window.Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
  hands.setOptions({maxNumHands:1, modelComplexity:0, minDetectionConfidence:0.5, minTrackingConfidence:0.5});
  hands.onResults(results => {
    if(!STATE.active || STATE.mode==='MOUSE') return;
    ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(results.image,0,0,canvas.width,canvas.height);
    if(results.multiHandLandmarks.length>0) {
      const lm=results.multiHandLandmarks[0];
      window.drawConnectors(ctx, lm, window.HAND_CONNECTIONS, {color:'#00ffcc', lineWidth:2});
      window.drawLandmarks(ctx, lm, {color:'#fff', radius:2});
      const d=Math.sqrt(Math.pow(lm[8].x-lm[4].x,2)+Math.pow(lm[8].y-lm[4].y,2));
      if(d>0.15) { STATE.isZoomingOut=false; if(!STATE.isAnchored){STATE.targetRadius-=CONFIG.zoomSensitivity; if(STATE.targetRadius<3)STATE.targetRadius=3; hudText.innerText="ZOOM IN"; hudText.style.color="#0f0";} else {hudText.innerText="VIEWING"; hudText.style.color="#0f0";} }
      else if(d<0.05) { STATE.isZoomingOut=true; STATE.targetRadius+=CONFIG.zoomSensitivity; if(STATE.targetRadius>50)STATE.targetRadius=50; hudText.innerText="ZOOM OUT"; hudText.style.color="#f55"; }
      else { STATE.isZoomingOut=false; hudText.innerText="HOLD"; hudText.style.color="#ccc"; }
    } else { hudText.innerText="NO HAND"; hudText.style.color="#555"; }
  });
  cameraPipe = new window.Camera(video, {onFrame: async()=>{if(STATE.active)await hands.send({image:video})}, width:320, height:240});
}

function onPointerMove(e){pointer.x=(e.clientX/window.innerWidth)*2-1; pointer.y=-(e.clientY/window.innerHeight)*2+1;}
function checkIntersection(){raycaster.setFromCamera(pointer, camera); const intersects=raycaster.intersectObjects(photoObjects); if(intersects.length>0) flyToPhoto(intersects[0].object);}
function onResize(){if(!camera)return; camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight);}

async function startGestureSystem() {
  overlay.style.display='block'; STATE.active=true; document.body.style.overflow='hidden';
  init3D(); await loadPhotos(); await initHands(); cameraPipe.start(); animate();
}
function stopGestureSystem() {
  overlay.style.display='none'; STATE.active=false; document.body.style.overflow=''; if(rafId) cancelAnimationFrame(rafId);
}

document.addEventListener('DOMContentLoaded', () => {
  const openBtn=document.getElementById('btn-open-gesture'), closeBtn=document.getElementById('btn-close-gesture'), modeBtn=document.getElementById('mode-switch');
  if(openBtn) openBtn.addEventListener('click', startGestureSystem);
  if(closeBtn) closeBtn.addEventListener('click', stopGestureSystem);
  if(modeBtn) modeBtn.onclick=()=>{
    if(STATE.mode==='GESTURE'){STATE.mode='MOUSE'; controls.enabled=true; document.getElementById('hud-container').style.opacity=0; modeBtn.innerHTML='🖱️ 鼠标模式'; releaseAnchor();}
    else{STATE.mode='GESTURE'; controls.enabled=false; STATE.targetRadius=camera.position.distanceTo(new THREE.Vector3(0,0,0)); STATE.radius=STATE.targetRadius; document.getElementById('hud-container').style.opacity=1; modeBtn.innerHTML='🖐️ 手势模式';}
  };
});