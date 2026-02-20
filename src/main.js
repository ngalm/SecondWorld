import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';

// set up loader, scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.set(2, 4, 10);    // pov: straight on like person walking on path
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

instructions.addEventListener( 'click', function () {
  controls.lock();                      // when user clicks inside 'instructions' html element, pointer is locked (camera controls are active)
} );

controls.addEventListener( 'lock', function () {
  instructions.style.display = 'none';   // don't display instructions menu or block overlay when pointer is locked (controls are active)
  blocker.style.display = 'none';
} );

controls.addEventListener( 'unlock', function () {
  blocker.style.display = 'block';       // display instructions menu and block overlay when pointer is unlocked (controls deactivated)
  instructions.style.display = '';
} );

const keys = {}
document.addEventListener('keydown', e => keys[e.code] = true);     // if a key is pressed it's flagged 'true' in keys object
document.addEventListener('keyup', e => keys[e.code] = false);      // 

// SKY
let sky = new Sky();
sky.scale.setScalar( 450000 );
scene.add( sky );
console.log(sky.material.uniforms);

let sun = new THREE.Vector3();
let elevation = 3;
let azimuth = 180;
const phi = THREE.MathUtils.degToRad( 90 - elevation);
const theta = THREE.MathUtils.degToRad(azimuth );

sun.setFromSphericalCoords( 1, phi, theta );

sky.material.uniforms[ 'sunPosition' ].value.copy( sun );

// WATER
const waterGeometry = new THREE.PlaneGeometry( 10000, 10000 );

let water = new Water(
  waterGeometry,
  {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load( 'assets/waternormals.jpg', function ( texture ) {

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
renderer.setAnimationLoop( animate );