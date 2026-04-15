import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';

async function init() {
  // THREE SETUP: loader, scene, camera, and renderer
  const gltfLoader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  camera.position.set(2, 7, 15);      // pov: straight on like person walking on path
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize( window.innerWidth, window.innerHeight );
  // render settings for sun in SKY
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  document.body.appendChild( renderer.domElement );   // append canvas to DOM for renderer to draw to

  // RAPIER SETUP
  await RAPIER.init();  // asynchronously loaded

  const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

  // SOUND
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

  // CONTROLS
  // Pointer Lock Camera Controls
  const controls = new PointerLockControls( camera, document.body );
  const keys = {}
  document.addEventListener('keydown', event => keys[event.code] = true);     // if a key is pressed it's flagged 'true' in keys object
  document.addEventListener('keyup', event => keys[event.code] = false);      // if a key is not pressed it's flagged 'false' in keys object 

  const blocker = document.getElementById( 'blocker' );
  const instructions = document.getElementById( 'instructions' );

  instructions.addEventListener( 'click', function () {
    controls.lock();                      // when user clicks inside 'instructions' html element, pointer is locked (camera controls are active)
    if (!(sound.isPlaying)) sound.play(); // play sound once user interacts by clicking
  } );

  controls.addEventListener( 'lock', function () {
    blocker.style.display = 'none';       // don't display block overlay or instructions menu (since child node of blocker), when pointer is locked (controls are active)
  } );

  controls.addEventListener( 'unlock', function () {
    blocker.style.display = 'block';       // display instructions menu and blocker overlay when pointer is unlocked (controls deactivated)
    instructions.style.display = '';
  } );

  // ISLAND Threejs Mesh
  const islandTexturePath = './assets/sand.jpg';
  //const islandNormalsPath = 'assets/islandnormals.jpg';   // for now there is no normal map for the island material, looks better
  const groundTexture = textureLoader.load(islandTexturePath);
  renderer.outputColorSpace = THREE.SRGBColorSpace;         // idk what this does, doesn't appear to do anything to model's render
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
      // vars for ISLAND trimesh collider
      let allVertices = [];
      let allIndices = [];
      let indexOffset = 0;

      // Traverse the model to find meshes
      model.traverse((child) => {
          if (child.isMesh) {
            child.material = material;
            // Optionally, ensure the mesh casts/receives shadows
            child.castShadow = true;
            child.receiveShadow = true;

            // collect vertices and indices for ISLAND Rapier trimesh 
            child.updateWorldMatrix(true, false);
            const geometry = child.geometry.clone();
            geometry.applyMatrix4(child.matrixWorld);

            const pos = geometry.attributes.position.array;
            const idx = geometry.index.array;
            // add vertices
            for (let i = 0; i < pos.length; i++) {
              allVertices.push(pos[i]);
            }
            // add indices (offset required!)
            for (let i = 0; i < idx.length; i++) {
              allIndices.push(idx[i] + indexOffset);
            }
            indexOffset += pos.length / 3;
          }
      });
      
      // ISLAND Rapier 
      // create fixed rigid body
      const islandRigidBodyType = RAPIER.RigidBodyDesc.fixed();
      const islandRigidBody = world.createRigidBody(islandRigidBodyType);
      // create trimesh collider
      const islandColliderDesc = RAPIER.ColliderDesc.trimesh(new Float32Array(allVertices), new Uint32Array(allIndices));
      world.createCollider(islandColliderDesc, islandRigidBody);

      scene.add(model); // add island mesh to scene
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
  const sky = new Sky(); 
  sky.scale.setScalar( 450000 );
  scene.add( sky );

  const sun = new THREE.Vector3();
  const elevation = 3;
  const azimuth = 180;
  const phi = THREE.MathUtils.degToRad( 90 - elevation);
  const theta = THREE.MathUtils.degToRad(azimuth );

  sun.setFromSphericalCoords( 1, phi, theta );
  sky.material.uniforms[ 'sunPosition' ].value.copy( sun );

  // WATER
  const waterGeometry = new THREE.PlaneGeometry( 10000, 10000 );
  const waterNormalsPath =  './assets/waternormals.jpg';
  const water = new Water(
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
  scene.add( water );

  // OCEAN FLOOR Three mesh
  /**This is the first strategy for swimming physics**/
  //Create THREE plane mesh and place below ocean water plane
  const oceanFloorGeometry = new THREE.PlaneGeometry( 10000, 10000 );
  const oceanFloorMaterial = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
  const oceanFloor = new THREE.Mesh( oceanFloorGeometry, oceanFloorMaterial );
  oceanFloor.rotation.x = - Math.PI / 2;
  oceanFloor.position.y -= 1;
  scene.add(oceanFloor); 

  // OCEAN FLOOR Rapier
  const oceanFloorRigidBodyType = RAPIER.RigidBodyDesc.fixed();
  const oceanFloorRigidBody = world.createRigidBody(oceanFloorRigidBodyType);
  const oceanFloorColliderDesc = RAPIER.ColliderDesc.cuboid(5000,1,5000);
  world.createCollider(oceanFloorColliderDesc, oceanFloorRigidBody);

  // Player Body Rapier
  // create kinematic position-based rigid-body
  const playerRigidBodyType = RAPIER.RigidBodyDesc.kinematicPositionBased();
  const playerRigidBody = world.createRigidBody(playerRigidBodyType.setTranslation(0, 5, 0));
  // create capsule collider
  const playerColliderDesc = RAPIER.ColliderDesc.capsule(.5, .5);   // 1 is a more human height, better movement

  const playerCollider = world.createCollider(playerColliderDesc, playerRigidBody);

  // Kinematic Character Controller Rapier
  const characterController = world.createCharacterController(0.2);
  //characterController.setMaxSlopeClimbAngle(Math.PI / 3); // ~45°
  characterController.setMinSlopeSlideAngle(Math.PI / 3); // start sliding on steep slopes

  let velocityY = 0;
  const manualGravity = -9.81;
  const timer = new THREE.Timer();
  // ANIMATE
  function animate() {

    // update physics world
    world.step()
    // update timer (clock)
    timer.update();
    // reset gravity so we don't increase friction over time
    if (characterController.computedGrounded()) {
      velocityY = 0;
    }
    
    // 1. Compute desired movement vector (based on input + camera)
    const move = new THREE.Vector3();
    const delta = timer.getDelta();
    velocityY += manualGravity * delta;
    move.multiplyScalar(delta);
    if (controls.isLocked) {
      const speed = 0.1;

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, camera.up).normalize();

      if (keys['KeyW']) move.add(forward);
      if (keys['KeyS']) move.sub(forward);
      if (keys['KeyA']) move.add(right);
      if (keys['KeyD']) move.sub(right);

      move.normalize().multiplyScalar(speed);
    }
    const currentPos = playerRigidBody.translation();
    // 2. Ask Rapier “How far can I move without colliding?”
    characterController.computeColliderMovement(playerCollider, {x: move.x, y:  velocityY, z: move.z});
    const corrected = characterController.computedMovement();
    // 3. Apply corrected movement
    const newPos = {x: currentPos.x + corrected.x, y: currentPos.y + corrected.y, z: currentPos.z + corrected.z};
    playerRigidBody.setNextKinematicTranslation(newPos);
    // glue camera to player body
    camera.position.set(playerRigidBody.translation().x, playerRigidBody.translation().y, playerRigidBody.translation().z);

    // animate water
    water.material.uniforms[ 'time' ].value += 1.0 / 360.0;   
    
    renderer.render( scene, camera );
  }
}

init();
