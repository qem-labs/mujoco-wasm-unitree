// GLTF Loader helper for MuJoCo WebAssembly viewer
import * as THREE from 'three';
// Instead of importing the GLTFLoader, we'll load it dynamically from CDN
// import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';

// Load the GLTFLoader from CDN
const loadGLTFLoader = async () => {
    if (window.GLTFLoader) {
        return window.GLTFLoader;
    }
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/GLTFLoader.js';
        script.onload = () => {
            if (window.THREE && window.THREE.GLTFLoader) {
                resolve(window.THREE.GLTFLoader);
            } else {
                reject(new Error('GLTFLoader not available after loading script'));
            }
        };
        script.onerror = () => reject(new Error('Failed to load GLTFLoader'));
        document.head.appendChild(script);
    });
};

// Cache for loaded models
const modelCache = new Map();

/**
 * Loads a GLTF model and adds it to the scene
 * @param {string} path - Path to the GLTF file
 * @param {THREE.Vector3} position - Position to place the model
 * @param {THREE.Quaternion} rotation - Rotation of the model
 * @param {number} scale - Scale factor for the model
 * @param {THREE.Scene} scene - Three.js scene to add the model to
 * @returns {Promise<THREE.Group>} - The loaded model
 */
export async function loadGLTFModel(path, position, rotation, scale, scene) {
    // Check if model is already loaded
    if (modelCache.has(path)) {
        const cachedModel = modelCache.get(path);
        const model = cachedModel.clone();
        
        model.position.copy(position);
        if (rotation) {
            model.quaternion.copy(rotation);
        }
        model.scale.set(scale, scale, scale);
        
        scene.add(model);
        return model;
    }
    
    try {
        // Get the loader (either from cache or by loading it)
        const GLTFLoader = await loadGLTFLoader();
        
        // Load the model
        const loader = new GLTFLoader();
        
        return new Promise((resolve, reject) => {
            loader.load(
                path,
                (gltf) => {
                    const model = gltf.scene;
                    
                    // Set position, rotation and scale
                    model.position.copy(position);
                    if (rotation) {
                        model.quaternion.copy(rotation);
                    }
                    model.scale.set(scale, scale, scale);
                    
                    // Add to scene
                    scene.add(model);
                    
                    // Enable shadows for all meshes
                    model.traverse((node) => {
                        if (node.isMesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                        }
                    });
                    
                    // Cache the model
                    modelCache.set(path, model.clone());
                    
                    resolve(model);
                },
                (xhr) => {
                    console.log(`${path}: ${(xhr.loaded / xhr.total * 100)}% loaded`);
                },
                (error) => {
                    console.error('Error loading GLTF model:', error);
                    reject(error);
                }
            );
        });
    } catch (error) {
        console.error("Failed to load GLTFLoader:", error);
        throw error;
    }
}

/**
 * Loads multiple GLTF models into the scene
 * @param {Array} modelConfigs - Array of model configurations
 * @param {THREE.Scene} scene - Three.js scene
 * @returns {Promise<Array<THREE.Group>>} - Array of loaded models
 */
export async function loadModels(modelConfigs, scene) {
    const loadPromises = modelConfigs.map(config => {
        const position = new THREE.Vector3(config.position.x, config.position.y, config.position.z);
        const rotation = config.rotation ? new THREE.Quaternion().setFromEuler(
            new THREE.Euler(config.rotation.x, config.rotation.y, config.rotation.z)
        ) : null;
        
        return loadGLTFModel(config.path, position, rotation, config.scale, scene);
    });
    
    return Promise.all(loadPromises);
}

/**
 * Creates a living room environment with furniture using GLTF models
 * @param {THREE.Scene} scene - The Three.js scene to add the environment to
 * @returns {Promise<void>}
 */
export async function createLivingRoomEnvironment(scene) {
    if (!scene) {
        console.error("Scene is required to create living room environment");
        return;
    }
    
    console.log("Creating living room environment");
    
    try {
        // Add directional light for better illumination
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        scene.add(directionalLight);
        
        console.log("Added directional light to living room");
        
        // Try to load the chair model
        try {
            const chairPosition = new THREE.Vector3(0, 1.5, 0.3);
            const chairRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
            await loadGLTFModel('./examples/scenes/assets/gltf/SheenChair.gltf', chairPosition, chairRotation, 0.5, scene);
            console.log("Chair model loaded successfully");
        } catch (error) {
            console.error("Failed to load chair model:", error);
            // Add a simple chair placeholder if the model fails to load
            const chairGeometry = new THREE.BoxGeometry(0.8, 0.8, 1.2);
            const chairMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
            const chair = new THREE.Mesh(chairGeometry, chairMaterial);
            chair.position.set(0, 1.5, 0.6);
            scene.add(chair);
        }
        
        // Add a coffee table
        const tableGeometry = new THREE.BoxGeometry(1.2, 0.8, 0.4);
        const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
        const table = new THREE.Mesh(tableGeometry, tableMaterial);
        table.position.set(1.5, 0, 0.2);
        table.receiveShadow = true;
        table.castShadow = true;
        scene.add(table);
        
        // Add a sofa
        const sofaGeometry = new THREE.BoxGeometry(2.4, 1, 0.8);
        const sofaMaterial = new THREE.MeshStandardMaterial({ color: 0x3F51B5 });
        const sofa = new THREE.Mesh(sofaGeometry, sofaMaterial);
        sofa.position.set(3, 0, 0.4);
        sofa.receiveShadow = true;
        sofa.castShadow = true;
        scene.add(sofa);
        
        // Add a back cushion to the sofa
        const cushionGeometry = new THREE.BoxGeometry(2.4, 0.2, 0.8);
        const cushionMaterial = new THREE.MeshStandardMaterial({ color: 0x303F9F });
        const cushion = new THREE.Mesh(cushionGeometry, cushionMaterial);
        cushion.position.set(3, 0.6, 0.8);
        cushion.receiveShadow = true;
        cushion.castShadow = true;
        scene.add(cushion);
        
        // Add a plant
        const potGeometry = new THREE.CylinderGeometry(0.3, 0.2, 0.4, 16);
        const potMaterial = new THREE.MeshStandardMaterial({ color: 0x795548 });
        const pot = new THREE.Mesh(potGeometry, potMaterial);
        pot.position.set(-3, 3, 0.2);
        pot.receiveShadow = true;
        pot.castShadow = true;
        scene.add(pot);
        
        // Add plant leaves with a cone
        const leavesGeometry = new THREE.ConeGeometry(0.4, 0.8, 16);
        const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x4CAF50 });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.set(-3, 3, 0.8);
        leaves.receiveShadow = true;
        leaves.castShadow = true;
        scene.add(leaves);
        
        console.log("Living room environment created successfully");
        return true;
    } catch (error) {
        console.error("Error creating living room environment:", error);
        return false;
    }
}

