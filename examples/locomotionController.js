// Locomotion Controller for Unitree Go1 robot
import * as THREE from 'three';

// Constants for the Go1 robot
const NUM_LEGS = 4;
const JOINTS_PER_LEG = 3;
const NUM_MOTORS = NUM_LEGS * JOINTS_PER_LEG;

// Leg indices
const FR = 0; // Front Right
const FL = 1; // Front Left
const RR = 2; // Rear Right
const RL = 3; // Rear Left

// Joint indices within each leg
const HIP_JOINT = 0;   // Abduction/adduction joint
const THIGH_JOINT = 1; // Hip joint
const CALF_JOINT = 2;  // Knee joint

// Default standing pose (approximately the same as in the keyframe)
const DEFAULT_POSE = [
    // FR
    0.0,  0.9, -1.8,
    // FL
    0.0,  0.9, -1.8,
    // RR
    0.0,  0.9, -1.8,
    // RL
    0.0,  0.9, -1.8
];

// Trotting gait parameters
const TROT_CYCLE_DURATION = 0.6; // seconds
const TROT_STEP_HEIGHT = 0.1;    // meters
const TROT_STEP_LENGTH = 0.15;   // meters
const TROT_PAIRS = [
    [FL, RR], // Diagonal pair 1
    [FR, RL]  // Diagonal pair 2
];

export class LocomotionController {
    constructor(simulation) {
        this.simulation = simulation;
        this.time = 0;
        this.phase = 0;
        this.isMoving = false;
        this.direction = new THREE.Vector3(1, 0, 0); // Forward direction
        this.speed = 0.5; // Movement speed (0-1)
        
        // Initialize controller
        this.reset();
    }
    
    reset() {
        // Set default pose
        for (let i = 0; i < NUM_MOTORS; i++) {
            this.simulation.ctrl[i] = DEFAULT_POSE[i];
        }
    }
    
    setDirection(x, y) {
        // Convert joystick input to direction vector
        this.direction.set(x, y, 0).normalize();
        this.isMoving = (Math.abs(x) > 0.1 || Math.abs(y) > 0.1);
    }
    
    setSpeed(speed) {
        this.speed = Math.max(0, Math.min(1, speed));
    }
    
    update(dt) {
        this.time += dt;
        
        if (!this.isMoving) {
            // If not moving, gradually return to standing pose
            this.returnToStandingPose(dt);
            return;
        }
        
        // Update phase within the gait cycle (0 to 1)
        this.phase = (this.time % TROT_CYCLE_DURATION) / TROT_CYCLE_DURATION;
        
        // Calculate joint positions for each leg based on the trotting gait
        this.applyTrottingGait();
    }
    
    returnToStandingPose(dt) {
        const returnSpeed = 0.5; // How quickly to return to default pose
        
        for (let i = 0; i < NUM_MOTORS; i++) {
            const current = this.simulation.ctrl[i];
            const target = DEFAULT_POSE[i];
            const diff = target - current;
            
            if (Math.abs(diff) > 0.01) {
                this.simulation.ctrl[i] += diff * returnSpeed * dt;
            }
        }
    }
    
    applyTrottingGait() {
        // Calculate which phase each leg is in
        const legPhases = [0, 0, 0, 0]; // Phase for each leg (0 to 1)
        
        // Set phases based on trotting diagonal pairs
        // First diagonal pair
        if (this.phase < 0.5) {
            // Stance phase for first pair
            legPhases[TROT_PAIRS[0][0]] = 0;
            legPhases[TROT_PAIRS[0][1]] = 0;
            // Swing phase for second pair
            legPhases[TROT_PAIRS[1][0]] = this.phase * 2;
            legPhases[TROT_PAIRS[1][1]] = this.phase * 2;
        } else {
            // Swing phase for first pair
            legPhases[TROT_PAIRS[0][0]] = (this.phase - 0.5) * 2;
            legPhases[TROT_PAIRS[0][1]] = (this.phase - 0.5) * 2;
            // Stance phase for second pair
            legPhases[TROT_PAIRS[1][0]] = 0;
            legPhases[TROT_PAIRS[1][1]] = 0;
        }
        
        // Apply leg movements based on phases
        for (let leg = 0; leg < NUM_LEGS; leg++) {
            this.calculateLegJointPositions(leg, legPhases[leg]);
        }
    }
    
    calculateLegJointPositions(leg, phase) {
        // Base joint indices for this leg
        const baseIdx = leg * JOINTS_PER_LEG;
        
        // Default positions
        let hipPos = DEFAULT_POSE[baseIdx + HIP_JOINT];
        let thighPos = DEFAULT_POSE[baseIdx + THIGH_JOINT];
        let calfPos = DEFAULT_POSE[baseIdx + CALF_JOINT];
        
        // Adjust for movement if in swing phase
        if (phase > 0) {
            // Height component - sinusoidal motion for foot clearance
            const heightFactor = Math.sin(phase * Math.PI);
            
            // Forward/backward component - move from back to front during swing
            const swingProgress = phase;
            
            // Apply leg-specific adjustments
            let legDirectionX = this.direction.x;
            let legDirectionY = this.direction.y;
            
            // Invert x direction for left legs
            if (leg === FL || leg === RL) {
                legDirectionY *= -1.0;
            }
            
            // Invert y direction for rear legs
            if (leg === RR || leg === RL) {
                legDirectionX *= -1.0;
            }
            
            // Calculate step offsets
            const stepX = this.speed * TROT_STEP_LENGTH * (swingProgress - 0.5) * legDirectionX;
            const stepY = this.speed * TROT_STEP_LENGTH * (swingProgress - 0.5) * legDirectionY;
            const stepZ = this.speed * TROT_STEP_HEIGHT * heightFactor;
            
            // Apply kinematics (simplified inverse kinematics for demo)
            // Hip joint - controls side-to-side motion
            hipPos += stepY * 0.8;
            
            // Thigh joint - controls forward motion and lifting
            thighPos += stepX * 0.5 - stepZ * 0.5;
            
            // Calf joint - works with thigh to create stepping motion
            calfPos += stepZ * 0.8;
        }
        
        // Set the joint positions
        this.simulation.ctrl[baseIdx + HIP_JOINT] = hipPos;
        this.simulation.ctrl[baseIdx + THIGH_JOINT] = thighPos;
        this.simulation.ctrl[baseIdx + CALF_JOINT] = calfPos;
    }
} 