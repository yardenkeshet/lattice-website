import * as THREE from './three/build/three.module.js'
import { OBJLoader } from './three/build/OBJLoader.js';
import { MTLLoader } from './three/build/MTLLoader.js';
import { STLLoader } from './three/build/STLLoader.js';
import { GLTFLoader  } from './three/build/GLTFLoader.js';

import { OrbitControls } from './three/build/OrbitControls.js';
import { GUI } from './three/build/dat.gui.module.js'

//import JSZip from './JSZip/jszip.min.js';
let  zip = null;

function loadJSZip(callback) {
  const script = document.createElement('script');
  script.src = './site/js/JSZip/jszip.min.js';
//  script.src = './site/js/JSZip_sync/jszip.min.js';
  script.onload = callback;
  document.head.appendChild(script);
}

function handleJSZipLoad() {
  // JSZip is now loaded and available for use

  // Create a new instance of JSZip
  zip = new JSZip();
}

loadJSZip(handleJSZipLoad);

//
/// File existance	
//


function checkURL(url, callback) {
  fetch(url)
    .then((response) => {
      callback(null, response.ok);
    })
    .catch((error) => {
      console.error('Error checking URL:', error);
      callback(error, false);
    });
}

function check(url) {
  checkURL(url, (error, isAccessible) => {
    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log("-!!!- Is access " + isAccessible); // true or false

    // Continue with other code dependent on the result
    if (isAccessible) {
      // URL is accessible
    } else {
      // URL is not accessible
    }
  });
}

function  checkURL1(url) {
var request = new XMLHttpRequest();  
request.open('GET', url, true);
request.onreadystatechange = function(){
    if (request.readyState === 4){
        if (request.status === 404) {  
            console.log("-@@@-  Oh no, it does not exist!");
            url = null;
        }  else {
			console.log("-!!!- %s exist!", url);
		}
    }
};
request.send();
}


async function checkURL2(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch (error) {
    //console.error('Error checking URL:', error);
    return false;
  }
}

// Usage:
async function performURLCheck(url) {
  const isURLAccessible = await checkURL(url);
  // Continue with other code dependent on the result
  if (isURLAccessible) {
	  console.log("-!!!- File is accessible : ", url);
  } else {
	  console.log("-@@@- File not accessible : ", url);

	  url = null;
  }
}



//////////////////////////////////////////////////////////

var bgColor = '#aaaaaa',
	baseColor = '#555555',
	defaultWidth = 400,
    defaultHeight = 400,
	showMenu = false,
	isWireFrame = false,
	showBasePlane = true,
	debug = false;

	
var controls, wireframeItem, showBasePlaneItem, bgColorGUI, baseColorGUI;

var arr_views = [];


//
// Utils
//	
var de2ra = function(degree) { return degree*(Math.PI/180);};
	
var v = new View();

function View(first, last, age, eye) {
	this.id = -1;
	this.bgColor = bgColor;
	this.baseColor = baseColor;
	this.width;
	this.height;
	this.showMenu = false;
	this.isWireFrame = false;
	this.showBasePlane = true;
	this.gui;
	this.canvas;
	this.canvasId;
	this.renderer;
	this.scene;
	this.currentCamera;
	this.persCamera;
	this.orthCamera;
	this.camPos; //  THREE.Vector3
	this.camLookAt; //  THREE.Vector3
	this.dLight;
	this.ambLight;
	this.orbit;
	this.basePlane;
	this.objFormat; // obj stl glb 
	this.objFile; // File 
	this.mtlFile; // File
	this.obj;
	this.mtl;

	this.zip;
	
	this.axisHelper;
	this.persCameraHelper;
	this.orthCameraHelper;
	this.debug = false;
	
	this.dummy = function() {
		arr_views[currentViewIdx].obj.scale.set(1,1, 1);
		arr_views[currentViewIdx].obj.rotation.set(0, 0, 0);
		arr_views[currentViewIdx].obj.position.set(0, 0, 0);
  };
}

function print_view_properties(view) {
	console.log("View info id		: " + view.id);
	console.log("\tShowMenu		: " + view.showMenu);
	console.log("\tbgColor			: " + view.bgColor);
	console.log("\tbaseColor		: " + view.baseColor);
	console.log("\tisWireFrame		: " + view.isWireFrame);
	console.log("\tshowBasePlane	: " + view.showBasePlane);
	console.log("\tdebug 			: " + view.debug);
	console.log("\tcamPos			: %f, %f, %f ", view.camPos.x, view.camPos.y, view.camPos.z);
	console.log("\tcamLookAt		: %f, %f, %f ", view.camLookAt.x, view.camLookAt.y, view.camLookAt.z);
	console.log("\tobjFile			: " + view.objFile);
	console.log("\tmtlFile			: " + view.mtlFile);
	console.log("\tobjFormat		: " + view.objFormat);

}

var radioValue = {
  option: 'perspective' // Set the default option
};

