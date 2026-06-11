import { ICameraController } from 'rewild-renderer';
import { Node } from 'rewild-routing';
import { Asset3D } from './Asset3D';
import { StateMachineData } from './Types';
import { Raycaster } from 'node_modules/rewild-renderer/lib/core/Raycaster';
import { SpotLight } from 'node_modules/rewild-renderer/lib/core/lights/SpotLight';
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
import { UIElementHealthPass } from 'node_modules/rewild-renderer/lib/materials/UIElementHealthPass';
import {
  clamp,
  Color,
  Euler,
  EulerRotationOrder,
} from 'node_modules/rewild-common';

const _euler = new Euler(0, 0, 0, EulerRotationOrder.YXZ);
const _PI_HALF = Math.PI / 2 - 0.01;
const _MOUSE_SENSITIVITY = 0.002;
const _MOVE_SPEED: f32 = 3.0;
const _RUN_MULTIPLIER: f32 = 2.5;
const _DEG2RAD = Math.PI / 180;

export class Player extends Node {
  cameraController: ICameraController;
  asset: Asset3D;
  private _hunger: f32;
  private _health: f32;
  raycaster: Raycaster;
  rapierWorld: World;
  characterController: KinematicCharacterController;
  capsuleBody: RigidBody;
  collider: Collider;
  verticalVelocity: f32 = 0.0;
  grounded: boolean = false;
  terrainLoaded: boolean = false;
  uiHealthBar: UIElementHealthPass;

  // Pointer-lock / mouse-look state
  private _yaw: f32 = 0;
  private _pitch: f32 = 0;
  private _movingForward = false;
  private _movingBackward = false;
  private _movingLeft = false;
  private _movingRight = false;
  private _sprinting = false;
  jumpRequested: boolean = false;
  private _isLocked = false;
  private _canvas: HTMLCanvasElement | null = null;

  private _flashlight: SpotLight | null = null;
  private _flashlightOn: boolean = false;
  private static readonly _FLASHLIGHT_INTENSITY: f32 = 3.5;

  private _onMouseMove: (e: MouseEvent) => void;
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onKeyUp: (e: KeyboardEvent) => void;
  private _onPointerlockChange: () => void;
  private _onCanvasClick: () => void;

  constructor(name: string, autoDispose: boolean = false) {
    super(name, autoDispose);
    this._hunger = 100.0;
    this._health = 100.0;
    this.raycaster = new Raycaster();

    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onPointerlockChange = this._handlePointerlockChange.bind(this);
    this._onCanvasClick = this._handleCanvasClick.bind(this);
  }

  setCamera(cameraController: ICameraController): void {
    this.cameraController = cameraController;
    this.asset = new Asset3D(cameraController.camera.transform);
  }

  requestLock() {
    document.body.requestPointerLock();
  }

  /** Sync internal yaw/pitch from the camera quaternion (e.g. after an external lookAt). */
  syncLookFromCamera() {
    _euler.setFromQuaternion(this.cameraController.camera.transform.quaternion);
    this._yaw = _euler.y;
    this._pitch = _euler.x;
  }

  mount(): void {
    super.mount();

    const stateData = this.stateMachine?.data as StateMachineData;

    if (!this.uiHealthBar) {
      this.uiHealthBar = stateData.renderer.materialManager.get(
        'ui-health-material'
      ) as UIElementHealthPass;
      const healthBar = stateData.renderer.guiManager.createElement(
        this.uiHealthBar
      );
      stateData.renderer.ui.addChild(healthBar.transform);
      healthBar.borderRadius = 20;
      healthBar.width = 0.4;
      healthBar.height = 0.05;
      healthBar.x = 0.3;
      healthBar.y = 0.92;
      healthBar.percentageBasedCalculation = true;
    }

    this._hunger = 100.0;
    this._health = 100.0;
    this.cameraController.camera.transform.position.set(0, 0, -10);
    this.cameraController.camera.lookAt(0, 0, 0);
    this.syncLookFromCamera();

    this._canvas = stateData.renderer.canvas;
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onPointerlockChange);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    this._canvas.addEventListener('click', this._onCanvasClick);

