// static/js/viewer.js
import * as THREE from './three/build/three.module.js';
import { STLLoader } from './three/build/STLLoader.js';
import { OrbitControls } from './three/build/OrbitControls.js';
import { io } from "./socket.io.esm.min.js";

// UI elements
const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
//const distance = document.getElementById('distance');
//const distanceVal = document.getElementById('distanceVal');
//const toggle1 = document.getElementById('toggle1');
const calculate = document.getElementById('calculate');
const status = document.getElementById('status');

const perf_client_server = document.getElementById('t_client_server');
const perf_process = document.getElementById('t_process');
const perf_compress = document.getElementById('t_compress');
const perf_send = document.getElementById('t_send');
const perf_overall = document.getElementById('t_overall');

// Global state
let currentArrayBuffer = null;
let currentSTLText = null;
let currentFilename = null;

// HUD text
let textSprite;


// ✅ NEW: Timer/spinner elements
const calcActivity = document.getElementById('calc-activity');
const calcElapsedEl = document.getElementById('calc-elapsed');
const calcLabelEl = document.getElementById('calc-label');

let animating = false;
let animationId = null;
let animStartTs = 0;

// ✅ NEW: Keep a monotonic perf clock
function nowMs() {
  return performance.now();
}

// ✅ NEW: Start animation + disable Calculate
function startClientAnimation(labelText = 'Calculating…') {
  if (animating) return;
  animating = true;
  animStartTs = nowMs();
  calcLabelEl.textContent = labelText;
  calcElapsedEl.textContent = '0.0';
  if (calcActivity) calcActivity.style.display = 'flex';
  // disable Calculate to avoid multiple submissions
  if (calculate) calculate.classList.add('btn-disabled');

  // smooth elapsed update loop
  const loop = () => {
    if (!animating) return;
    const elapsed = (nowMs() - animStartTs) / 1000;
    calcElapsedEl.textContent = elapsed.toFixed(1);
    animationId = requestAnimationFrame(loop);
  };
  animationId = requestAnimationFrame(loop);
}

// ✅ NEW: Stop animation + enable Calculate
function stopClientAnimation(finalLabelText) {
  if (!animating) {
    // still allow label update even if not animating
    if (typeof finalLabelText === 'string') calcLabelEl.textContent = finalLabelText;
    return;
  }
  animating = false;
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;

  if (typeof finalLabelText === 'string') {
    calcLabelEl.textContent = finalLabelText;
  }

  // hide after a short grace period so users can see finalLabelText briefly
  setTimeout(() => {
    if (calcActivity) calcActivity.style.display = 'none';
    if (calculate) calculate.classList.remove('btn-disabled');
  }, 300);
}

//========================================================
// Models animation
const stlFiles = [
  '/static/tiles/TileCross.stl',
  '/static/tiles/TileDiagonal.stl',
  '/static/tiles/TileCrossDiag.stl'
];

// spacing between models along X
const X_SPACING = 2;
// rotation speed per frame (radians)
const ROT_SPEED = 0.05;
let meshes = [];
let isPlaying = false;    // play/pause flag
let step = 0;
let currentAxis = 'x';    // 'x' -> 'y' -> 'z'
let currentMeshIndex = 0; // index of mesh currently rotating on this axis


const stepDuration = 400;
let lastStepTime = 0;
const scale_step_size = 5;
let mesh_steps = [];
let startTime = Date.now();
// Scaling animation
function buildStepsForMeshes(meshes, size) {
console.log("calls buildStepsForMeshes")

  const axes = ['x', 'y', 'z'];
  const steps = [];

  for (const m of meshes) {
    // 3 scale up (x, y, z)
    for (const axis of axes) {
      steps.push(() => { if (m) m.scale[axis] *= size; });
    }
    // 3 scale down (x, y, z)
    for (const axis of axes) {
      steps.push(() => { if (m) m.scale[axis] /= size; });
    }
  }

  console.log(" # steps animation : " +  steps.length)
  return steps;
}


//========================================================

//distance.oninput = () => distanceVal.textContent = distance.value;

// Socket.IO
const socket = io(); // default connects to same host