//
// GUI controlers
//
var controller = new function() {
	this.bgColor = '#aaaaaa';
	this.baseColor = '#555555';
	this.width;
	this.height;
	this.showMenu;
	this.scaleX = 1;
	this.scaleY = 1;
	this.scaleZ = 1;
	this.Scale = 1;
	this.positionX = 0;
	this.positionY = 0;
	this.positionZ = 0;
	this.rotationX = 0;
	this.rotationY = 0;
	this.rotationZ = 0; 
	this.camPos; //  THREE.Vector3
	this.camLookAt; //  THREE.Vector3
	this.Wireframe = false;
	this.ShowBasePlane = false;
	this.showRay = false;
	this.Helpers = false;
	
	this.Home = function () {
		arr_views[currentViewIdx].obj.scale.set(1,1, 1);
		arr_views[currentViewIdx].obj.rotation.set(0, 0, 0);
		arr_views[currentViewIdx].obj.position.set(0, 0, 0);
	} ;
}

//
// Read parameters from html
//
//document.getElementById('dat-gui-holder').appendChild(gui.domElement);
const canvasElmnts = document.getElementsByTagName("canvas");

for (var i=0; i < canvasElmnts.length; i++) {
	v = new View();
	arr_views.push(v);
	v.id = i;
	v.bgColor = canvasElmnts[i].getAttribute("bgColor");
	v.baseColor = canvasElmnts[i].getAttribute("baseColor");
	
	v.width = canvasElmnts[i].getAttribute("viewWidth");
	v.height = canvasElmnts[i].getAttribute("viewHeight");
		
	let showMenu = canvasElmnts[i].getAttribute("showMenu");
	if (showMenu  === 'true') {
		v.showMenu = showMenu;
	}
	
	let isWireframe = canvasElmnts[i].getAttribute("isWireframe");
	if (isWireframe  === 'true') {
		v.isWireFrame = true;
	} else {
		v.isWireFrame = false;
	}
	controller.Wireframe = v.isWireFrame;
	
	let showBasePlane = canvasElmnts[i].getAttribute("showBasePlane");
	if (showBasePlane  === 'true') {
		v.showBasePlane = true;
	} else {
		v.showBasePlane = false;
	}
	controller.ShowBasePlane = v.showBasePlane;
	
	let debugCheck = canvasElmnts[i].getAttribute("debug");
		if (debugCheck === 'true') {
		v.debug = true;
	} else {
		v.debug = false;
	}

	v.objFile = canvasElmnts[i].getAttribute("obj") ; 
	v.objFormat = getFileFormatByExtension(v.objFile);


	v.mtlFile = canvasElmnts[i].getAttribute("mtl"); 

	
	read_cam_pos_n_look_at_2_view(v, canvasElmnts[i].getAttribute("camPos"), canvasElmnts[i].getAttribute("camLookAt"));
	
	if (!v.bgColor) {
		v.bgColor = bgColor;
	}
	controller.bgColor = v.bgColor;	
	
	if (!v.baseColor) {
		v.baseColor = baseColor;
	}
	controller.baseColor = v.baseColor;	
	
	if (!v.width) {
		v.width = defaultWidth;
	} else {
		if (isNaN(v.width)){
			if (v.width === 'max'){
				v.width = window.innerWidth;
			} else {
				v.width = defaultWidth;
			}
		}
	}
	
	if (v.height < 1) {
		v.height = defaultHeight;
	} else {
		if (isNaN(v.height)){
			if (v.height === 'max'){
				v.height = window.innerHeight;
			} else {
				v.height = defaultWidth;
			}
		}
	}

	
	//canvase
	v.canvas = canvasElmnts[i]; //canvases.push(canvasElmnts[i]);
	v.canvas.setAttribute('id', i); 
	v.canvasId = i;
	
	// Renderer
	var r = new THREE.WebGLRenderer({ canvas: canvasElmnts[i], antialias: true });
	r.setSize(v.width, v.height);
	r.shadowMap.type = THREE.PCFSoftShadowMap;
	v.renderer = r;
	
	// Scene
	var s = new THREE.Scene();
	s.background = new THREE.Color( v.bgColor );
	v.scene = s;
	
	// Camera
	var aspectRatio = window.innerWidth / window.innerHeight;
	var frustumSize = 10;
	v.orthCamera = new THREE.OrthographicCamera(
		frustumSize * aspectRatio / -2,
		frustumSize * aspectRatio / 2, 
		frustumSize / 2, -frustumSize / 2,
		0.1, 100);
		
	v.persCamera = new THREE.PerspectiveCamera( 45, v.width / v.height, 1, 10000 );
	if (v.camPos != 'undefined') {
				v.persCamera.position.set(v.camPos.x, v.camPos.y, v.camPos.z);
				v.persCamera.lookAt(v.camLookAt.x, v.camLookAt.y, v.camLookAt.z);
	}
	v.currentCamera = v.persCamera;
	v.scene.add(v.currentCamera);
	
	
	
	// Direction Light
	var light = new THREE.DirectionalLight( 0xffffff, 1 );
	//light.position.set( 0, 0, 1 ); //default; light shining from top
	light.castShadow = true; // default false
	light.shadow.camera.bottom = -10;
	light.shadow.camera.left = -10;
	light.shadow.camera.right = 10;
	light.shadow.mapSize.width = 1512; // default
	light.shadow.mapSize.height = 512; // default
	light.shadow.camera.near = -20; //0.5 default
	light.shadow.camera.far = 100;
	v.dLight = light; // lights.push(light);
	v.scene.add(v.dLight);

	// Ambient light
	var ambientlight = new THREE.AmbientLight( 0xffffff );
	v.ambLight = ambientlight; 
	v.scene.add( v.ambLight );

	//planes
	var planeGeometry = new THREE.PlaneGeometry( 20, 20, 32, 32 );
	var planeMaterial = new THREE.MeshStandardMaterial( //new THREE.MeshBasicMaterial(
		{	
			side: THREE.DoubleSide
		});
	var basePlane = new THREE.Mesh( planeGeometry, planeMaterial );
	basePlane.position.set(0,-1,0);
	//plane.rotation.set(de2ra(90), de2ra(0), de2ra(0)); // r-g-b
	basePlane.receiveShadow = true;
	basePlane.material.color.set(new THREE.Color( v.baseColor ));
	v.basePlane = basePlane;
	v.scene.add( v.basePlane );

	if (v.showBasePlane){
		v.basePlane.visible = true;
	} else {
		v.basePlane.visible = false;
	}
	


	// Orbit & Camera & rendrer
	var orbit = new OrbitControls(v.currentCamera, r.domElement);
	v.orbit = orbit;

	// Axis
	//v.scene.add(new THREE.AxisHelper(50));
	
	// Perspective camera helper
	v.persCameraHelper = new THREE.CameraHelper( v.currentCamera );
	//v.scene.add( v.persCameraHelper );
	
	var axesHelper = new THREE.AxesHelper(2);
	//v.scene.add(axesHelper );
	
	v.gui = buildGUI();
	if (!i){
		controller.bgColor = v.bgColor;	
		controller.baseColor = v.baseColor;
		v.gui.hide();
	}

	if (v.debug) {
		debug = true;
	}
}