/**
 * Creates placeholder furniture if GLTF models fail to load
 * @param {THREE.Scene} scene - Three.js scene
 */
function createPlaceholderFurniture(scene) {
    // Chair
    const chairGroup = new THREE.Group();
    const chairSeat = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.6, 0.1),
        new THREE.MeshPhongMaterial({ color: 0xA67D5D })
    );
    chairSeat.position.set(0, 0, 0.3);
    
    const chairBack = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.1, 0.6),
        new THREE.MeshPhongMaterial({ color: 0xA67D5D })
    );
    chairBack.position.set(0, -0.35, 0.6);
    
    // Chair legs
    const legGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8);
    const legMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
    
    const leg1 = new THREE.Mesh(legGeometry, legMaterial);
    leg1.position.set(0.25, 0.25, 0.15);
    
    const leg2 = new THREE.Mesh(legGeometry, legMaterial);
    leg2.position.set(-0.25, 0.25, 0.15);
    
    const leg3 = new THREE.Mesh(legGeometry, legMaterial);
    leg3.position.set(0.25, -0.25, 0.15);
    
    const leg4 = new THREE.Mesh(legGeometry, legMaterial);
    leg4.position.set(-0.25, -0.25, 0.15);
    
    chairGroup.add(chairSeat, chairBack, leg1, leg2, leg3, leg4);
    chairGroup.position.set(1.5, 1.5, 0);
    chairGroup.rotation.y = Math.PI * 0.75;
    
    scene.add(chairGroup);
    
    // Coffee table
    const tableGroup = new THREE.Group();
    const tableTop = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.8, 0.05),
        new THREE.MeshPhongMaterial({ color: 0x5D4037 })
    );
    tableTop.position.set(0, 0, 0.4);
    
    const tableLeg1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8),
        new THREE.MeshPhongMaterial({ color: 0x3E2723 })
    );
    tableLeg1.position.set(0.5, 0.3, 0.2);
    
    const tableLeg2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8),
        new THREE.MeshPhongMaterial({ color: 0x3E2723 })
    );
    tableLeg2.position.set(-0.5, 0.3, 0.2);
    
    const tableLeg3 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8),
        new THREE.MeshPhongMaterial({ color: 0x3E2723 })
    );
    tableLeg3.position.set(0.5, -0.3, 0.2);
    
    const tableLeg4 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8),
        new THREE.MeshPhongMaterial({ color: 0x3E2723 })
    );
    tableLeg4.position.set(-0.5, -0.3, 0.2);
    
    tableGroup.add(tableTop, tableLeg1, tableLeg2, tableLeg3, tableLeg4);
    tableGroup.position.set(1.5, 0, 0);
    
    scene.add(tableGroup);
    
    // Sofa
    const sofaGroup = new THREE.Group();
    
    const sofaSeat = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1.0, 0.4),
        new THREE.MeshPhongMaterial({ color: 0x303F9F })
    );
    sofaSeat.position.set(0, 0, 0.2);
    
    const sofaBack = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.2, 0.8),
        new THREE.MeshPhongMaterial({ color: 0x303F9F })
    );
    sofaBack.position.set(0, -0.6, 0.6);
    
    const sofaArm1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 1.0, 0.6),
        new THREE.MeshPhongMaterial({ color: 0x303F9F })
    );
    sofaArm1.position.set(1.3, 0, 0.3);
    
    const sofaArm2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 1.0, 0.6),
        new THREE.MeshPhongMaterial({ color: 0x303F9F })
    );
    sofaArm2.position.set(-1.3, 0, 0.3);
    
    sofaGroup.add(sofaSeat, sofaBack, sofaArm1, sofaArm2);
    sofaGroup.position.set(3, 0, 0.3);
    sofaGroup.rotation.y = Math.PI;
    
    scene.add(sofaGroup);
} 