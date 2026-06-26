import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { SimplexNoise } from 'three/examples/jsm/Addons.js';
import { min } from 'three/tsl';

async function init() {
  // THREE SETUP: loader, scene, camera, and renderer
  const gltfLoader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 500000 );
  camera.position.set(0, 15, 0);      // pov: straight on like person walking on path
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize( window.innerWidth, window.innerHeight );
  // render settings for sun in SKY
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;        
  renderer.setPixelRatio(window.devicePixelRatio);

  document.body.appendChild( renderer.domElement );   // append canvas to DOM for renderer to draw to

  // RAPIER SETUP
  await RAPIER.init();  // asynchronously loaded

  const world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });

  // SOUND
  const listener = new THREE.AudioListener();           // create an AudioListener and add it to the camera
  camera.add( listener ); 
  const audioLoader = new THREE.AudioLoader();          // load a sound and set it as the Audio object's buffer

  // OCEAN SOUND  
  const oceanSoundPath = './sounds/ambient_ocean.mp3';                      
  const oceanSound = new THREE.Audio( listener );            // create a global audio source
  audioLoader.load( oceanSoundPath, function( buffer ) {
    oceanSound.setBuffer(buffer);
    oceanSound.setLoop(true);
    oceanSound.setVolume(0.1);
  });

  // WALKING SOUND  
  const walkingSoundPath = './sounds/footsteps_short.m4a';                      
  const walkingSound = new THREE.Audio( listener );            // create a global audio source
  audioLoader.load( walkingSoundPath, function( buffer ) {
    walkingSound.setBuffer(buffer);
    walkingSound.setLoop(true);
    walkingSound.setVolume(0.3);
    walkingSound.setPlaybackRate(2);
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
    if (!(oceanSound.isPlaying)) oceanSound.play(); // play sound once user interacts by clicking
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
  const groundTexture = textureLoader.load(islandTexturePath);
  const material = new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 1,
  });

  const islandPath = './assets/large_island_extd.glb';
  gltfLoader.load(islandPath, 
    (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(3);
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



  // SUN
  // Sun THREE vector
  const sun = new THREE.Vector3();
  let sunElevation = 160;   // updated in updateSunAndWate()
  const azimuth = 180;
  let phi = THREE.MathUtils.degToRad( 90 - sunElevation);    // updated in updateSunAndWate()
  const theta = THREE.MathUtils.degToRad(azimuth );
  sun.setFromSphericalCoords( 1, phi, theta );  // use spherical coords to place sun in sky

  //Sun THREE Directional Light object
  let sunIntensity = 0;
  const sunLight = new THREE.DirectionalLight(0xffd8a8, sunIntensity); 
  sunLight.position.set(sun.x, sun.y, sun.z);    // attach sunLight directional light to the sun vector
  scene.add(sunLight);

  // SKY
  const sky = new Sky(); 
  sky.scale.setScalar(450000);
  scene.add(sky);
  sky.material.uniforms['sunPosition'].value.copy(sun); // tell sky where sun is

  // MOON
  // Moon THREE vector
  const moonScale = 80000;
  const moon = new THREE.Vector3();
  let moonElevation = 180 + sunElevation;
  const moonAzimuth = 180;
  let moonPhi = THREE.MathUtils.degToRad(90 - moonElevation);
  const moonTheta = THREE.MathUtils.degToRad(moonAzimuth);
  moon.setFromSphericalCoords(1, moonPhi, moonTheta);   // use spherical coords to place moon in sky

  // Moon THREE Directional Light object
  let moonIntensity = 1;
  const moonLight = new THREE.DirectionalLight(0x5c0909, moonIntensity);  // #9d9dbb #5c0909
  moonLight.position.set(moon.x, moon.y, moon.z).multiplyScalar(moonScale);
  scene.add(moonLight);

  // Moon THREE Mesh object
  const moonTexturePath = './assets/low_res_moon.jpeg';
  const moonTexture = textureLoader.load(moonTexturePath);
  const moonMaterial = new THREE.MeshBasicMaterial({
      map: moonTexture, 
      color: 0xfe5757,    // blood red moon #fe5757
  });
  const moonGeometry = new THREE.SphereGeometry(1000, 20, 20);
  const moonMesh = new THREE.Mesh( moonGeometry, moonMaterial);
  moonMesh.position.set(moon.x, moon.y, moon.z).multiplyScalar(moonScale);
  scene.add(moonMesh); 
  
  // AMBIENT LIGHT
  const ambientLight = new THREE.AmbientLight(0xe49e7b, 1);   // #e49e7b #ff7f50
  scene.add(ambientLight);


  // WATER
  // #f49ac2  #30d5c8 #317ebd  #ff7f50 #000080 #90d5ff
  const waterColors = {sunrise: new THREE.Color(0xf49ac2), morning: new THREE.Color(0x30d5c8), afternoon: new THREE.Color(0x90d5ff), sunset: new THREE.Color(0xff7f50), night: new THREE.Color(0x000080)}; 
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
      sunColor: 0xf9a033, // #f9a033
      waterColor: waterColors["sunrise"],
      distortionScale: 10,
      fog: scene.fog !== undefined, 
    }
  );
  water.rotation.x = - Math.PI / 2;
  scene.add( water );

  // OCEAN FLOOR Three mesh
  //Create THREE plane mesh and place below ocean water plane
  const oceanFloorY = -1;   // change to move ocean floor up or down
  const oceanFloorGeometry = new THREE.PlaneGeometry( 10000, 10000 );
  const whiteSandColor = 0xf5ebd8;
  const oceanFloorMaterial = new THREE.MeshBasicMaterial( { color: whiteSandColor } );
  const oceanFloor = new THREE.Mesh( oceanFloorGeometry, oceanFloorMaterial );
  oceanFloor.rotation.x = - Math.PI / 2;
  oceanFloor.position.y = oceanFloorY;
  scene.add(oceanFloor); 

  // OCEAN FLOOR Rapier
  const oceanFloorRigidBodyType = RAPIER.RigidBodyDesc.fixed().setTranslation(0.0, oceanFloorY, 0.0);;
  const oceanFloorRigidBody = world.createRigidBody(oceanFloorRigidBodyType);
  const oceanFloorColliderDesc = RAPIER.ColliderDesc.cuboid(5000,.05,5000)
  world.createCollider(oceanFloorColliderDesc, oceanFloorRigidBody);

  // Player Body Rapier
  // create kinematic position-based rigid-body
  const playerRigidBodyType = RAPIER.RigidBodyDesc.kinematicPositionBased();
  const playerRigidBody = world.createRigidBody(playerRigidBodyType.setTranslation(0, 8, 0));
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

    timer.update();
    
    // Compute desired movement vector (based on input + camera)
    const move = new THREE.Vector3();
    if (controls.isLocked) {
      const speed = 0.15;

      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();

      const right = new THREE.Vector3();
      right.crossVectors(forward, camera.up).normalize();

      if (keys['KeyW']) move.add(forward);
      if (keys['KeyS']) move.sub(forward);
      if (keys['KeyA']) move.sub(right);
      if (keys['KeyD']) move.add(right);

      move.normalize().multiplyScalar(speed);
    }
    const currentPos = playerRigidBody.translation();

    const delta = timer.getDelta();

    //moonMaterial.side = THREE.FrontSide;
    updateSunAndWater();

    // if player is grounded, don't apply gravity to it's movement
    if (characterController.computedGrounded()) {
      velocityY = 0;  // reset gravity when grounded so friction on player body doesn't increase over time
    }
    else {
      velocityY += manualGravity * delta;// gravity accumulates when player is ungrounded
    }

    // “How far can I move without colliding?”
    characterController.computeColliderMovement(playerCollider, {x: move.x, y: velocityY * delta, z: move.z}); 
    const corrected = characterController.computedMovement();
    // Apply corrected movement
    const newPos = {x: currentPos.x + corrected.x, y: currentPos.y + corrected.y, z: currentPos.z + corrected.z};

    if (moving(currentPos, newPos)) {
      if (!inWater(newPos.y)) {
        if (!(walkingSound.isPlaying)) walkingSound.play(); // play sound (if not already playing) when player is on the sand and moving 
        console.log("walking noise");
      }
    }
    else {
      if (walkingSound.isPlaying) {
        walkingSound.pause();   // pause sound (if playing) when player is not moving
      }
    }
  
    applyBuoyancy(newPos);

    playerRigidBody.setNextKinematicTranslation(newPos);

    // glue camera to player body
    camera.position.set(playerRigidBody.translation().x, playerRigidBody.translation().y, playerRigidBody.translation().z);

    // animate water
    water.material.uniforms[ 'time' ].value += 1.0 / 360.0;   
    
    renderer.render( scene, camera );
  }

  // given CUR a 3d vector representing current position and NEXT a 3d vector representing next position, 
  //    returns boolean TRUE if x,y,z of CUR equals x,y,z of NEXT.
  function moving(cur, next){
    return cur.x != next.x && cur.y != next.y && cur.z != next.z;
  }


  const waterLevel = .4;    // used in inWater() !
  // given Y (an int vertical axis position value), returns boolean TRUE if Y is at or below WATERLEVEL
  function inWater(y) {
    const rv = y <= waterLevel;
    return rv;
  }

  function applyBuoyancy(pos) {
    // given POS position vector 
    //  apply an upward lift to y comp 
    const time = timer.getElapsed();
    const buoyancyFactor = Math.sin(2.5*time) * 0.0018;   
    if (inWater(pos.y) && pos.y >= -.4) { /// if player is in the water and not below map
      pos.y = pos.y + buoyancyFactor;
    }
    return;
  }

  const maxIntensity = 5;
  const minIntensity = 0;
  const sunElevationIncConst = .03;
  let amountWaterColorLerp;    // for water color lerp
  let amountSunIntenLerp;    // for sunlight intensity linear interpolation calc
  let waterColorLerp;

  // increase sun's sunElevation as time passes
  // Mutates: sunElevation, SUNLIGHT.INTENSITY, and PHI. Note that sunElevation adjusts sunlight.intensity correctly only if both start at 0
  function updateSunAndWater() {  
    phi = THREE.MathUtils.degToRad( 90 - sunElevation);    // update phi
    sun.setFromSphericalCoords( 1, phi, theta);      // update sun vector's position
    sunLight.position.copy(sun).multiplyScalar(1000000); // sync sunLight directional light to sun vector's position
    sky.material.uniforms['sunPosition'].value.copy(sun); // sync sky object's sun to sun vector's position
    water.material.uniforms['sunDirection'].value.copy(sun).normalize();    //sets shadows to follow sun's position

    moonPhi = THREE.MathUtils.degToRad(90 - moonElevation);
    moon.setFromSphericalCoords(1, moonPhi, moonTheta);   // use spherical coords to place moon in sky
    moonLight.position.copy(moon).multiplyScalar(moonScale);
    moonMesh.position.copy(moon).multiplyScalar(moonScale);

    sunElevation += sunElevationIncConst;   // update sun's position
    moonElevation = 180 + sunElevation;     // update moon's position
    amountWaterColorLerp = calcAmountForLerp(sunElevation, 45);    // calc amount for lerp'ing water colors
    amountSunIntenLerp = calcAmountForLerp(sunElevation, 90);

    if (sunElevation >= 0 && sunElevation < 90) {    // sunrise - afternoon:
      sunLight.intensity = lerpSunLightIntensity(minIntensity, maxIntensity,  amountSunIntenLerp);

      if (sunElevation < 45) {    // sunrise - morning
        lerpWaterColors(waterColors.sunrise, waterColors.morning, amountWaterColorLerp);
      }
      else {    //morning - afternoon
        lerpWaterColors(waterColors.morning, waterColors.afternoon, amountWaterColorLerp);
      }

    }

    else if (sunElevation >= 90 && sunElevation < 180) {  // afternoon - sunset:  
      sunLight.intensity = lerpSunLightIntensity(maxIntensity, minIntensity,  amountSunIntenLerp);

      if (sunElevation >= 135) {
        lerpWaterColors(waterColors.afternoon, waterColors.sunset, amountWaterColorLerp);      
      } 
    }

    else if (sunElevation >= 180 && sunElevation < 225) {
      lerpWaterColors(waterColors.sunset, waterColors.night, amountWaterColorLerp);
    }

    else if (sunElevation >= 315 && sunElevation < 360) {
      lerpWaterColors(waterColors.night, waterColors.sunrise, amountWaterColorLerp);
    }

    if (sunElevation >= 360) {                   // nighttime - sunrise: 
      sunElevation = 0;                          // reset sunElevation 
    }
  }
  
    // interval (in deg) for changes to water color
  // given ELEVATION of sun and INTERVAL in deg, calcs AMOUNT, a number in [0,1] used in lerp function
  function calcAmountForLerp(elevation, interval) {
    return  ((elevation / interval) - Math.floor(elevation/interval));
  }

  // Given a COLOR in hex, set's water's waterColor property to COLOR
  function lerpWaterColors(colorA, colorB, amount) {
    waterColorLerp = water.material.uniforms.waterColor.value.lerpColors(colorA, colorB, amount);
  }

  function lerpSunLightIntensity(a, b, amount) {
    let rv = a + amount * (b - a);
    return rv
  }
}


init();