socket.on('connect', () => {
  console.log('socket connected');
});


// --- ADD THESE TWO LINES HERE ---
const downloadArea = document.getElementById('download-area');
const tokenInput = document.getElementById('download-token-input');
// ----------------------------------------
// ✅ NEW: Timer/spinner elements

// client.js

// ... other code ...

socket.on('result', (msg) => {
  console.log('result received', msg);
  console.log('Stop Animation', msg);
  stopAnimation();

  const client_receive_ts = performance.now();

  // ==========================================================
  // 🔑 DOWNLOAD HANDLING LOGIC (Process this first, it needs the token) 🔑
  // ==========================================================
  // NOTE: You must have defined 'downloadArea' and 'tokenInput' at the top of client.js
  const downloadArea = document.getElementById('download-area');
  const tokenInput = document.getElementById('download-token-input');

  if (msg.download_token) {
      if (tokenInput) tokenInput.value = msg.download_token;
      if (downloadArea) downloadArea.style.display = 'block';
  }
  // ==========================================================


  // === CRITICAL FIX: Only proceed with decompression if STL data is present ===
  if (!msg.stl_gz_b64) {
      // This is likely the token-only message. Exit the handler.
      stopClientAnimation()
      status.textContent = 'Ready & received)';
      console.log("-- Stop animation")
      return;
  }
  // =========================================================================

  // update perf
  if (msg.timings) {
    if (msg.timings.client_to_server_ms !== null && msg.timings.client_to_server_ms !== undefined) {
      perf_client_server.textContent = (msg.timings.client_to_server_ms).toFixed(1);
    } else {
      perf_client_server.textContent = '-';
    }

    perf_client_server.textContent = ( Date.now() - startTime).toFixed(1);
    perf_process.textContent = (msg.timings.time_processed_ms || 0).toFixed(1);
    perf_compress.textContent = (msg.timings.time_compress_ms || 0).toFixed(1);
    perf_send.textContent = (msg.timings.server_total_ms || 0).toFixed(1);
    const overall = msg.timings.overall_ms || 0;
    perf_overall.textContent = overall.toFixed(1);
  } else {
    perf_client_server.textContent = '-';
  }

  // decompress base64 gzipped STL
  const b64 = msg.stl_gz_b64; // <-- This is guaranteed to exist now
  const compressed = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  let decompressed;
  try {
    decompressed = pako.ungzip(compressed, { to: 'string' });
  } catch (e) {
    console.error('Decompress failed', e);
    status.textContent = 'decompress failed';
    stopClientAnimation();
    return;
  }
  // display
  loadSTLTextToScene(decompressed);
  status.textContent = 'Displayed';
  try {
    // decompress + display
    // loadSTLTextToScene(decompressed);
    status.textContent = 'Displayed';
    stopClientAnimation('Done');
  } catch (e) {
    console.error('Decompress failed', e);
    status.textContent = 'decompress failed';
    stopClientAnimation('Failed');
    return;
  }
});

// ... rest of client.js ...

socket.on('error', (e) => {
  console.error('socket error', e);
  status.textContent = 'Error: ' + (e.msg || JSON.stringify(e));
  stopClientAnimation()
});

// Three.js setup
let renderer, scene, camera, controls;
function init() {
const canvas = document.getElementById('viewer');
renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);
camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 150);

controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0,0,0);
// Add these properties for better Firefox compatibility:
  controls.enableDamping = true;  // Smooth camera movement
  controls.dampingFactor = 0.05;  // Adjust smoothness (0.05 is default)
  controls.screenSpacePanning = false; // Better for 3D viewing
controls.update();

const light = new THREE.DirectionalLight(0xffffff, 0.9);
light.position.set(1,1,1);
scene.add(light);
scene.add(new THREE.AmbientLight(0x888888, 0.6));

// Text sprite HUD
  //textSprite = createTextSprite('Hello Lattice Fan');
  textSprite = createTextGradientSprite('Lattice Fan');
//textSprite = createMultiColorTextSprite([
//{ text: 'Hello ',  color: '#ff6666' },
//{ text: 'Camera',  color: '#66ff66' }
//]);

  scene.add(textSprite);
}