const state = {
  outerRadius: 50
};

if (arr_views[0].showMenu === 'true') {
		arr_views[0].gui.show();
} else {
	arr_views[0].gui.hide();
}

load();
resize();
animate();

//
// Build gui 
//
function buildGUI() {
	
	var gui = new GUI();
 
	gui.add(controller, 'Scale', 0.1, 5).onChange(function (e) {
		arr_views[currentViewIdx].obj.scale.set(controller.Scale, controller.Scale, controller.Scale)
	});
	
	var f2 = gui.addFolder('Position');
	f2.add(controller, 'positionX', -100, 100).onChange( function() {
		arr_views[currentViewIdx].obj.position.x = (controller.positionX);
	});
	f2.add(controller, 'positionY', -100, 100).onChange( function() {
		arr_views[currentViewIdx].obj.position.y = (controller.positionY);
	});
	f2.add(controller, 'positionZ', -100, 100).onChange( function() {
		arr_views[currentViewIdx].obj.position.z = (controller.positionZ);
	});
	
	var f3 = gui.addFolder('Rotation');
	f3.add(controller, 'rotationX', -180, 180).onChange( function() {
		arr_views[currentViewIdx].obj.rotation.x = de2ra(controller.rotationX);
	});
	f3.add(controller, 'rotationY', -180, 180).onChange( function() {
		arr_views[currentViewIdx].obj.rotation.y = de2ra(controller.rotationY);
	});
	f3.add(controller, 'rotationZ', -180, 180).onChange( function() {
		arr_views[currentViewIdx].obj.rotation.z = de2ra(controller.rotationZ);
	});
	gui.add(controller, 'Home');
	
//	gui.add(controller, 'switchCamera');
//	var cameraSwitchButton = gui.add(controller, 'perspective').listen();
//	cameraSwitchButton.onChange(function (value) {
//         switchCamera(value);
//   });
	

	gui.add(radioValue, 'option', { 'Perspective': 'perspective', 'Orthographic': 'orthographic' }).onChange(function() {
		var targetPosition , targetRotation  , targetQuaternion , targetZoom ;
		var camera = arr_views[currentViewIdx].currentCamera.clone();
		var lookAtDirection = new THREE.Vector3();
		camera.getWorldDirection(lookAtDirection);
		switch (radioValue.option) {
		case 'perspective':
			if (debug) {
				console.log("Do Prespective on view = " + currentViewIdx);
			}
			arr_views[currentViewIdx].persCamera.position.copy(camera.position);
			arr_views[currentViewIdx].persCamera.rotation.copy(camera.rotation);
			arr_views[currentViewIdx].persCamera.quaternion.copy(camera.quaternion);
            arr_views[currentViewIdx].currentCamera = arr_views[currentViewIdx].persCamera; 
			break;
		case 'orthographic':
			if (debug) {
				console.log("Do Prespective on view = " + currentViewIdx);
			}			
			arr_views[currentViewIdx].orthCamera.position.copy(camera.position);
			arr_views[currentViewIdx].orthCamera.rotation.copy(camera.rotation);
			arr_views[currentViewIdx].orthCamera.quaternion.copy(camera.quaternion);
			arr_views[currentViewIdx].currentCamera = arr_views[currentViewIdx].orthCamera; 
			break;
		}
		arr_views[currentViewIdx].orbit.dispose();
		arr_views[currentViewIdx].orbit = new OrbitControls(arr_views[currentViewIdx].currentCamera, arr_views[currentViewIdx].renderer.domElement);
	});
	
	var wireframeItem = gui.add(controller, 'Wireframe').onChange(function (e) {
		arr_views[currentViewIdx].isWireFrame = e;
		set_wireframe_by_view(arr_views[currentViewIdx]);
   });

	var showBasePlaneItem = gui.add(controller, 'ShowBasePlane').onChange(function (e) {
		arr_views[currentViewIdx].showBasePlane = e;
		arr_views[currentViewIdx].basePlane.visible = arr_views[currentViewIdx].showBasePlane;
   });
   
	bgColorGUI = gui.addColor(controller, 'bgColor').onChange(function (e) {
		arr_views[currentViewIdx].bgColor = e;
		arr_views[currentViewIdx].scene.background = new THREE.Color( arr_views[currentViewIdx].bgColor );
   });
	baseColorGUI = gui.addColor(controller, 'baseColor').onChange(function (e) {
		arr_views[currentViewIdx].baseColor = e;
		arr_views[currentViewIdx].basePlane.material.color.set(new THREE.Color( arr_views[currentViewIdx].baseColor  ));
   });
   
//	gui.add(controller, 'Helpers').onChange(function (e) {
//            lightHelper.visible = e;
//			axisHelper.visible = e;
//        });
	gui.hide();
	return gui;
}

