import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// set up loader, scene, camera, and renderer
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.set(2, 7, 15);    // pov: straight on like person walking on path
const renderer = new THREE.WebGLRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
// render settings for sun in sky
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
document.body.appendChild( renderer.domElement );

// Pointer Lock camera control
const controls = new PointerLockControls( camera, document.body );

const blocker = document.getElementById( 'blocker' );
const instructions = document.getElementById( 'instructions' );

// START
const soundPath = './sounds/ambient_ocean.mp3';
const listener = new THREE.AudioListener();           // create an AudioListener and add it to the camera
camera.add( listener );                         
const sound = new THREE.Audio( listener );            // create a global audio source
const audioLoader = new THREE.AudioLoader();          // load a sound and set it as the Audio object's buffer
audioLoader.load( soundPath, function( buffer ) {
	sound.setBuffer(buffer);
	sound.setLoop(true);
	sound.setVolume(0.1);
});

instructions.addEventListener( 'click', function () {
  controls.lock();                      // when user clicks inside 'instructions' html element, pointer is locked (camera controls are active)
  if (!(sound.isPlaying)) sound.play(); // play sound once user interacts by clicking
} );

controls.addEventListener( 'lock', function () {
  blocker.style.display = 'none';       // don't display block overlay or instructions menu (since child node of blocker), when pointer is locked (controls are active)
} );

controls.addEventListener( 'unlock', function () {
  blocker.style.display = 'block';       // display instructions menu and block overlay when pointer is unlocked (controls deactivated)
  instructions.style.display = '';
} );

const keys = {}
document.addEventListener('keydown', event => keys[event.code] = true);     // if a key is pressed it's flagged 'true' in keys object
document.addEventListener('keyup', event => keys[event.code] = false);      // 

// ISLAND 
const islandTexturePath = './assets/sand.jpg';
//const islandNormalsPath = 'assets/islandnormals.jpg';   // for now there is no normal map for the island material, looks better
const groundTexture = textureLoader.load(islandTexturePath);
renderer.outputColorSpace = THREE.SRGBColorSpace;
//const normalMap = textureLoader.load(islandNormalsPath);
const material = new THREE.MeshStandardMaterial({
    map: groundTexture,
    //normalMap: normalMap,
    roughness: 0.7,
});

const islandPath = './assets/large_island.glb';
gltfLoader.load(islandPath, 
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1, 1, 1); 
    // Traverse the model to find meshes
    model.traverse((child) => {
        if (child.isMesh) {
            child.material = material;
            // Optionally, ensure the mesh casts/receives shadows
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    
    scene.add(model);

    //Start render loop after model loads for smoother appearance when user visits site
    renderer.setAnimationLoop( animate );
});

// LIGHT
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1);
sunLight.position.set(50, 100, 50);
scene.add(sunLight);

// SKY
let sky = new Sky();
sky.scale.setScalar( 450000 );
scene.add( sky );

let sun = new THREE.Vector3();
let elevation = 3;
let azimuth = 180;
const phi = THREE.MathUtils.degToRad( 90 - elevation);
const theta = THREE.MathUtils.degToRad(azimuth );

sun.setFromSphericalCoords( 1, phi, theta );

sky.material.uniforms[ 'sunPosition' ].value.copy( sun );

// WATER
const waterGeometry = new THREE.PlaneGeometry( 10000, 10000 );
const waterNormalsPath =  './assets/waternormals.jpg';
let water = new Water(
  waterGeometry,
  {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: textureLoader.load( waterNormalsPath, function ( texture ) {

      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

    } ),
    sunDirection: new THREE.Vector3(),
    sunColor: 0xffd8a8,
    waterColor: 0x1e90ff,
    distortionScale: 3.7,
    fog: scene.fog !== undefined
  }
);
water.rotation.x = - Math.PI / 2;
//water.position.y = 0; // raise or lower to improve glitching at border of island
scene.add( water );

// animate scene
function animate() {
  // move camera along xz-axis if controls are locked and a WASD key is pressed
  if (controls.isLocked) {
    if (keys['KeyW']) controls.moveForward(.1);
    if (keys['KeyS']) controls.moveForward(-.1);
    if (keys['KeyA']) controls.moveRight(-.1);
    if (keys['KeyD']) controls.moveRight(.1);
  }
  water.material.uniforms[ 'time' ].value += 1.0 / 360.0;    // make water move
  renderer.render( scene, camera );
}
