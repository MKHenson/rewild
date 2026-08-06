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
const _CROUCH_SPEED_MULTIPLIER: f32 = 0.5;
const _STANDING_EYE_HEIGHT: f32 = 1.8;
const _CROUCH_EYE_HEIGHT: f32 = 0.9;
// Flashlight hangs below the camera eye line (chest/hip level) to create natural shadow offset.
const _FLASHLIGHT_BODY_DROP: f32 = 0.8;
const _DEG2RAD = Math.PI / 180;
// Distance from the capsule's centre to its base (0.9 half-height + 0.5 radius).
const _CAPSULE_HALF_EXTENT: f32 = 1.4;
// Where the capsule centre goes when spawning onto a known ground height: just
// clear of the surface, so the character controller settles the last fraction
// instead of starting interpenetrated.
const _SPAWN_GROUND_CLEARANCE: f32 = _CAPSULE_HALF_EXTENT + 0.6;
// Lowest the capsule centre may sit when no ground height is known — keeps its
// base on y=0 rather than below it.
const _MIN_CAPSULE_Y: f32 = _CAPSULE_HALF_EXTENT;
// Reused so the per-frame update allocates nothing.
const _spawnTranslation = { x: 0, y: 0, z: 0 };

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
  // Set once the level's rigid bodies have been released — the world is as
  // ready as it is going to get.
  terrainLoaded: boolean = false;
  // Set once there is collidable ground beneath the player. Gravity stays off
  // until then so nobody falls through terrain whose collider hasn't been built.
  hasGround: boolean = false;
  // Set once the player has been placed somewhere valid — by a PlayerStart, or
  // by the terrain-surface fallback for levels that have no PlayerStart.
  spawnResolved: boolean = false;
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
  private _crouching: boolean = false;
  // Was 1.5 against the plateau falloff, which sat at ~0.93 at the beam's 30m
  // mid-range rather than the linear ramp's 0.5 — so this is converted against
  // that, not against the generic ramp factor in Light.intensity. It preserves
  // how bright the beam reads at 30m; near the player it is now much brighter
  // and past ~40m much dimmer, because inverse-square says so.
  private static readonly _FLASHLIGHT_INTENSITY: f32 = 2422.2;

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

    // A remount is a fresh game: re-run spawn placement and re-arm the ground
    // gate rather than inheriting the previous session's state.
    this.terrainLoaded = false;
    this.hasGround = false;
    this.spawnResolved = false;
    this.grounded = false;
    this.verticalVelocity = 0.0;

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
      // Beam throw. Falloff is inverse-square with a window that reaches zero
      // at range, so brightness now drops continuously rather than holding a
      // plateau — but the range still needs to be generous enough that terrain
      // the beam lands on down-slope lights at all instead of silently falling
      // outside it.
      flash.range = 60.0;
      flash.innerAngle = 10 * _DEG2RAD;
      flash.outerAngle = 25 * _DEG2RAD;
      flash.castShadow = true;
      this._flashlight = flash;
    }
    this._flashlight.intensity = 0.0; // off by default
    stateData.renderer.scene.addChild(this._flashlight.transform);

    if (!this.characterController) {
      this.rapierWorld = stateData.gameManager.physicsWorld;

      const camPos = this.cameraController.camera.transform.position;
      const rigidBodyDesc =
        RigidBodyDesc.kinematicPositionBased().setTranslation(
          camPos.x,
          Math.max(camPos.y - _STANDING_EYE_HEIGHT, _MIN_CAPSULE_Y),
          camPos.z
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

    if (this.rapierWorld && this.characterController) {
      this.rapierWorld.removeCharacterController(this.characterController);
    }
  }

  // The level's rigid bodies start disabled so props don't sink through
  // terrain whose colliders haven't been built yet; this releases them once the
  // world is settled (or once we know no terrain is coming).
  private enableAssetBodies(): void {
    this.stateMachine?.getAllAssets().forEach((asset) => {
      const asset3D = asset as Asset3D;
      asset3D.behaviours.forEach((behaviour) => {
        if (behaviour.name !== 'rigid-body') return;
        const rbBehaviour = behaviour as RigidBodyBehaviour;
        rbBehaviour.rb.setEnabled(true);
      });
    });
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
    const terrainRenderer = stateData?.renderer?.terrainRenderer;
    const hasTerrain = terrainRenderer ? terrainRenderer.enabled : false;

    // A level with no PlayerStart (or no level at all) leaves the player at the
    // origin, which is buried anywhere the terrain rises above y=0. Drop them
    // onto the surface instead. The height comes straight from the heightfield
    // rather than the ground ray below, so it resolves at any altitude — the
    // ray only reaches 100 units and finds nothing when spawning underground.
    // Chunks stream in asynchronously, so this retries until one has heights.
    if (!this.spawnResolved && hasTerrain && this.capsuleBody) {
      const spawnPos = this.capsuleBody.translation();
      const groundY = terrainRenderer!.sampleHeight(spawnPos.x, spawnPos.z);

      if (groundY !== null) {
        _spawnTranslation.x = spawnPos.x;
        _spawnTranslation.y = groundY + _SPAWN_GROUND_CLEARANCE;
        _spawnTranslation.z = spawnPos.z;
        this.capsuleBody.setTranslation(_spawnTranslation, true);
        this.spawnResolved = true;
        this.verticalVelocity = 0.0;
        this.grounded = false;
      }
    }

    // Gravity is held off until there is ground to land on, so an early frame
    // (or a terrain-less level) can't drop the player out of the world.
    let gravityEnabled = this.hasGround;

    if (!this.terrainLoaded && !hasTerrain) {
      // No terrain means nothing to stand on and nothing to wait for. Release
      // the level's rigid bodies so its props behave, and leave the player
      // hovering where they are instead of falling forever.
      this.terrainLoaded = true;
      this.spawnResolved = true;
      this.enableAssetBodies();
    } else if (
      !this.terrainLoaded &&
      R &&
      this.rapierWorld &&
      this.capsuleBody
    ) {
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
        this.hasGround = true;
        this.enableAssetBodies();
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
    const eyeHeight = this._crouching
      ? _CROUCH_EYE_HEIGHT
      : _STANDING_EYE_HEIGHT;
    const speed =
      _MOVE_SPEED *
      (this._sprinting ? _RUN_MULTIPLIER : 1.0) *
      (this._crouching ? _CROUCH_SPEED_MULTIPLIER : 1.0);
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
    const camY = pos.y + eyeHeight;
    const camZ = pos.z;
    this.cameraController.camera.transform.position.set(camX, camY, camZ);

    if (this._flashlight) {
      const flashY = camY - _FLASHLIGHT_BODY_DROP;
      this._flashlight.transform.position.set(camX, flashY, camZ);
      const sinYaw = Math.sin(this._yaw);
      const cosYaw = Math.cos(this._yaw);
      const sinPitch = Math.sin(this._pitch);
      const cosPitch = Math.cos(this._pitch);
      // Target is 1 unit along the camera look direction from the flashlight position (not the eye).
      this._flashlight.target.position.set(
        camX - sinYaw * cosPitch,
        flashY + sinPitch,
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
    else if (e.code === 'KeyC') this._crouching = !this._crouching;
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