window.addEventListener('resize',resize);
document.addEventListener("keydown", onDocumentKeyDown, false);
document.addEventListener("click", onMouseClick, false);
//document.addEventListener("mousemove", onMouseMove, false);


var currentViewIdx = 0;
function onMouseClick(event) {
	var canvas = document.elementFromPoint(event.clientX, event.clientY);
	var id = canvas.getAttribute('id');
	if (!id) {
		return;
	}
	
	let tmpIdx = currentViewIdx;
	for (i=0; i < arr_views.length; i++) {
	  if (id.toString() === arr_views[i].canvasId.toString()){
		  currentViewIdx = i;
		  break;
	  }
	}
	
	if (tmpIdx === currentViewIdx) {
		if (debug){
			console.log("Set same canvas = " + currentViewIdx);
		}
		return;
	}
	
//	v.canvas.setAttribute('tabindex','0');
//	v.canvas.focus();
	
	show_menu();
}

function onMouseMove(event) {
	canvas = document.elementFromPoint(event.clientX, event.clientY);
	var id = canvas.getAttribute('id');
	for (i=0; i < arr_views.length; i++) {
	  if (id.toString() === arr_views[i].canvasId.toString()){
		  currentViewIdx = i;
		  break;
	  }
	}
}

function onDocumentKeyDown(event) {
    var keyCode = event.which;
    if (keyCode === 87) { // w = Wireframe
		arr_views[currentViewIdx].isWireFrame = !arr_views[currentViewIdx].isWireFrame;
		set_wireframe_by_view(arr_views[currentViewIdx]);
    } else if (keyCode === 113) {
		if (showMenu === 'true') {
			showMenu = 'false';
		} else {
			showMenu = 'true';
		}
		show_menu();
	} else if (keyCode === 36) { // h = home
        console.log("Home");
	}
};

function allElementsFromPoint(x, y) {
    var element, elements = [];
    var old_visibility = [];
    while (true) {
        element = document.elementFromPoint(x, y);
        if (!element || element === document.documentElement) {
            break;
        }
        elements.push(element);
        old_visibility.push(element.style.visibility);
        //element.style.visibility = 'hidden'; // Temporarily hide the element (without changing the layout)
    }

    for (var k = 0; k < elements.length; k++) {
        elements[k].style.visibility = old_visibility[k];
    }
    elements.reverse();
    return elements;
}

function resize(){
//  let w = width;//window.innerWidth;
//  let h = height;//window.innerHeight;
//  
  for (i=0; i < arr_views.length; i++) {
	  let w = arr_views[i].width;
	  let h = arr_views[i].height;
	  arr_views[i].renderer.setSize(w,h);
	  if (arr_views[i].currentCamera instanceof THREE.PerspectiveCamera) {
		  arr_views[i].currentCamera.aspect = w/h;
	  }
	  arr_views[i].persCamera.aspect = w/h;
// Fix : handle orthographic 
  }
}

function animate() {
  for(i = 0; i < arr_views.length; i++) {
	arr_views[i].renderer.render(arr_views[i].scene, arr_views[i].currentCamera);
	arr_views[i].orbit.update();	
  }
 
  requestAnimationFrame( animate );
}

// ===================== Files Extention utils
function getFileFormatByExtension(file){
	if (!file){
		return "undefined";
	}
	var ext = file.slice((file.lastIndexOf(".") - 1 >>> 0) + 2);
	var ext = ext.toLowerCase();
	return ext;
}

function getFileExtension(fileName) {
  const parts = fileName.split('.');
  return `.${parts[parts.length - 1]}`;
}


function load(){
	for (i = 0; i < arr_views.length; i++) {
		if (debug) {
			print_view_properties(arr_views[i]);
		}

		try {
				switch(arr_views[i].objFormat) {
					case 'obj':
						loadOBj_given_view(arr_views[i]);
					break;
					case 'stl':
						loadSTL_given_view(arr_views[i]);
					break;
					case 'glb':
						loadGLB_given_View(arr_views[i]);
					break;
					case 'zip':
						load_zip_given_view(arr_views[i]);
					break;
					default:
						console.log("-!!!- File type by unknown : " + ext);
				}
			}
		catch(err) {
			console.log("-@@@-  Loading error: $",  err.message);
		}
	}		
}