window.addEventListener('resize', onWindowResize);
init();

loadAllSTLs().then(() => {
        console.log("-!!!- Load al files")
      layoutMeshesAlongX();
      centerAllMeshes();
      console.log('Mesh count:', meshes.length);
      meshes.forEach((m, i) => {
        console.log('Mesh', i, 'pos', m.position, 'bbox', m.geometry.boundingBox);
        });

       console.log(" Nu of meshes : " + meshes.length)
    mesh_steps = buildStepsForMeshes(meshes, scale_step_size);
      renderer.render(scene, camera); // first frame
    });

onWindowResize();
animate();


//==================
// Load all STLs to an array
async function loadAllSTLs() {
  console.log("-!!!- Load al STLs")
  const loader = new STLLoader();
  const promises = stlFiles.map((url) => {
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (geometry) => {
          const material = new THREE.MeshPhongMaterial({
            color: 0x00aaff,
            specular: 0x111111,
            shininess: 50
          });
          const mesh = new THREE.Mesh(geometry, material);

          // Important for correct center calculation
          geometry.computeBoundingBox();

          meshes.push(mesh);
          //scene.add(mesh);

          resolve();
        },
        undefined,
		(err) => {
          console.error('Error loading', url, err);
          reject(err);
        }
      );
    });
  });

  await Promise.all(promises);
}

// Position meshes along X axis
function layoutMeshesAlongX() {
  const count = meshes.length;
  const totalWidth = (count - 1) * X_SPACING;
  const startX = -totalWidth / 2;

  meshes.forEach((mesh, i) => {
    mesh.position.set(startX + i * X_SPACING, 0, 0);
  });
}

// Move each mesh so its own center is at its local origin
// so that rotations happen around its center
function centerAllMeshes() {
  meshes.forEach((mesh) => {
    const box = mesh.geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Translate geometry so that its center is at (0,0,0)
    mesh.geometry.translate(-center.x, -center.y, -center.z);
  });
}

const FULL_TURN = Math.PI;

function stepSequentialRotation() {
  if (meshes.length === 0) return;
  console.log("======= add tiles" + meshes.length === 0)
  camera.position.set(0, 10, 20);
  meshes.forEach((m) => {
    scene.add(m);
  });
  const mesh = meshes[currentMeshIndex];

  switch (currentAxis) {
    case 'x':
      mesh.rotation.x += ROT_SPEED;
      if (mesh.rotation.x >= FULL_TURN) {
        mesh.rotation.x = 0;          // reset for next time
        advanceToNextMeshOrAxis();    // go to next mesh / axis
      }
      break;

    case 'y':
      mesh.rotation.y += ROT_SPEED;
      if (mesh.rotation.y >= FULL_TURN) {
        mesh.rotation.y = 0;
        advanceToNextMeshOrAxis();
      }
      break;

    case 'z':
      mesh.rotation.z += ROT_SPEED;
      if (mesh.rotation.z >= FULL_TURN) {
        mesh.rotation.z = 0;
        advanceToNextMeshOrAxis();
      }
      break;
  }
}

function advanceToNextMeshOrAxis() {
  currentMeshIndex++;
  if (currentMeshIndex >= meshes.length) {
    currentMeshIndex = 0;
    if (currentAxis === 'x') currentAxis = 'y';
    else if (currentAxis === 'y') currentAxis = 'z';
    else if (currentAxis === 'z') currentAxis = 'x';
  }
}

function stopAnimation() {
  isPlaying = false;

  // reset state
  currentAxis = 'x';
  currentMeshIndex = 0;

  // reset rotations
  meshes.forEach((m) => {
    m.rotation.set(0, 0, 0);
    scene.remove(m);
  });

  camera.position.set(0, 0, 150);
  controls.update();
  renderer.render(scene, camera);
}

function stepSequentialScaling(){
    if (meshes.length === 0) return;
    camera.position.set(0, 10, 20);
    meshes.forEach((m) => {
        scene.add(m);
    })
    mesh_steps[step]();
	step = (step + 1) % mesh_steps.length;
}

