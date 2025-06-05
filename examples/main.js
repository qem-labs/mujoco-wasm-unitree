import * as THREE           from 'three';
import { GUI              } from '../node_modules/three/examples/jsm/libs/lil-gui.module.min.js';
import { OrbitControls    } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { DragStateManager } from './utils/DragStateManager.js';
import { setupGUI, downloadExampleScenesFolder, loadSceneFromURL, getPosition, getQuaternion, toMujocoPos, standardNormal } from './mujocoUtils.js';
import { LocomotionController } from './locomotionController.js';
import { createLivingRoomEnvironment } from './gltfLoader.js';
import   load_mujoco        from '../dist/mujoco_wasm.js';

// Load the MuJoCo Module
const mujoco = await load_mujoco();

// Get scene from URL or use default
let urlParams = new URLSearchParams(window.location.search);
var initialScene = urlParams.get('scene') || "unitree_go1/scene.xml";
console.log("Initial scene set to:", initialScene);

// Set up Emscripten's Virtual File System
mujoco.FS.mkdir('/working');
mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');

// Download all example files first
await downloadExampleScenesFolder(mujoco);

export class MuJoCoDemo {
  constructor() {
    this.mujoco = mujoco;

    // Load in the state from XML
    this.model      = new mujoco.Model("/working/" + initialScene);
    this.state      = new mujoco.State(this.model);
    this.simulation = new mujoco.Simulation(this.model, this.state);
    
    // Create locomotion controller
    this.locomotionController = null;
    
    // Living room environment flag
    this.livingRoomEnabled = false;

    // Define Random State Variables
    this.params = { scene: initialScene, paused: false, help: false, ctrlnoiserate: 0.0, ctrlnoisestd: 0.0, keyframeNumber: 0 };
    this.mujoco_time = 0.0;
    this.bodies  = {}, this.lights = {};
    this.tmpVec  = new THREE.Vector3();
    this.tmpQuat = new THREE.Quaternion();
    this.updateGUICallbacks = [];

    this.container = document.createElement( 'div' );
    document.body.appendChild( this.container );

    this.scene = new THREE.Scene();
    this.scene.name = 'scene';

    this.camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 0.001, 100 );
    this.camera.name = 'PerspectiveCamera';
    this.camera.position.set(2.0, 1.7, 1.7);
    this.scene.add(this.camera);

    this.scene.background = new THREE.Color(0.15, 0.25, 0.35);
    this.scene.fog = new THREE.Fog(this.scene.background, 15, 25.5 );

    this.ambientLight = new THREE.AmbientLight( 0xffffff, 0.1 );
    this.ambientLight.name = 'AmbientLight';
    this.scene.add( this.ambientLight );

    this.renderer = new THREE.WebGLRenderer( { antialias: true } );
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.setSize( window.innerWidth, window.innerHeight );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    this.renderer.setAnimationLoop( this.render.bind(this) );