function set_wireframe_by_view(view) {

		switch(view.objFormat) {
			case 'obj':
				set_wireframe(view.obj, view.isWireFrame);
			break;
			case 'stl':
				view.obj.material.wireframe = view.isWireFrame;
			break;
			case 'glb':
				set_wireframe(view.obj, view.isWireFrame);
			break;
			default:
				console.log("-!!!- File type by unknown : " + view.objFormat);
		}
}

function show_menu() {
	for (i=0; i < arr_views.length; i++) {
		  arr_views[i].gui.hide();
	}
	if (showMenu === 'true') {
		arr_views[currentViewIdx].gui.show()
	}
}

function set_wireframe(obj, yes) {
	var wireframe = 'false';
	if (yes){
		wireframe = 'true';
	}
	obj.traverse(function(child){
	if (child instanceof THREE.Mesh) {
		child.material.wireframe = yes;                      
                    }
                });
}

// Utils
function fit_2_window(model, cam) {
	var modelBox = new THREE.Box3().setFromObject(model);
	var modelSize = modelBox.getSize(new THREE.Vector3());
	var boxCenter = modelBox.getCenter(new THREE.Vector3());
	
	var fov = cam.fov * (Math.PI / 180); // Convert fov to radians
	var maxDimension = Math.max(modelSize.x, modelSize.y, modelSize.z);
	var distance = Math.abs(maxDimension / ( Math.tan(fov / 2)));
		
	 // Set the camera position based on the model's bounding box
	var modelCenter = modelBox.getCenter(new THREE.Vector3());
	cam.position.copy(modelCenter);
	cam.position.z += distance;

//	Look at the center of the model
	cam.lookAt(modelCenter);	
}

function updateOrthographicCamera(orthCam, model) {
	var boundingBox = new THREE.Box3().setFromObject(model);
	var size = boundingBox.getSize(new THREE.Vector3());
	var center = boundingBox.getCenter(new THREE.Vector3());

  var maxDimension = Math.max(size.x, size.y, size.z);
  var aspectRatio = window.innerWidth / window.innerHeight;

  var frustumSize = maxDimension / 2;
  var near = 0.1;
  var far = 100;

  orthCam.left = -frustumSize * aspectRatio;
  orthCam.right = frustumSize * aspectRatio;
  orthCam.top = frustumSize;
  orthCam.bottom = -frustumSize;
  orthCam.near = near;
  orthCam.far = far;
  orthCam.updateProjectionMatrix();

  orthCam.position.copy(center);
  orthCam.lookAt(center);
}


function read_cam_pos_n_look_at_2_view(view, pos, dir) {
	if (pos === null) {
		view.camPos = 'undefined';
	} else {
		var vec = pos.split(",").map(numString => Number(numString.trim()));
		if (vec.length === 3 ) {
			view.camPos = new THREE.Vector3(vec[0], vec[1], vec[2]);
		} else {
			view.camPos = 'undefined';
		}
	}
	if (dir === null) {
		view.camLookAt = 'undefined';
	} else {
		vec = dir.split(",").map(numString => Number(numString.trim()));
		if (vec.length === 3 ) {
			view.camLookAt = new THREE.Vector3(vec[0], vec[1], vec[2]);
		} else {
			view.camLookAt = 'undefined';
		}
	}
}


function isArrayOfNumbers(arr) {
   return arr.every(item => typeof item === 'number' && Number.isFinite(item));
}

function set_camera(cam, pos, lookAt) {
	if ( pos != undefined){
		cam.position.set(pos);
	} else {
		console.log("-!!!- No camera position");
	}
	
	if (lookAt != undefined){
		cam.lookAt(lookAt);
	} else {
		console.log("-!!!- No camera look at");
	}
	cam.updateProjectionMatrix();
}

function load_dumm_spheres(view) {
	console.log("-!!!- load_dumm_spheres");
	for (i = 0; i < arr_views.length; i++) {
		//console.log(" Load : " +i + ")" + arr_views[i].objFile + " " + arr_views[i].mtlFile);
	
		var sphereGeometry = new THREE.SphereGeometry( 3, 32, 32 );
		var sphereMaterial = new THREE.MeshStandardMaterial( { color: 0xff0000 } );
		var sphere = new THREE.Mesh( sphereGeometry, sphereMaterial );
		sphere.position.set(5,5,0);
		sphere.castShadow = true; //default is false
		sphere.receiveShadow = false; //default
		arr_views[i].scene.add( sphere );
		arr_views[i].mtl = sphereMaterial;
		arr_views[i].obj = sphere;
	}
}

//
// File Formats
//
function load_sphere_given_view(view){
	const sphereGeometry = new THREE.SphereGeometry( 3, 32, 32 );
	const sphereMaterial = new THREE.MeshStandardMaterial( { color: 0xff0000 } );
	const sphere = new THREE.Mesh( sphereGeometry, sphereMaterial );
	sphere.position.set(5,5,0);
	sphere.castShadow = true; //default is false
	sphere.receiveShadow = false; //default
	view.obj = sphere;
	view.scene.add(view.obj);
}