function stopAnimationScaling(){
    isPlaying = false;

    meshes.forEach((m) => {
        m.rotation.set(0, 0, 0);
        scene.remove(m);
    });

  camera.position.set(0, 0, 150);
  renderer.render(scene, camera);
}

//==================
function onWindowResize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w,h);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

//
// ---- HUD
//
function createMultiColorTextSprite(parts) {
  // parts: [ { text: 'Hello ', color: '#ff0000' }, { text: 'Camera', color: '#00ff00' } ]

  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  ctx.font = '40px Arial';

  // measure total width
  let totalWidth = 0;
  for (const p of parts) totalWidth += ctx.measureText(p.text).width;

  const cssWidth = totalWidth + 140;
  const cssHeight = 180;

  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.font = '40px Arial';
  ctx.textBaseline = 'middle';

  const y = cssHeight / 2;
  let x = 20;

  for (const p of parts) {
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
    x += ctx.measureText(p.text).width;
  }

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.5, 1);
  return sprite;
}

function createTextGradientSprite(message) {
  const dpr = window.devicePixelRatio || 1;

  // "CSS" size of the label
  const cssWidth = 700;
  const cssHeight = 200;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // internal resolution = CSS size * devicePixelRatio
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;

  // scale drawing so font sizes are expressed in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // text style
  ctx.font = '40px Arial';
  ctx.textBaseline = 'middle';

  // measure text, then compute x,y
  const textWidth = ctx.measureText(message).width;
  const x = (cssWidth - textWidth) / 2; // center horizontally
  const y = cssHeight / 2;              // center vertically

  // gradient fill
  const grad = ctx.createLinearGradient(0, 0, cssWidth, 0);
  // Baroque ****
grad.addColorStop(0.0, '#FFF8E1'); // pale parchment
grad.addColorStop(0.25, '#FFECB3'); // soft gold
grad.addColorStop(0.5, '#FBC02D'); // shiny gold highlight
grad.addColorStop(0.75, '#F57F17'); // warm antique gold
grad.addColorStop(1.0, '#FBE9E7'); // soft rose edge [web:95][web:97]

  // Futurestic
//grad.addColorStop(0.0, '#E0F7FA'); // light cyan
//grad.addColorStop(0.25, '#26C6DA'); // neon-ish cyan
//grad.addColorStop(0.5, '#7C4DFF'); // electric violet core
//grad.addColorStop(0.75, '#651FFF'); // deeper neon purple
//grad.addColorStop(1.0, '#EDE7F6'); // soft lavender edge [web:98]

  // Magenta
//grad.addColorStop(0.0, '#FCE4EC'); // pale pink
//grad.addColorStop(0.25, '#F8BBD0'); // soft pink
//grad.addColorStop(0.5, '#F06292'); // shiny magenta
//grad.addColorStop(0.75, '#EC407A'); // richer magenta
//grad.addColorStop(1.0, '#F48FB1'); // soft fade [web:96]

  // Cyan
grad.addColorStop(0.0, '#E0F7FA'); // very light cyan
grad.addColorStop(0.25, '#80DEEA'); // soft cyan
grad.addColorStop(0.5, '#26C6DA'); // shiny cyan core
grad.addColorStop(0.75, '#00BCD4'); // punchy cyan
grad.addColorStop(1.0, '#B2EBF2'); // soft edge [web:96]

  // Orange
//grad.addColorStop(0.0, '#FFF3E0'); // pale peach
//grad.addColorStop(0.25, '#FFCC80'); // soft orange
//grad.addColorStop(0.5, '#FFB74D'); // shiny mid orange
//grad.addColorStop(0.75, '#FFA726'); // warmer accent
//grad.addColorStop(1.0, '#FFE0B2'); // soft return [web:91][web:97]


//    grad.addColorStop(0.0, '#E1F5FE'); // light sky blue
//    grad.addColorStop(0.33, '#81D4FA'); // clear light blue
//    grad.addColorStop(0.66, '#29B6F6'); // more saturated blue
//    grad.addColorStop(1.0, '#4FC3F7'); // bright, gives shiny feel [web:91][web:96]
//    
//    grad.addColorStop(0.0, '#E3F2FD'); // very light blue
//    grad.addColorStop(0.33, '#BBDEFB'); // soft light blue
//    grad.addColorStop(0.66, '#90CAF9'); // a bit stronger
//    grad.addColorStop(1.0, '#64B5F6'); // still light, slightly deeper [web:91][web:96]

//  grad.addColorStop(0,   '#000022');
//  grad.addColorStop(0.5, '#000044');
//  grad.addColorStop(0.7, '#000066');
//  grad.addColorStop(1,   '#000088');

  // outline + shadow (optional)
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'black';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  // draw outline + gradient fill
  ctx.strokeText(message, x, y);
  ctx.fillStyle = grad;
  ctx.fillText(message, x, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    color: 0xffffff,
    opacity: 1.0
  }); // [web:71][web:81][web:89]

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.5, 1);

  return sprite;
}