    this.container.appendChild( this.renderer.domElement );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.7, 0);
    this.controls.panSpeed = 2;
    this.controls.zoomSpeed = 1;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.10;
    this.controls.screenSpacePanning = true;
    this.controls.update();

    window.addEventListener('resize', this.onWindowResize.bind(this));

    // Initialize the Drag State Manager.
    this.dragStateManager = new DragStateManager(this.scene, this.renderer, this.camera, this.container.parentElement, this.controls);
    
    // Add keyboard controls for locomotion
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  async init() {
    // Initialize the three.js Scene using the .xml Model in initialScene
    console.log("Initializing scene:", initialScene);
    [this.model, this.state, this.simulation, this.bodies, this.lights] =  
      await loadSceneFromURL(mujoco, initialScene, this);
    console.log("Scene loaded:", initialScene);

    // Initialize the locomotion controller if we're using the Go1 robot
    if (initialScene.includes("unitree_go1") || initialScene === "living_room.xml") {
      console.log("Initializing locomotion controller for:", initialScene);
      this.locomotionController = new LocomotionController(this.simulation);
      this.params.enableLocomotion = true; // Add parameter to control locomotion
      this.params.locomotionSpeed = 0.5;   // Default speed
      this.params.locomotionDirX = 1.0;    // Default direction (forward)
      this.params.locomotionDirY = 0.0;
    } else {
      this.locomotionController = null;
      this.params.enableLocomotion = false;
    }
    
    // Add living room environment option
    this.params.livingRoomEnabled = false;
    this.params.useLivingRoomScene = initialScene === "living_room.xml";
    
    // Load GLTF furniture models if living room environment is enabled
    if (this.params.useLivingRoomScene) {
      console.log("Living room scene detected, setting up environment");
      this.livingRoomEnabled = true;
      this.params.livingRoomEnabled = true;
      
      // Load furniture models
      try {
        console.log("Attempting to load furniture models");
        await createLivingRoomEnvironment(this.scene);
        console.log("Living room environment loaded successfully");
      } catch (error) {
        console.error("Failed to load living room environment:", error);
      }
    }

    this.gui = new GUI();
    setupGUI(this);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize( window.innerWidth, window.innerHeight );
  }

  render(timeMS) {
    this.controls.update();

    if (!this.params["paused"]) {
      let timestep = this.model.getOptions().timestep;
      if (timeMS - this.mujoco_time > 35.0) { this.mujoco_time = timeMS; }
      while (this.mujoco_time < timeMS) {

        // Update locomotion controller if enabled
        if (this.locomotionController && this.params.enableLocomotion) {
          this.locomotionController.setDirection(
            this.params.locomotionDirX,
            this.params.locomotionDirY
          );
          this.locomotionController.setSpeed(this.params.locomotionSpeed);
          this.locomotionController.update(timestep);
        }
        // Otherwise use the standard control approach
        else {
          // Jitter the control state with gaussian random noise
          if (this.params["ctrlnoisestd"] > 0.0) {
            let rate  = Math.exp(-timestep / Math.max(1e-10, this.params["ctrlnoiserate"]));
            let scale = this.params["ctrlnoisestd"] * Math.sqrt(1 - rate * rate);
            let currentCtrl = this.simulation.ctrl;
            for (let i = 0; i < currentCtrl.length; i++) {
              currentCtrl[i] = rate * currentCtrl[i] + scale * standardNormal();
              this.params["Actuator " + i] = currentCtrl[i];
            }
          }
        }

        // Clear old perturbations, apply new ones.
        if (this.simulation.qfrc_applied && this.simulation.qfrc_applied.length > 0) {
          try {
            for (let i = 0; i < this.simulation.qfrc_applied.length; i++) { 
              this.simulation.qfrc_applied[i] = 0.0; 
            }
          } catch (e) {
            console.error("Error clearing perturbations:", e);
          }
        }
        
        let dragged = this.dragStateManager.physicsObject;
        if (dragged && dragged.bodyID) {
          try {
            for (let b = 0; b < this.model.nbody; b++) {
              if (this.bodies[b]) {
                getPosition  (this.simulation.xpos , b, this.bodies[b].position);
                getQuaternion(this.simulation.xquat, b, this.bodies[b].quaternion);
                this.bodies[b].updateWorldMatrix();
              }
            }
            let bodyID = dragged.bodyID;
            this.dragStateManager.update(); // Update the world-space force origin
            let force = toMujocoPos(this.dragStateManager.currentWorld.clone().sub(this.dragStateManager.worldHit).multiplyScalar(this.model.body_mass[bodyID] * 250));
            let point = toMujocoPos(this.dragStateManager.worldHit.clone());
            this.simulation.applyForce(force.x, force.y, force.z, 0, 0, 0, point.x, point.y, point.z, bodyID);
          } catch (e) {
            console.error("Error applying force:", e);
          }
          // TODO: Apply pose perturbations (mocap bodies only).
        }

        try {
          this.simulation.step();
        } catch (e) {
          console.error("Error stepping simulation:", e);
        }

        this.mujoco_time += timestep * 1000.0;
      }

    } else if (this.params["paused"]) {
      this.dragStateManager.update(); // Update the world-space force origin
      let dragged = this.dragStateManager.physicsObject;
      if (dragged && dragged.bodyID) {
        let b = dragged.bodyID;
        // Skip ahead when paused.
        if (this.model.body_jntnum[b] == 0 || this.model.body_jntnum[b] == 6) {
          this.dragStateManager.update(); // Update the world-space force origin

          let curPos = new THREE.Vector3();
          let curRot = new THREE.Quaternion();
          getPosition  (this.simulation.xpos, b, curPos);
          getQuaternion(this.simulation.xquat, b, curRot);

          let posDiff = this.dragStateManager.currentWorld.clone().sub(this.dragStateManager.worldHit);
          let newPos = curPos.clone().add(posDiff);

          setPositionAndUpdateParent(this.simulation, b, newPos);
          if (this.model.body_jntnum[b] == 6) {
            this.simulation.forward();
          }
        }
      }
      // Force the model to update in the renderer.
      this.mujoco_time = 0;
    }

    // Update body transforms.
    for (let b = 0; b < this.model.nbody; b++) {
      if (this.bodies[b]) {
        getPosition  (this.simulation.xpos , b, this.bodies[b].position);
        getQuaternion(this.simulation.xquat, b, this.bodies[b].quaternion);
        this.bodies[b].updateWorldMatrix();
      }
    }

    // Update light transforms.
    for (let l = 0; l < this.model.nlight; l++) {
      if (this.lights[l]) {
        getPosition(this.simulation.light_xpos, l, this.lights[l].position);
        getPosition(this.simulation.light_xdir, l, this.tmpVec);
        this.lights[l].lookAt(this.tmpVec.add(this.lights[l].position));
      }
    }

    // Update tendon transforms.
    let numWraps = 0;
    if (this.mujocoRoot && this.mujocoRoot.cylinders) {
      let mat = new THREE.Matrix4();
      for (let t = 0; t < this.model.ntendon; t++) {
        let startW = this.simulation.ten_wrapadr[t];
        let r = this.model.tendon_width[t];
        for (let w = startW; w < startW + this.simulation.ten_wrapnum[t] -1 ; w++) {
          let tendonStart = getPosition(this.simulation.wrap_xpos, w    , new THREE.Vector3());
          let tendonEnd   = getPosition(this.simulation.wrap_xpos, w + 1, new THREE.Vector3());
          let tendonAvg   = new THREE.Vector3().addVectors(tendonStart, tendonEnd).multiplyScalar(0.5);

          let validStart = tendonStart.length() > 0.01;
          let validEnd   = tendonEnd  .length() > 0.01;

          if (validStart) { this.mujocoRoot.spheres.setMatrixAt(numWraps    , mat.compose(tendonStart, new THREE.Quaternion(), new THREE.Vector3(r, r, r))); }
          if (validEnd  ) { this.mujocoRoot.spheres.setMatrixAt(numWraps + 1, mat.compose(tendonEnd  , new THREE.Quaternion(), new THREE.Vector3(r, r, r))); }
          if (validStart && validEnd) {
            mat.compose(tendonAvg, new THREE.Quaternion().setFromUnitVectors(
              new THREE.Vector3(0, 1, 0), tendonEnd.clone().sub(tendonStart).normalize()),
              new THREE.Vector3(r, tendonStart.distanceTo(tendonEnd), r));
            this.mujocoRoot.cylinders.setMatrixAt(numWraps, mat);
            numWraps++;
          }
        }
      }
      this.mujocoRoot.cylinders.count = numWraps;
      this.mujocoRoot.spheres  .count = numWraps > 0 ? numWraps + 1: 0;
      this.mujocoRoot.cylinders.instanceMatrix.needsUpdate = true;
      this.mujocoRoot.spheres  .instanceMatrix.needsUpdate = true;
    }

    // Render!
    this.renderer.render( this.scene, this.camera );
  }

  handleKeyDown(event) {
    if (!this.locomotionController || !this.params.enableLocomotion) return;
    
    // Arrow keys for direction
    switch (event.code) {
      case 'ArrowUp':
        this.params.locomotionDirX = 1.0;
        this.params.locomotionDirY = 0.0;
        break;
      case 'ArrowDown':
        this.params.locomotionDirX = -1.0;
        this.params.locomotionDirY = 0.0;
        break;
      case 'ArrowLeft':
        this.params.locomotionDirX = 0.0;
        this.params.locomotionDirY = 1.0;
        break;
      case 'ArrowRight':
        this.params.locomotionDirX = 0.0;
        this.params.locomotionDirY = -1.0;
        break;
      // Speed control
      case 'KeyQ':
        this.params.locomotionSpeed = Math.max(0, this.params.locomotionSpeed - 0.1);
        break;
      case 'KeyE':
        this.params.locomotionSpeed = Math.min(1, this.params.locomotionSpeed + 0.1);
        break;
    }
  }
  
  handleKeyUp(event) {
    if (!this.locomotionController || !this.params.enableLocomotion) return;
    
    // Stop movement when keys are released
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      this.params.locomotionDirX = 0.0;
      this.params.locomotionDirY = 0.0;
    }
  }
}

let demo = new MuJoCoDemo();
await demo.init();