function loadOBj_given_view(view){
	if (debug) {
		console.log("Start loading OBJ file : " + view.objFile);
	}
    if (view.objFile === undefined) {
		return;
	}
    var onProgress = function ( xhr ) {
        if ( xhr.lengthComputable ) {
            var percentComplete = Math.round(xhr.loaded / xhr.total * 100);
            console.log( percentComplete + '% downloaded' );
		}
    };
    var onError = function ( xhr ) {    };

	let startTime = performance.now();
    const material = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: false })
    // obj mtl
	if (view.mtlFile === undefined || view.mtlFile === null){
		if (debug) {
			console.log("Start loading OBJ file with no MTL : " + view.objFile);
		}
		var objLoader = new OBJLoader();
		objLoader.load( view.objFile, function ( object ) {
			var objmodel = object.clone();
			console.log("-!!!- loadOBJ by view with no mtl - 2: " + view.objFile );
			objmodel.traverse(function (child) {
						if (child instanceof THREE.Mesh) {
							child.material.wireframe = view.isWireFrame;
							child.castShadow = true;
							 child.material = material;
							if (child.material) {
								child.material.side = THREE.DoubleSide;
							}
	
							var geometry = child.geometry;			
							var originalMaterial = child.material;
						}
			});
			let endTime = performance.now();
			console.log("-!!!- OBJ no mtl time = " + (endTime - startTime) + " milli");
		// obj as Object3D
			var obj = new THREE.Object3D();
			obj.add(objmodel);
			obj.castShadow = true;
	
			view.obj = obj;
			view.mtl = null;
			view.scene.add(obj);
			if (view.camPos === 'undefined') {
				fit_2_window(view.obj, view.currentCamera);
				updateOrthographicCamera(view.orthCamera, view.obj);
			} 
			if (debug) {
				console.log("Done loading file (Np MTL file) : " + view.objFile);
			}
		}, onProgress, onError );

	} else {
		if (debug) {
			console.log("Start loading OBJ file with  MTL : " + view.objFile);
		}
		var mtlLoader = new MTLLoader();
		mtlLoader.load( view.mtlFile, function( materials ) {
		materials.preload();
		view.mtl = material;
		var objLoader = new OBJLoader();
		objLoader.setMaterials( materials );
		objLoader.load( view.objFile, function ( object ) {
			var objmodel = object.clone();
			objmodel.traverse(function (child) {
						if (child instanceof THREE.Mesh) {
							child.material.wireframe = view.isWireFrame;
							child.castShadow = true;
							if (child.material) {
								child.material.side = THREE.DoubleSide;
							}
	
							var geometry = child.geometry;	
							var originalMaterial = child.material;	
						}
			});
			let endTime = performance.now();
			console.log("-!!!- OBJ with mtl time = " + (endTime - startTime) + " milli");
			
		// obj as Object3D
			var obj = new THREE.Object3D();
			obj.add(objmodel);
			obj.castShadow = true;
	
			view.scene.add(obj);
			view.obj = obj;
			if (view.camPos === 'undefined') {
				console.log("-!!!-No camera position and look at - Do fit to window");
				fit_2_window(view.obj, view.currentCamera);
				updateOrthographicCamera(view.orthCamera, view.obj);
			} 
			if (debug) {
				console.log("Done loading  file : " + view.objFile);
			}
			
		}, onProgress, onError );
		});	
	}
	
}

function loadSTL_given_view(view){
		if (debug) {
			console.log("-!!!- Start loading STL file : " + view.objFile);
		}
	     //STL Loader
		let startTime = performance.now();
        const material = new THREE.MeshPhongMaterial({ color: 0x9e9e9e });
        var stlLoader = new STLLoader()

        stlLoader.load(
			view.objFile,
			function (geometry) {
				
				const mesh = new THREE.Mesh(geometry, material)
		
				var curr_object = mesh;
		
				mesh.position.x = 0;
				mesh.position.y = 0;
				mesh.position.z = 0;
	

				mesh.castShadow = true;
				mesh.material.wireframe = false; // default
				view.obj = mesh;
				view.scene.add(mesh);
				
				let endTime = performance.now();
				console.log("-!!!- STL time = " + (endTime - startTime) + " milli");
				fit_2_window(view.obj, view.currentCamera);
				updateOrthographicCamera(view.orthCamera, view.obj);
				set_wireframe_by_view(view);
				if (debug) {
					console.log("-!!!- Done loading  file : " + view.objFile);
				}				
			},
			(xhr) => {
				console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
			},
			(error) => {
				console.log("-###- " + error);
				alert(error);
			}
        )
}

function loadGLB_given_View(view) {
	if (debug) {
		console.log("-!!!- Start loading GLB file : " + view.objFile);
	}
	let startTime = performance.now();
	var glflLoader = new GLTFLoader();
	glflLoader.load(view.objFile, function (glb) {
		view.obj = glb.scene;
		view.scene.add(view.obj);
		let endTime = performance.now()
		console.log("-!!!- GLTFL time = " + (endTime - startTime) + " milli");
		fit_2_window(view.obj, view.currentCamera);
		updateOrthographicCamera(view.orthCamera, view.obj);
		set_wireframe_by_view(view);
		if (debug) {
				console.log("-!!!- Done loading  file : " + view.objFile);
		}
	});	
}

