import {
  gustField,
  gustShare,
  ICameraController,
  WaterQuery,
  createWaterQuerySample,
} from 'rewild-renderer';
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
import { UIElementMeterPass } from 'node_modules/rewild-renderer/lib/materials/UIElementMeterPass';
import {
  clamp,
  Color,
  Euler,
  EulerRotationOrder,
} from 'node_modules/rewild-common';
import {
  BED_CLEARANCE,
  SWIM_EYE_ABOVE,
  SWIM_SPEED_SHARE,
  holdHeight,
  isSwimming,
  keepsSwimming,
  swimStep,
  wadeSpeedShare,
  waterDrag,
} from './utils/Swimming';
import {
  easeGustPush,
  gustPushSpeed,
  headwindSpeedShare,
} from './utils/Headwind';
import { GroundSlide, MAX_SLOPE_CLIMB } from './utils/Sliding';
import { audio } from '../audio/audio';
import { UnderWaterSound } from '../audio/UnderWaterSound';

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
const _CAPSULE_HALF_HEIGHT: f32 = 0.9;
const _CAPSULE_RADIUS: f32 = 0.5;
// Distance from the capsule's centre to its base.
const _CAPSULE_HALF_EXTENT: f32 = _CAPSULE_HALF_HEIGHT + _CAPSULE_RADIUS;
// A swimmer's capsule is half as long, so they can dive close to the bed.
const _SWIM_HALF_HEIGHT: f32 = 0.2;
const _SWIM_HALF_EXTENT: f32 = _SWIM_HALF_HEIGHT + _CAPSULE_RADIUS;
// How far the capsule centre moves up as the swimmer's capsule shrinks to it.
const _SWIM_CENTRE_SHIFT: f32 = _CAPSULE_HALF_EXTENT - _SWIM_HALF_EXTENT;
// A swimmer's eye over their capsule centre: as far above its top as standing.
const _SWIM_EYE_HEIGHT: f32 = _STANDING_EYE_HEIGHT - _SWIM_CENTRE_SHIFT;
const _SWIM_EYE_ABOVE_FEET: f32 = _SWIM_HALF_EXTENT + _SWIM_EYE_HEIGHT;
// Metres the feet keep above the bed as a swimmer stands up.
const _STAND_BED_CLEARANCE: f32 = 0.02;
// The standing eye's height above the feet; water depths are measured by it.
const _EYE_ABOVE_FEET: f32 = _CAPSULE_HALF_EXTENT + _STANDING_EYE_HEIGHT;
// Where the capsule centre goes when spawning onto a known ground height: just
// clear of the surface, so the character controller settles the last fraction
// instead of starting interpenetrated.
const _SPAWN_GROUND_CLEARANCE: f32 = _CAPSULE_HALF_EXTENT + 0.6;
// Lowest the capsule centre may sit when no ground height is known — keeps its
// base on y=0 rather than below it.
const _MIN_CAPSULE_Y: f32 = _CAPSULE_HALF_EXTENT;
// Downward nudge applied while grounded; Rapier only snaps a movement that
// already points down.
const _GROUND_STICK: f32 = 0.001;
// Hunger empties over ten minutes; once it has, starvation drains health over one.
const _HUNGER_DRAIN_PER_SEC: f32 = 50 / 600;
const _STARVATION_DAMAGE_PER_SEC: f32 = 100 / 60;
// Reused so the per-frame update allocates nothing.
const _spawnTranslation = { x: 0, y: 0, z: 0 };
const _resizeTranslation = { x: 0, y: 0, z: 0 };

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
  /** Whether the player stands on ground gentle enough to jump from. */
  grounded: boolean = false;
  // Whether the capsule rests on any ground, however steep.
  private _onGround: boolean = false;
  private _slide = new GroundSlide();
  // Set once the level's rigid bodies have been released — the world is as
  // ready as it is going to get.
  terrainLoaded: boolean = false;
  // Set once there is collidable ground beneath the player. Gravity stays off
  // until then so nobody falls through terrain whose collider hasn't been built.
  hasGround: boolean = false;
  // Set once the player has been placed somewhere valid — by a PlayerStart, or
  // by the terrain-surface fallback for levels that have no PlayerStart.
  spawnResolved: boolean = false;
  /** Whether the player is swimming rather than standing. */
  swimming: boolean = false;
  /** Metres of water over the player's feet, waves included. */
  immersion: f32 = 0;
  /** Whether the camera's eye is below the water's surface. */
  cameraUnderWater: boolean = false;
  private _underWaterSound: UnderWaterSound | null = null;
  private _water = createWaterQuerySample();
  // World height a submerged swimmer holds their eye at; NaN while floating.
  private _swimHold: f32 = NaN;
  private _waterProbe = -1;
  private _waterQuery: WaterQuery | null = null;
  // Metres a second the wind's gusts shove the player downwind.
  private _gustPush: f32 = 0;
  uiHealthBar: UIElementMeterPass;
  uiHungerBar: UIElementMeterPass;
  /** Called once when health reaches zero. */
  onDeath: (() => void) | null = null;
  private _dead: boolean = false;

  // Pointer-lock / mouse-look state
  private _yaw: f32 = 0;
  private _pitch: f32 = 0;
  private _movingForward = false;
  private _movingBackward = false;
  private _movingLeft = false;
  private _movingRight = false;
  private _sprinting = false;
  // Held keys: C dives and Space rises while swimming.
  private _downHeld = false;
  private _upHeld = false;
  jumpRequested: boolean = false;
  private _isLocked = false;
  private _canvas: HTMLCanvasElement | null = null;

  private _flashlight: SpotLight | null = null;
  private _flashlightOn: boolean = false;
  private _crouching: boolean = false;
  // Modelled on a 1000-lumen LED torch: ~5,000 cd peak, ANSI throw 141m — the
  // distance at which it lights a surface as brightly as a full moon (moon key
  // light intensity 18). Intensity is set so the beam meets that at 141m under
  // its own decay: 18 * 141^1.2 ≈ 6800.
  //
  // Decay is below inverse-square because exposure is fixed: real 1/d² spans
  // too many stops between 5m and 100m for one exposure to show both, and
  // without eye adaptation the near ground blows out while the far end vanishes.
  private static readonly _FLASHLIGHT_INTENSITY: f32 = 5800;
  private static readonly _FLASHLIGHT_DECAY: f32 = 1.2;
  // Window stays near 1 through the 141m throw and reaches zero at range.
  private static readonly _FLASHLIGHT_RANGE: f32 = 400;

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
    if (this._dead) return;
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
      const { materialManager, guiManager, ui } = stateData.renderer;
      this.uiHealthBar = materialManager.get(
        'ui-health-material'
      ) as UIElementMeterPass;
      const healthBar = guiManager.createElement(this.uiHealthBar);
      ui.addChild(healthBar.transform);
      healthBar.borderRadius = 20;
      healthBar.width = 0.4;
      healthBar.height = 0.05;
      healthBar.x = 0.3;
      healthBar.y = 0.92;
      healthBar.percentageBasedCalculation = true;

      this.uiHungerBar = materialManager.get(
        'ui-hunger-material'
      ) as UIElementMeterPass;
      const hungerBar = guiManager.createElement(this.uiHungerBar);
      ui.addChild(hungerBar.transform);
      hungerBar.borderRadius = 12;
      hungerBar.width = 0.4;
      hungerBar.height = 0.03;
      hungerBar.x = 0.3;
      hungerBar.y = 0.88;
      hungerBar.percentageBasedCalculation = true;
    }

    this.hunger = 100.0;
    this.health = 100.0;
    this._dead = false;
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
    this.stopMotion();
    this.swimming = false;
    this.collider?.setHalfHeight(_CAPSULE_HALF_HEIGHT);
    this._swimHold = NaN;
    this.immersion = 0;
    this.cameraUnderWater = false;
    this._waterQuery = stateData.renderer.terrainRenderer.waterQuery;
    this._underWaterSound?.dispose();
    const scope = stateData.gameManager?.sound;
    this._underWaterSound = scope ? new UnderWaterSound(audio, scope) : null;
    if (this._waterProbe < 0)
      this._waterProbe = this._waterQuery.acquireProbe();

    this._canvas = stateData.renderer.canvas;
    // The lock may already be held: GameManager requests it before the first
    // OnLoop mounts this node, so the change event has fired without us.
    this._isLocked = !!document.pointerLockElement;
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
      flash.range = Player._FLASHLIGHT_RANGE;
      flash.decay = Player._FLASHLIGHT_DECAY;
      // ~10° hotspot fading into a ~40° spill, typical of a reflector torch.
      flash.innerAngle = 5 * _DEG2RAD;
      flash.outerAngle = 20 * _DEG2RAD;
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

      const capsuleDesc = ColliderDesc.capsule(
        _CAPSULE_HALF_HEIGHT,
        _CAPSULE_RADIUS
      );
      this.collider = this.rapierWorld.createCollider(
        capsuleDesc,
        this.capsuleBody
      );

      let offset = 0.01;
      this.characterController =
        this.rapierWorld.createCharacterController(offset);

      this.characterController.setApplyImpulsesToDynamicBodies(true);
      this.characterController.setCharacterMass(80.0);
      this.characterController.setMaxSlopeClimbAngle(MAX_SLOPE_CLIMB);
    }
  }

  get hunger(): f32 {
    return this._hunger;
  }

  set hunger(value: f32) {
    this._hunger = clamp(value, 0.0, 100.0);
    this.uiHungerBar.meter.value = this._hunger / 100.0;
  }

  get dead(): boolean {
    return this._dead;
  }

  get health(): f32 {
    return this._health;
  }

  set health(value: f32) {
    this._health = clamp(value, 0.0, 100.0);
    this.uiHealthBar.meter.value = this._health / 100.0;
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

    this._waterQuery?.releaseProbe(this._waterProbe);
    this._waterProbe = -1;
    this._waterQuery = null;

    this._underWaterSound?.dispose();
    this._underWaterSound = null;

    if (this.rapierWorld && this.characterController) {
      this.rapierWorld.removeCharacterController(this.characterController);
    }
  }

  /**
   * Shrinks the capsule to the swimmer's as they start to swim, keeping its
   * top and the eye where they are, and grows it back as they stand, reaching
   * down as far as the bed under `feet` allows so the eye rises no more than
   * it must.
   */
  private _resizeForSwimming(
    swimming: boolean,
    feet: number,
    bed: number
  ): void {
    const p = this.capsuleBody.translation();
    let shift = _SWIM_CENTRE_SHIFT;
    if (!swimming) {
      const room = feet - (bed + _STAND_BED_CLEARANCE);
      shift -= Math.min(2 * _SWIM_CENTRE_SHIFT, Math.max(0, room));
    }
    this.collider.setHalfHeight(
      swimming ? _SWIM_HALF_HEIGHT : _CAPSULE_HALF_HEIGHT
    );
    _resizeTranslation.x = p.x;
    _resizeTranslation.y = p.y + shift;
    _resizeTranslation.z = p.z;
    this.capsuleBody.setTranslation(_resizeTranslation, true);
  }

  /** Drops any slide and ground contact, e.g. after a teleport. */
  stopMotion(): void {
    this._onGround = false;
    this._slide.reset();
  }

  private _die(): void {
    this._dead = true;
    this.stopMotion();
    this._movingForward = false;
    this._movingBackward = false;
    this._movingLeft = false;
    this._movingRight = false;
    this._sprinting = false;
    this.onDeath?.();
    if (document.pointerLockElement) document.exitPointerLock();
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
    if (this._dead) return;

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
        this.stopMotion();
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

    // The water over the feet, with the waves the probe last reported.
    const water = this._water;
    let body = this.capsuleBody.translation();
    const feet =
      body.y - (this.swimming ? _SWIM_HALF_EXTENT : _CAPSULE_HALF_EXTENT);
    const inWater =
      hasTerrain &&
      terrainRenderer!.waterQuery.sample(
        body.x,
        body.z,
        water,
        this._waterProbe
      ) &&
      water.coverage > 0;
    this.immersion = inWater ? Math.max(0, water.surface - feet) : 0;
    const entryVelocity = this.verticalVelocity;
    const wasSwimming = this.swimming;
    this.swimming =
      gravityEnabled &&
      inWater &&
      (wasSwimming
        ? keepsSwimming(water.surface - water.ground, _EYE_ABOVE_FEET)
        : isSwimming(false, this.immersion, _EYE_ABOVE_FEET));
    if (this.swimming !== wasSwimming) {
      this._resizeForSwimming(
        this.swimming,
        feet,
        inWater ? water.ground : feet
      );
      body = this.capsuleBody.translation();
    }
    if (this.swimming) this._crouching = false;

    // Jump
    const JUMP_IMPULSE: f32 = 10.5;
    if (this.jumpRequested) {
      if (this.grounded && !this.swimming) {
        this.verticalVelocity = JUMP_IMPULSE;
        this.grounded = false;
        this._onGround = false;
      }
      this.jumpRequested = false;
    }

    const gravity = gravityEnabled ? -9.81 : 0.0;
    const dt = delta / 0.5;

    if (!gravityEnabled) {
      this.verticalVelocity = 0.0;
    } else if (this.swimming) {
      this.verticalVelocity = waterDrag(this.verticalVelocity, delta);
    } else if (!this._onGround) {
      this.verticalVelocity += gravity * dt;
    } else if (this.verticalVelocity <= 0.0) {
      this.verticalVelocity = 0.0;
    }

    // Compute horizontal movement from key state (yaw-relative, XZ plane only)
    const sinYaw = Math.sin(this._yaw);
    const cosYaw = Math.cos(this._yaw);
    const eyeHeight = this.swimming
      ? _SWIM_EYE_HEIGHT
      : this._crouching
      ? _CROUCH_EYE_HEIGHT
      : _STANDING_EYE_HEIGHT;
    const speed =
      _MOVE_SPEED *
      (this._sprinting ? _RUN_MULTIPLIER : 1.0) *
      (this._crouching && !this.swimming ? _CROUCH_SPEED_MULTIPLIER : 1.0) *
      (this.swimming
        ? SWIM_SPEED_SHARE
        : wadeSpeedShare(this.immersion, _EYE_ABOVE_FEET));
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

    // A gale holds back a player walking into it, and its gusts shove them
    // downwind, arriving with the gusts the trees around them bend to.
    const windState = stateData?.renderer?.sky?.skyRenderer?.wind;
    const wind = windState?.vec;
    if (windState && wind && !this.swimming) {
      const share = headwindSpeedShare(moveX, moveZ, wind[0], wind[1], wind[2]);
      moveX *= share;
      moveZ *= share;
      const gust = gustShare(gustField(body.x, body.z, windState.gustDrift));
      this._gustPush = easeGustPush(
        this._gustPush,
        gustPushSpeed(gust, wind[2]),
        delta
      );
      moveX += wind[0] * this._gustPush * delta;
      moveZ += wind[1] * this._gustPush * delta;
    } else {
      this._gustPush = 0;
    }

    this._slide.step(
      moveX,
      moveZ,
      this._onGround,
      gravityEnabled && !this.swimming,
      dt,
      delta
    );
    moveX = this._slide.moveX;
    moveZ = this._slide.moveZ;

    let moveY: f32 = gravityEnabled ? this.verticalVelocity * dt : 0.0;
    if (this.swimming) {
      const eyeY = body.y + eyeHeight;
      this._swimHold = holdHeight(
        this._swimHold,
        eyeY,
        this._downHeld,
        this._upHeld,
        delta,
        water.level,
        water.ground + _SWIM_EYE_ABOVE_FEET + BED_CLEARANCE
      );
      const target = Number.isNaN(this._swimHold)
        ? water.surface + SWIM_EYE_ABOVE
        : this._swimHold;
      moveY += swimStep(eyeY, target, delta);
    } else this._swimHold = NaN;

    // Snapping keeps the player on the ground going downhill, where the step
    // would otherwise carry them off the slope into a fall. Rapier only snaps
    // from a grounded start, so jumps and falls are unaffected.
    if (this.swimming) this.characterController.disableSnapToGround();
    else {
      this.characterController.enableSnapToGround(
        this._slide.snapDistance(Math.hypot(moveX, moveZ))
      );
      if (this._onGround) moveY -= _GROUND_STICK;
    }

    const desiredMove = new RapierVector3(moveX, moveY, moveZ);

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

    if (this.spawnResolved) {
      if (this._hunger > 0) this.hunger -= _HUNGER_DRAIN_PER_SEC * delta;
      else this.health -= _STARVATION_DAMAGE_PER_SEC * delta;
    }

    this._onGround =
      controllerGrounded && this.verticalVelocity <= 0.0 && !this.swimming;
    if (this._onGround && this.verticalVelocity < 0)
      this.verticalVelocity = 0.0;

    const currentPos = this.capsuleBody.translation();
    const nextX = currentPos.x + correctedMovement.x;
    const nextY = currentPos.y + correctedMovement.y;
    const nextZ = currentPos.z + correctedMovement.z;
    this.capsuleBody.setNextKinematicTranslation({
      x: nextX,
      y: nextY,
      z: nextZ,
    });

    if (R)
      this._slide.probe(
        R,
        this.rapierWorld,
        this.collider,
        this.capsuleBody,
        this._onGround,
        nextX,
        nextY,
        nextZ
      );
    this.grounded = this._onGround && this._slide.walkable;

    const pos = this.capsuleBody.translation();
    const camX = pos.x;
    const camY = pos.y + eyeHeight;
    const camZ = pos.z;
    this.cameraController.camera.transform.position.set(camX, camY, camZ);
    this.cameraUnderWater = inWater && camY < water.surface;
    this._underWaterSound?.update(
      this.immersion,
      inWater ? water.surface - water.ground : 0,
      this.cameraUnderWater,
      entryVelocity,
      delta
    );

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

    if (this._health <= 0) this._die();
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
    else if (e.code === 'Space') {
      this.jumpRequested = true;
      this._upHeld = true;
    } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight')
      this._sprinting = true;
    else if (e.code === 'KeyC') {
      this._downHeld = true;
      if (!e.repeat && !this.swimming) this._crouching = !this._crouching;
    } else if (e.code === 'KeyF' && this._flashlight) {
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
    else if (e.code === 'Space') this._upHeld = false;
    else if (e.code === 'KeyC') this._downHeld = false;
    else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight')
      this._sprinting = false;
  }

  private _handlePointerlockChange() {
    this._isLocked = !!document.pointerLockElement;
  }

  private _handleCanvasClick() {
    if (!this._isLocked && !this._dead) document.body.requestPointerLock();
  }
}
