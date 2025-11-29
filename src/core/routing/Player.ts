import {
  ICameraController,
  IController,
  PointerLockController,
} from 'rewild-renderer';
import { Node } from 'rewild-routing';
import { Asset3D } from './Asset3D';
import { StateMachineData } from './Types';
import { Raycaster } from 'node_modules/rewild-renderer/lib/core/Raycaster';
import {
  World,
  RigidBody,
  ColliderDesc,
  KinematicCharacterController,
  RigidBodyDesc,
  Vector3 as RapierVector3,
  Collider,
} from '@dimforge/rapier3d-compat';
import { RigidBodyBehaviour } from './behaviours/RigidBodyBehaviour';

export class Player extends Node {
  cameraController: ICameraController;
  asset: Asset3D;
  hunger: f32;
  health: f32;
  raycaster: Raycaster;
  rapierWorld: World;
  characterController: KinematicCharacterController;
  capsuleBody: RigidBody;
  collider: Collider;
  controller: IController;
  verticalVelocity: f32 = 0.0;
  grounded: boolean = false;
  terrainLoaded: boolean = false;

  constructor(name: string, autoDispose: boolean = false) {
    super(name, autoDispose);
    this.hunger = 100.0; // Default hunger value
    this.health = 100.0; // Default health value
    this.raycaster = new Raycaster();
    // Rapier fields will be initialized in mount
  }

  setCamera(cameraController: ICameraController): void {
    this.cameraController = cameraController;
    this.asset = new Asset3D(cameraController.camera.transform);
  }

  mount(): void {
    super.mount();

    const stateData = this.stateMachine?.data as StateMachineData;

    this.hunger = 100.0; // Reset hunger on mount
    this.health = 100.0; // Reset health on mount
    this.cameraController.camera.transform.position.set(0, 0, -10); // Reset position
    this.cameraController.camera.lookAt(0, 0, 0);
    this.controller = stateData.renderer.camController;
    // Ensure controller writes into movementVector instead of directly moving camera.
    (this.controller as PointerLockController).moveCamera = false;

    if (!this.characterController) {
      this.rapierWorld = stateData.gameManager.physicsWorld;

      // Create kinematic position-based rigid body (character controllers need kinematic bodies)
      const rigidBodyDesc =
        RigidBodyDesc.kinematicPositionBased().setTranslation(
          this.cameraController.camera.transform.position.x,
          this.cameraController.camera.transform.position.y - 1.8,
          this.cameraController.camera.transform.position.z
        );

      this.capsuleBody = this.rapierWorld.createRigidBody(rigidBodyDesc);

      // Create capsule collider for player
      const capsuleDesc = ColliderDesc.capsule(0.9, 0.5); // height, radius

      this.collider = this.rapierWorld.createCollider(
        capsuleDesc,
        this.capsuleBody
      );

      // The gap the controller will leave between the character and its environment.
      let offset = 0.01;
      // Create the controller.
      this.characterController =
        this.rapierWorld.createCharacterController(offset);

      // Allow the character to push dynamic bodies it collides with
      this.characterController.setApplyImpulsesToDynamicBodies(true);
      // Set a reasonable mass so impulses have effect (kg)
      this.characterController.setCharacterMass(80.0);
    }
  }

  unMount(): void {
    super.unMount();

    // Remove the controller once we are done with it.
    this.rapierWorld.removeCharacterController(this.characterController);
  }

  onUpdate(delta: f32, total: u32): void {
    const stateData = this.stateMachine?.data as StateMachineData;
    const R = stateData?.gameManager?.RAPIER;
    // Raycast below to decide if gravity should be enabled.
    let gravityEnabled = true;

    // Only turn on gravity if terrain is loaded below player
    if (!this.terrainLoaded && R && this.rapierWorld && this.capsuleBody) {
      const pos = this.capsuleBody.translation();
      const origin = { x: pos.x, y: pos.y + 2, z: pos.z };
      const dir = { x: 0, y: -1, z: 0 };
      const ray = new R.Ray(origin, dir);
      const maxToi = 100.0;
      const solid = true;

      // Only consider terrain colliders via InteractionGroups filter
      const TERRAIN_BIT = 1;
      const TERRAIN_GROUPS = (TERRAIN_BIT << 16) | TERRAIN_BIT;

      const hit = this.rapierWorld.castRay(
        ray,
        maxToi,
        solid,
        R.QueryFilterFlags.EXCLUDE_DYNAMIC | R.QueryFilterFlags.EXCLUDE_SENSORS,
        TERRAIN_GROUPS,
        undefined,
        this.capsuleBody
      );

      if (hit) {
        this.terrainLoaded = true;

        this.stateMachine?.getAllAssets().forEach((asset) => {
          const asset3D = asset as Asset3D;
          asset3D.behaviours.forEach((behaviour) => {
            if (behaviour.name !== 'rigid-body') return;
            const rbBehaviour = behaviour as RigidBodyBehaviour;
            rbBehaviour.rb.setEnabled(true);
          });
        });
      }

      gravityEnabled = !!hit;
    }
    const pointerController = this.controller as PointerLockController;
    const movementVector = pointerController.movementVector;

    // Jump impulse (approx for ~2.1m jump height now for clarity).
    const JUMP_IMPULSE: f32 = 10.5;
    if (pointerController.jumpRequested && this.grounded) {
      this.verticalVelocity = JUMP_IMPULSE;
      this.grounded = false;
      pointerController.jumpRequested = false; // one-shot consume
    }

    // Gravity integration using velocity for kinematic body.
    const gravity = gravityEnabled ? -9.81 : 0.0; // m/s^2
    const dt = delta / 0.5; // delta received in ms

    // Disable gravity/vertical movement if no terrain is detected below
    if (!gravityEnabled) {
      this.verticalVelocity = 0.0;
    } else if (!this.grounded) this.verticalVelocity += gravity * dt;
    else if (this.verticalVelocity <= 0.0) this.verticalVelocity = 0.0; // keep upward velocity if jump just applied
    const desiredMove = new RapierVector3(
      movementVector.x,
      gravityEnabled ? this.verticalVelocity * dt : 0.0,
      movementVector.z
    );

    this.characterController.computeColliderMovement(
      this.collider,
      desiredMove
    );

    // Read the result.
    let correctedMovement = this.characterController.computedMovement();

    // Treat as grounded only if descending or stationary vertically.
    const controllerGrounded = this.characterController.computedGrounded();
    this.grounded = controllerGrounded && this.verticalVelocity <= 0.0;
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = 0.0;

    // Get current position
    const currentPos = this.capsuleBody.translation();

    // Apply the movement to the kinematic body
    this.capsuleBody.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    });

    // Sync camera to collider position (with eye-level offset)
    const pos = this.capsuleBody.translation();
    this.cameraController.camera.transform.position.set(
      pos.x,
      pos.y + 1.8,
      pos.z
    );

    // Clear horizontal movement so next frame starts fresh (vertical managed separately).
    movementVector.set(0, 0, 0);
  }

  // get3DCoords no longer needed with Rapier physics
}