function loadOBJ(objFile, mtlFile, scene) {
	console.log("-!!!- loadOBJ : " + objFile + " " + mtlFile);
    if (objFile === undefined) {
		return;
	}
    var onProgress = function ( xhr ) {
        if ( xhr.lengthComputable ) {
            var percentComplete = xhr.loaded / xhr.total * 100;
            console.log( Math.round(percentComplete, 2) + '% downloaded' );
            }
    };
    var onError = function ( xhr ) {    };

    const material = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: false })

	let startTime = performance.now();
    // obj mtl
	if (mtlFile === undefined || mtlFile === null){

		var objLoader = new THREE.OBJLoader();
		objLoader.load( objFile, function ( object ) {
			objmodel = object.clone();
			objmodel.traverse(function (child) {
						if (child instanceof THREE.Mesh) {
							child.material.wireframe = false;
							child.castShadow = true;
							 child.material = material;
							if (child.material) {
								child.material.side = THREE.DoubleSide;
							}
	
						}
			});
	
			objmodel.scale.set(5, 5, 5);

		// obj as Object3D
			obj = new THREE.Object3D();
			obj.add(objmodel);
			obj.castShadow = true;
	
			scene.add(obj);
			objs.push(obj);
			mtls.push(null);
		}, onProgress, onError );

	} else {
		var mtlLoader = new THREE.MTLLoader();
		mtlLoader.load( mtlFile, function( materials ) {
		materials.preload();
		mtls.push(material);
		var objLoader = new THREE.OBJLoader();
		objLoader.setMaterials( materials );
		objLoader.load( objFile, function ( object ) {
			objmodel = object.clone();
			objmodel.traverse(function (child) {
						if (child instanceof THREE.Mesh) {
							child.material.wireframe = false;
							child.castShadow = true;
							if (child.material) {
								child.material.side = THREE.DoubleSide;
							}
	
							var geometry = child.geometry;	
							var originalMaterial = child.material;	
						}
			});
	
			objmodel.scale.set(5, 5, 5);
	
		// obj as Object3D
			obj = new THREE.Object3D();
			obj.add(objmodel);
			obj.castShadow = true;
	
			scene.add(obj);
			objs.push(obj);
		}, onProgress, onError );
		});	
	}
}


const loaderMap = {
  '.stl': new STLLoader(),
  '.glb': new GLTFLoader(),
  '.obj': new OBJLoader(),
  '.mtl': new MTLLoader(),
};

function load_zip_given_view(view) {
	if (debug) {
		console.log("-!!!- Start loading ZIP file : " + view.objFile);
	}
	console.log('-!!!- JSZip library  is :::: ' +  zip);
	
	if (typeof zip !== undefined) {
		//console.log('-#!!!- JSZip library defined ===========');
	} else {
		//console.error('-###- JSZip library not loaded correctly.');
		loadJSZip(handleJSZipLoad);
		//console.log('-###- JSZip library reload');
	}
	
	let startTime = performance.now();
	const loader = new THREE.FileLoader();
	loader.setResponseType('arraybuffer');
loader.load(
  view.objFile,
  function (zipData) {
    // Successfully loaded the ZIP file
    console.log('-!!!- ZIP file loaded');

    zip.loadAsync(zipData)
      .then(function () {
        const fileNames = Object.keys(zip.files);
		const objFile = fileNames.find((fileName) => /\.obj$/i.test(fileName));
		if (!objFile) {
			console.error('OBJ file not found in the ZIP');
			return;
		} else {
			view.objFormat = "obj";
		}

		const mtlFile = fileNames.find((fileName) => /\.mtl$/i.test(fileName));
		if (mtlFile === undefined) {
			console.error('-!!!- No MTL file not found in the ZIP OBJ file : ' + objFile);
			zip.file(objFile).async('string').then(function (objFileData) {								
					const objLoader = new OBJLoader();
					const object = objLoader.parse(objFileData);
					const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
					object.traverse(function (child) {
						if (child instanceof THREE.Mesh) {
							child.castShadow = true;
							//child.material.material = material;
							child.material.color.setHex(0xff00ff);
							child.material.wireframe = view.isWireFrame;
							child.material.side = THREE.DoubleSide;
						}
					});
					let endTime = performance.now()
					console.log("-!!!- ZIP (no mtl) time = " + (endTime - startTime) + " milli");
					
					view.obj = object;
					view.scene.add(object);
					view.obj = object;
					fit_2_window(view.obj, view.currentCamera);
					updateOrthographicCamera(view.orthCamera, view.obj);	
					return;					
			});

		} else {
			zip.file(objFile).async('string').then(function (objFileData) {
				zip.file(mtlFile).async('string').then(function (mtlFileData) {
					const mtlLoader = new MTLLoader();
					const materials = mtlLoader.parse(mtlFileData);
					materials.preload();
					
					const objLoader = new OBJLoader();
					objLoader.setMaterials(materials);
					const object = objLoader.parse(objFileData);
					object.traverse(function (child) {
						if (child instanceof THREE.Mesh) {
							child.castShadow = true;
							child.material.wireframe = view.isWireFrame;
							child.material.side = THREE.DoubleSide;
						}
					});
					let endTime = performance.now()
					console.log("-!!!- ZIP (with mtl) time = " + (endTime - startTime) + " milli");
					
					view.obj = object;
					view.scene.add(object);
					view.obj = object;
					fit_2_window(view.obj, view.currentCamera);
					updateOrthographicCamera(view.orthCamera, view.obj);					
				});
			});
		}

		
		
		let objContent, mtlContent;
        zip.forEach(function (relativePath, zipEntry) {
          if (isSupportedFormat(relativePath)) {
            // Supported format, extract and process the file data
            zipEntry.async('arraybuffer')
              .then(function (fileData) {
                const format = getFileFormat(relativePath);
				if (format === "obj" ) {
					console.log("-!!!- OBJ " +  relativePath)
					objContent = new TextDecoder().decode(fileData);
				} else if (format === "mtl" ) {
					console.log("-!!!- MTL " +  relativePath)
					mtlContent = new TextDecoder().decode(fileData);
				}else {
					// Do GLB or STL
					processFileData(view, fileData, format, relativePath);
					return;
				}				
              });
          }
        });
      })
      .catch(function (error) {
        console.error('Failed to load ZIP file:', error);
      });
  },
  function (progress) {
    // Progress callback (optional)
    console.log('-!!!- ZIP file loading progress:', progress.loaded, '/', progress.total);
  },
  function (error) {
    // Error callback
    console.error('-###- Failed to load ZIP file:', error);
  });
   console.log("-!!!- Done load ")
}