    if (!this._flashlight) {
      const flash = new SpotLight(
        new Color(1, 0.95, 0.85),
        Player._FLASHLIGHT_INTENSITY
      );
      flash.range = 40.0;
      flash.innerAngle = 10 * _DEG2RAD;
      flash.outerAngle = 25 * _DEG2RAD;
      this._flashlight = flash;
    }
    this._flashlight.intensity = 0.0; // off by default
    stateData.renderer.scene.addChild(this._flashlight.transform);

    if (!this.characterController) {
      this.rapierWorld = stateData.gameManager.physicsWorld;

      const rigidBodyDesc =
        RigidBodyDesc.kinematicPositionBased().setTranslation(
          this.cameraController.camera.transform.position.x,
          this.cameraController.camera.transform.position.y - 1.8,
          this.cameraController.camera.transform.position.z
        );

      this.capsuleBody = this.rapierWorld.createRigidBody(rigidBodyDesc);

      const capsuleDesc = ColliderDesc.capsule(0.9, 0.5);
      this.collider = this.rapierWorld.createCollider(
        capsuleDesc,
        this.capsuleBody
      );

      let offset = 0.01;
      this.characterController =
        this.rapierWorld.createCharacterController(offset);

      this.characterController.setApplyImpulsesToDynamicBodies(true);
      this.characterController.setCharacterMass(80.0);
    }
  }

  get hunger(): f32 {
    return this._hunger;
  }

  set hunger(value: f32) {
    this._hunger = clamp(value, 0.0, 100.0);
  }

  get health(): f32 {
    return this._health;
  }

  set health(value: f32) {
    this._health = clamp(value, 0.0, 100.0);
    this.uiHealthBar.healthUniforms.health = this._health / 100.0;
  }

  unMount(): void {
    super.unMount();

    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener(
      'pointerlockchange',
      this._onPointerlockChange
    );
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    this._canvas?.removeEventListener('click', this._onCanvasClick);

    if (document.pointerLockElement) document.exitPointerLock();
    this._canvas = null;

    if (this._flashlight) {
      this._flashlight.transform.removeFromParent();
    }

    this.rapierWorld.removeCharacterController(this.characterController);
  }

  onUpdate(delta: f32, total: u32): void {
    // Apply mouse look to camera
    _euler.set(this._pitch, this._yaw, 0, EulerRotationOrder.YXZ);
    this.cameraController.camera.transform.quaternion.setFromEuler(
      _euler,
      true
    );

    const stateData = this.stateMachine?.data as StateMachineData;
    const R = stateData?.gameManager?.RAPIER;
    let gravityEnabled = true;

    if (!this.terrainLoaded && R && this.rapierWorld && this.capsuleBody) {
      const pos = this.capsuleBody.translation();
      const origin = { x: pos.x, y: pos.y + 2, z: pos.z };
      const dir = { x: 0, y: -1, z: 0 };
      const ray = new R.Ray(origin, dir);
      const maxToi = 100.0;
      const solid = true;

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

    // Jump
    const JUMP_IMPULSE: f32 = 10.5;
    if (this.jumpRequested) {
      if (this.grounded) {
        this.verticalVelocity = JUMP_IMPULSE;
        this.grounded = false;
      }
      this.jumpRequested = false;
    }

    const gravity = gravityEnabled ? -9.81 : 0.0;
    const dt = delta / 0.5;

    if (!gravityEnabled) {
      this.verticalVelocity = 0.0;
    } else if (!this.grounded) {
      this.verticalVelocity += gravity * dt;
    } else if (this.verticalVelocity <= 0.0) {
      this.verticalVelocity = 0.0;
    }

    // Compute horizontal movement from key state (yaw-relative, XZ plane only)
    const sinYaw = Math.sin(this._yaw);
    const cosYaw = Math.cos(this._yaw);
    const speed = _MOVE_SPEED * (this._sprinting ? _RUN_MULTIPLIER : 1.0);
    let moveX: f32 = 0;
    let moveZ: f32 = 0;

    if (this._movingForward) {
      moveX -= sinYaw * speed * dt;
      moveZ -= cosYaw * speed * dt;
    }
    if (this._movingBackward) {
      moveX += sinYaw * speed * dt;
      moveZ += cosYaw * speed * dt;
    }
    if (this._movingRight) {
      moveX += cosYaw * speed * dt;
      moveZ -= sinYaw * speed * dt;
    }
    if (this._movingLeft) {
      moveX -= cosYaw * speed * dt;
      moveZ += sinYaw * speed * dt;
    }

    const desiredMove = new RapierVector3(
      moveX,
      gravityEnabled ? this.verticalVelocity * dt : 0.0,
      moveZ
    );

    this.characterController.computeColliderMovement(
      this.collider,
      desiredMove
    );

    let correctedMovement = this.characterController.computedMovement();

    const controllerGrounded = this.characterController.computedGrounded();

    if (controllerGrounded && this.verticalVelocity < -15.0) {
      const damage = (Math.abs(this.verticalVelocity) - 15.0) * 10.0;
      this.health -= damage;
    }

    this.grounded = controllerGrounded && this.verticalVelocity <= 0.0;
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = 0.0;

    const currentPos = this.capsuleBody.translation();
    this.capsuleBody.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    });

    const pos = this.capsuleBody.translation();
    const camX = pos.x;
    const camY = pos.y + 1.8;
    const camZ = pos.z;
    this.cameraController.camera.transform.position.set(camX, camY, camZ);

    if (this._flashlight) {
      // Always track camera so the cone direction is valid when toggled on.
      this._flashlight.transform.position.set(camX, camY, camZ);
      const sinYaw = Math.sin(this._yaw);
      const cosYaw = Math.cos(this._yaw);
      const sinPitch = Math.sin(this._pitch);
      const cosPitch = Math.cos(this._pitch);
      this._flashlight.target.position.set(
        camX - sinYaw * cosPitch,
        camY + sinPitch,
        camZ - cosYaw * cosPitch
      );
    }
  }

  private _handleMouseMove(e: MouseEvent) {
    if (!this._isLocked) return;
    this._yaw -= e.movementX * _MOUSE_SENSITIVITY;
    this._pitch -= e.movementY * _MOUSE_SENSITIVITY;
    this._pitch = Math.max(-_PI_HALF, Math.min(_PI_HALF, this._pitch));
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (e.code === 'KeyW') this._movingForward = true;
    else if (e.code === 'KeyS') this._movingBackward = true;
    else if (e.code === 'KeyA') this._movingLeft = true;
    else if (e.code === 'KeyD') this._movingRight = true;
    else if (e.code === 'Space') this.jumpRequested = true;
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight')
      this._sprinting = true;
    else if (e.code === 'KeyF' && this._flashlight) {
      this._flashlightOn = !this._flashlightOn;
      this._flashlight.intensity = this._flashlightOn
        ? Player._FLASHLIGHT_INTENSITY
        : 0.0;
    }
  }

  private _handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'KeyW') this._movingForward = false;
    else if (e.code === 'KeyS') this._movingBackward = false;
    else if (e.code === 'KeyA') this._movingLeft = false;
    else if (e.code === 'KeyD') this._movingRight = false;
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight')
      this._sprinting = false;
  }

  private _handlePointerlockChange() {
    this._isLocked = !!document.pointerLockElement;
  }

  private _handleCanvasClick() {
    if (!this._isLocked) document.body.requestPointerLock();
  }
}