function createTextSprite(message) {
  const dpr = window.devicePixelRatio || 1; // high DPI support [web:82][web:85]

  // "CSS" size of the label (how big it looks in world units after scaling)
  const cssWidth = 700;
  const cssHeight = 200;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // internal resolution = CSS size * devicePixelRatio
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;

  // scale drawing so font sizes are expressed in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // background (optional)
  // ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  // ctx.fillRect(0, 0, cssWidth, cssHeight);

  // text style
  ctx.font = '40px Arial';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#44aaff';

  // outline + shadow (optional)
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'black';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2; // [web:76]

  const textWidth = ctx.measureText(message).width;
  const x = (cssWidth - textWidth) / 2;
  const y = cssHeight / 2;

  ctx.strokeText(message, x, y);
  ctx.fillText(message, x, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // sharper when tilted [web:89]
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    color: 0xffffff,
    opacity: 1.0
  }); // [web:71][web:90]

  const sprite = new THREE.Sprite(material);

  // world size of label; tweak as needed
  sprite.scale.set(1.8, 0.5, 1);

  return sprite;
}

function updateTextToCamera() {
  if (!textSprite) return;

  const distance = 1.5;  // in front of camera
  const verticalOffset = 0.7; // move up in camera space

  const dir = new THREE.Vector3();   // camera forward
  const up  = new THREE.Vector3();   // camera up
  const pos = new THREE.Vector3();   // camera position

  camera.getWorldDirection(dir);
  camera.getWorldPosition(pos);
  camera.getWorldDirection(up).cross(camera.getWorldDirection(dir)); // not what we want

  // simpler: use camera.up transformed to world space
  up.copy(camera.up).applyQuaternion(camera.quaternion); // camera's up in world space [web:37]

  // start in front of camera
  textSprite.position.copy(pos).add(dir.multiplyScalar(distance));

  // move up from center toward top
  textSprite.position.add(up.multiplyScalar(verticalOffset));
}

// ------------ End HUD

let currentMesh = null;
function clearSceneMesh(){
  if (currentMesh){
    scene.remove(currentMesh);
    if (currentMesh.geometry) currentMesh.geometry.dispose();
    if (currentMesh.material) currentMesh.material.dispose();
    currentMesh = null;
  }
}
function loadSTLTextToScene(stlText){
  console.log("Get the STL)")
  clearSceneMesh();
  const loader = new STLLoader();
  // parse expects ArrayBuffer or string (STLLoader supports string)
  const geometry = loader.parse(stlText);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ metalness:0.2, roughness:0.6 });
  const mesh = new THREE.Mesh(geometry, material);
  // center and scale
  geometry.center();
  // Fit to view
  const bbox = new THREE.Box3().setFromObject(mesh);
  const size = bbox.getSize(new THREE.Vector3()).length();
  const f = 90 / size;
  mesh.scale.setScalar(f);
  currentMesh = mesh;
  scene.add(mesh);
  renderer.render(scene, camera);
}
// animate loop
function animate(){
    animationId = requestAnimationFrame(animate);
    controls.update();
    const now = Date.now();
   if (isPlaying && now - lastStepTime > stepDuration) {
        stepSequentialRotation();
        //stepSequentialScaling();
        const now = Date.now();
   }
   updateTextToCamera();
  renderer.render(scene, camera);

}