// Check if the file format is supported
function isSupportedFormat(filename) {
  return (
    filename.endsWith('.stl') ||
    filename.endsWith('.glb') ||
    filename.endsWith('.obj') ||
    (filename.endsWith('.mtl') && hasCorrespondingObjFile(filename))
  );
}

// Check if the ZIP contains a corresponding OBJ file for a given MTL file
function hasCorrespondingObjFile(mtlFilename) {
  const objFilename = mtlFilename.replace('.mtl', '.obj');
  return zip.file(objFilename) !== null;
}

// Extract the file format from the filename
function getFileFormat(filename) {
  if (filename.endsWith('.stl')) {
    return 'stl';
  } else if (filename.endsWith('.glb')) {
    return 'glb';
  } else if (filename.endsWith('.obj')) {
    return 'obj';
  } else {
    return 'mtl';
  }
}

// Process the file data based on the format
function processFileData(view, fileData, format, fileName) {
  switch (format) {
    case 'stl':
      // Process STL file data
      console.log('-!!!- Processing STL file:', fileData);
	  view.objFormat = 'stl';
	  view.objFile = fileName;
	  loadSTL_from_data(view, fileData);
      break;
    case 'glb':
      // Process GLB file data
      console.log('-!!!- Processing GLB file:', fileData);
	  view.objFormat = 'glb';
	  view.objFile = fileName;
	  loadGLB_from_data(view, fileData);
      break;
    case 'obj':
      // Process OBJ file data
      console.log('-!!!- Processing OBJ file:', fileData);
	  view.objFile = fileName;
	  loadOBJ_from_data(view, fileData);
      break;
    case 'mtl':
      // Process MTL file data
      console.log('-!!!- Processing MTL file:', fileData);
	  view.mtlFile = fileName;
	  //loadMTL_from_data(view, fileData);
	  
      break;
    default:
      console.error('Unsupported file format:', format);
  }
  console.log("-!!!- Process OBJ File " + view.objFile);
  console.log("-!!!- Process MTL File " + view.mtlFile);
}

function loadOBJ_from_data(view, fileData) {
	const objLoader = new OBJLoader();
	const obj = objLoader.parse(new TextDecoder().decode(fileData));
	
	const material = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: false })
	obj.traverse(function (child) {
		if (child instanceof THREE.Mesh) {
			child.castShadow = true;
			child.material = material;
			child.material.wireframe = view.isWireFrame;
			child.material.side = THREE.DoubleSide;
		}
	});
	view.obj = obj;
    view.scene.add(view.obj);

	if (debug) {
		console.log("-!!!- Done loading OBJ  file(ZIP) : " + view.objFile);
	}  
}

function loadMTL_from_data(view, fileData) {
	const mtlLoader = new MTLLoader();
	const material = mtlLoader.parse(new TextDecoder().decode(fileData));
	material.preload();
	objLoader.setMaterials( materials );
	view.obj.traverse(function (child) {
		if (child instanceof THREE.Mesh) {
			child.material = material;
		}
	});
	if (debug) {
		console.log(-!!!- "Done loading MTL  file(ZIP) : " + view.objFile);
	}  
}

function loadSTL_from_data(view, fileData) {
	const loader = new STLLoader();
	const geometry = loader.parse(fileData);
	const material = new THREE.MeshStandardMaterial();
	const mesh = new THREE.Mesh(geometry, material);
	mesh.castShadow = true;
	mesh.material.wireframe = false; // default
	view.obj = mesh;
	view.scene.add(mesh);
	
	
	fit_2_window(view.obj, view.currentCamera);
	updateOrthographicCamera(view.orthCamera, view.obj);
	set_wireframe_by_view(view);
	if (debug) {
		console.log("-!!!- Done loading  file (from ZIP) : " + view.objFile);
	}		
}

function loadGLB_from_data(view, fileData) {
	if (debug) {
		console.log("-!!!- Start loading GLB file(ZIP) : " + view.objFile);
	}

	var glflLoader = new GLTFLoader();
	glflLoader.parse(fileData, '', function (gltf) {
		const model = gltf.scene;
		view.obj = model.clone();
		view.scene.add(model);

		fit_2_window(view.obj, view.currentCamera);
		updateOrthographicCamera(view.orthCamera, view.obj);
		set_wireframe_by_view(view);
		if (debug) {
				console.log("-!!!- Done loading  file(ZIP) : " + view.objFile);
		}
    
	});
}
