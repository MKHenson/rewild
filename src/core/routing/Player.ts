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
  private verticalVelocity: f32 = 0.0;
  private grounded: boolean = false;

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
      // Capsule total half-height = height/2 + radius = 0.9/2 + 0.5 = 0.95; spawn so bottom rests on floor y=0.
      const rigidBodyDesc =
        RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.95, -10);

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
    }
  }

  unMount(): void {
    super.unMount();

    // Remove the controller once we are done with it.
    this.rapierWorld.removeCharacterController(this.characterController);
  }

  onUpdate(delta: f32, total: u32): void {
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
    const gravity = -9.81; // m/s^2
    const dt = delta / 0.5; // delta received in ms
    if (!this.grounded) this.verticalVelocity += gravity * dt;
    else if (this.verticalVelocity <= 0.0) this.verticalVelocity = 0.0; // keep upward velocity if jump just applied
    const desiredMove = new RapierVector3(
      movementVector.x,
      this.verticalVelocity * dt,
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