// File handling: drag & drop + file input

dropzone.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  dropzone.style.borderColor = '#333';
});
dropzone.addEventListener('dragleave', (ev) => { dropzone.style.borderColor = '#aaa'; });
dropzone.addEventListener('drop', (ev) => {
  ev.preventDefault();
  dropzone.style.borderColor = '#aaa';
  const f = ev.dataTransfer.files[0];
  if (f) handleFile(f);
});

fileInput.addEventListener('change', (ev) => {
  const f = ev.target.files[0];
  if (f) handleFile(f);
});

// STL handling
function isBinarySTL(buffer) {
  // buffer: ArrayBuffer
  if (buffer.byteLength < 84) return false;
  const dv = new DataView(buffer, 0, 84);
  const triCount = dv.getUint32(80, true);
  const expected = 84 + triCount * 50; // binary triangle size = 50 bytes
  // allow some slack (some files add padding) — check plausibility
  return expected === buffer.byteLength || expected < buffer.byteLength + 1000;
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const arrayBuffer = e.target.result; // <--- ArrayBuffer
    currentArrayBuffer = arrayBuffer;
    currentFilename = file.name || 'uploaded.stl';

    if (isBinarySTL(arrayBuffer)) {
      status.textContent = 'Loaded (binary) ' + currentFilename;
      loadSTLTextToScene(arrayBuffer); // pass ArrayBuffer
    } else {
      // decode text for ASCII
      const text = new TextDecoder().decode(arrayBuffer);
      currentSTLText = text;
      status.textContent = 'Loaded (ascii) ' + currentFilename;
      loadSTLTextToScene(text); // pass string
    }
  };
  reader.readAsArrayBuffer(file);
}

// Calculate button: send compressed ASCII STL + args
calculate.addEventListener('click', async () => {
 // if (!currentSTLText){
 //   alert('Load an STL first (drag & drop or open file).');
 //   return;
//  }
  clearSceneMesh();
  const tileType = document.getElementById("tileType").value;
    // prepare base64 ascii stl
    const stl_b64 = btoa(unescape(encodeURIComponent(currentSTLText)));

    const nt1 = parseFloat(document.getElementById("nt1").value);
    const nt2 = parseFloat(document.getElementById("nt2").value);
    const nt3 = parseFloat(document.getElementById("nt3").value);

    const g1 = parseFloat(document.getElementById("g1").value);
    const g2 = parseFloat(document.getElementById("g2").value);

    const args = {
        tileType: tileType,
        nt1: nt1,
        nt2: nt2,
        nt3: nt3,
        g1: g1,
        g2: g2
    };
    const client_ts = performance.now();
    status.textContent = 'Sending...';
    console.log('Start Animation');
    isPlaying = true;

    // ✅ Create object to send to server
    const payload = {
        filename: currentFilename,
        stl_text_b64: stl_b64,
        args: args,
        client_ts: client_ts
    };

    console.log("Sending to server:", payload);
    startTime = Date.now();
    status.textContent = 'Sending...';
    startClientAnimation('Sending & processing…'); // <-- start timer/spinner
    // ✅ Send to Flask via websocket
    socket.emit("calculate", payload);
});

const cameraModeToggle = document.getElementById('cameraModeToggle');
let isPerspective = true; // Track current mode

cameraModeToggle.addEventListener('click', () => {
    isPerspective = !isPerspective;

    if (isPerspective) {
                cameraModeToggle.textContent = '📷 PERSPECTIVE';
                cameraModeToggle.style.borderColor = '#333';
                cameraModeToggle.style.boxShadow = 'none';
    } else {
                cameraModeToggle.textContent = '📐 ORTHOGRAPHIC';
                cameraModeToggle.style.borderColor = '#00FFFF';
                cameraModeToggle.style.boxShadow = '0 0 8px rgba(0, 255, 255, 0.8)';
    }

            // Dispatch custom event for the 3D viewer to listen to
    window.dispatchEvent(new CustomEvent('cameraMode', {
                detail: { mode: isPerspective ? 'perspective' : 'orthographic' }
            }));
    });

