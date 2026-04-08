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
      status.textContent = 'Ready (token received)';
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
const canvas = document.getElementById('viewer');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 150);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0,0,0);
controls.update();

const light = new THREE.DirectionalLight(0xffffff, 0.9);
light.position.set(1,1,1);
scene.add(light);
scene.add(new THREE.AmbientLight(0x888888, 0.6));

window.addEventListener('resize', onWindowResize);
onWindowResize();

function onWindowResize(){
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w,h);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}

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
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();



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
    // ✅ Create object to send to server
    const payload = {
        filename: currentFilename,
        stl_text_b64: stl_b64,
        args: args,
        client_ts: client_ts
    };

    console.log("Sending to server:", payload);

    status.textContent = 'Sending...';
    startClientAnimation('Sending & processing…'); // <-- start timer/spinner
    // ✅ Send to Flask via websocket
    socket.emit("calculate", payload);
});