//
// Tile calculation

// client.js logic
const tileType = document.getElementById('tileType');
const p1 = document.getElementById('p1');
const p2 = document.getElementById('p2');
const p3 = document.getElementById('p3');

// Auto-switch values based on selection
tileType.addEventListener('change', () => {
    switch(tileType.value) {
        case 'cross':
            p1.value = 0.2; p2.value = 0.0; p3.value = 0.0;
            break;
        case 'cross_diagonal':
            p1.value = 0.05; p2.value = 3.5; p3.value = 0.0;
            break;
        case 'diagonal':
            p1.value = 0.2; p2.value = 0.0; p3.value = 0.0;
            break;
    }
});

//
function GenTile(paramss) {

    const params = {
        type: document.getElementById('tileType').value,
        values: [parseFloat(document.getElementById('p1').value), parseFloat(document.getElementById('p2').value), parseFloat(document.getElementById('p2').value)]
    };
    console.log (" Send Tiles params ", params );
    socket.emit('calculate_tile', params);
}

// Emit parameters over WebSocket
document.getElementById('calculateTile').addEventListener('click', () => {
    const params = {
        type: tileType.value,
        values: [parseFloat(p1.value), parseFloat(p2.value), parseFloat(p3.value)]
    };
    console.log (" Send Tiles params" );
    socket.emit('calculate_tile', params);
});

// Listen for the STL file returned from the server
// client.js

socket.on('tile_generated', async (compressedBuffer) => {
    // 1. Check if we actually received data
    if (!msg.stl_gz_b64) {
      console.log("-- No Tile compression ")
      return;
  }

    // 2. Correct way to check length of binary data (ArrayBuffer)
    console.log("Received Compressed Bytes:", compressedBuffer.byteLength);

  const b64 = msg.stl_gz_b64; // <-- This is guaranteed to exist now
  const compressed = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  let decompressed;

  try {
    decompressed = pako.ungzip(compressed, { to: 'string' });
  } catch (e) {
    console.error('Decompress failed', e);
    status.textContent = 'decompress failed';
    stopClientAnimation();
    return;
  }
  // display
  loadSTLTextToScene(decompressed);

});

// Scroll data
	// Function to enable "Scrubbing" and "Scrolling" on number inputs-
        const numberInputs = document.querySelectorAll('.input-row input[type="number"]');

        numberInputs.forEach(input => {
            // A. Mouse Wheel Support
            input.addEventListener('wheel', (e) => {
                e.preventDefault();
                const step = parseFloat(input.step) || 1;
                const currentVal = parseFloat(input.value) || 0;

                // deltaY < 0 is scroll up
                const newVal = e.deltaY < 0 ? currentVal + step : currentVal - step;
                input.value = newVal.toFixed(2);

                input.dispatchEvent(new Event('input')); // Notify other scripts
            });

            // B. Click & Drag (Scrubbing) Support
            let isDragging = false;
            let startX = 0;
            let startVal = 0;

            input.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startVal = parseFloat(input.value) || 0;

                window.addEventListener('mousemove', handleMouseMove);
                window.addEventListener('mouseup', handleMouseUp);
            });

            function handleMouseMove(e) {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const step = parseFloat(input.step) || 1;
                const sensitivity = 5; // Pixels per step
                const delta = (dx / sensitivity) * step;

                input.value = (startVal + delta).toFixed(2);
                input.dispatchEvent(new Event('input'));

				getLiveTileParams();
            }

            function handleMouseUp() {
                isDragging = false;
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            }
        });


        function getLiveTileParams() {
    const params = {
		latticeType: document.getElementById('tileType').value,
        p1: parseFloat(document.getElementById('p1').value),
        p2: parseFloat(document.getElementById('p2').value),
        p3: parseFloat(document.getElementById('p3').value)
    };

    // ACTION: This is where you connect to your 3D logic
    //console.log("Live Update:", params);
    document.getElementById('status').textContent = `P1:${params.p1} P2:${params.p2} P3:${params.p3}`;
    GenTile(params);

    return params;
}