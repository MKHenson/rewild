import { Vec3 } from '../math/Vec3';
import { Transform } from '../math/Transform';
import { RaycastResult } from '../collision/RaycastResult';
import { Body } from '../objects/Body';

export class WheelInfoOptions {
  constructor(
    /**
     * Connection point, defined locally in the chassis body frame.
     */
    public chassisConnectionPointLocal: Vec3 = new Vec3(),
    public chassisConnectionPointWorld: Vec3 = new Vec3(),
    public directionLocal: Vec3 = new Vec3(),
    public directionWorld: Vec3 = new Vec3(),
    public axleLocal: Vec3 = new Vec3(),
    public axleWorld: Vec3 = new Vec3(),
    /**
     * suspensionRestLength
     * @default 1
     */
    public suspensionRestLength: f32 = 1,
    /**
     * suspensionMaxLength
     * @default 2
     */
    public suspensionMaxLength: f32 = 2,
    /**
     * radius
     * @default 1
     */
    public radius: f32 = 1,
    /**
     * suspensionStiffness
     * @default 100
     */
    public suspensionStiffness: f32 = 100,
    /**
     * dampingCompression
     * @default 10
     */
    public dampingCompression: f32 = 10,
    /**
     * dampingRelaxation
     * @default 10
     */
    public dampingRelaxation: f32 = 10,
    /**
     * frictionSlip
     * @default 10.5
     */
    public frictionSlip: f32 = 10.5,
    /**
     * steering
     * @default 0
     */
    public steering: f32 = 0,
    /**
     * Rotation value, in radians.
     * @default 0
     */
    public rotation: f32 = 0,
    /**
     * deltaRotation
     * @default 0
     */
    public deltaRotation: f32 = 0,
    /**
     * rollInfluence
     * @default 0.01
     */
    public rollInfluence: f32 = 0.01,
    public maxSuspensionForce: f32 = f32.MAX_VALUE,
    /**
     * isFrontWheel
     * @default true
     */
    public isFrontWheel: boolean = true,
    /**
     * clippedInvContactDotSuspension
     * @default 1
     */
    public clippedInvContactDotSuspension: f32 = 1,
    /**
     * suspensionRelativeVelocity
     * @default 0
     */
    public suspensionRelativeVelocity: f32 = 0,
    /**
     * suspensionForce
     * @default 0
     */
    public suspensionForce: f32 = 0,
    /**
     * skidInfo
     * @default 0
     */
    public skidInfo: f32 = 0,
    /**
     * suspensionLength
     * @default 0
     */
    public suspensionLength: f32 = 0,
    /**
     * Max travel distance of the suspension, in meters.
     * @default 1
     */
    public maxSuspensionTravel: f32 = 1,
    /**
     * If the customSlidingRotationalSpeed should be used.
     * @default false
     */
    public useCustomSlidingRotationalSpeed: boolean = false,
    /**
     * Speed to apply to the wheel rotation when the wheel is sliding.
     * @default -0.1
     */
    public customSlidingRotationalSpeed: f32 = -0.1,

    public forwardAcceleration: f32 = 1,
    public sideAcceleration: f32 = 1,
    public slipInfo: f32 = 0
  ) {}
}

export type WheelRaycastResult = RaycastResult;

/**
 * WheelInfo
 */
export class WheelInfo {
  /**
   * Max travel distance of the suspension, in meters.
   * @default 1
   */
  maxSuspensionTravel: f32;
  /**
   * Speed to apply to the wheel rotation when the wheel is sliding.
   * @default -0.1
   */
  customSlidingRotationalSpeed: f32;
  /**
   * If the customSlidingRotationalSpeed should be used.
   * @default false
   */
  useCustomSlidingRotationalSpeed: boolean;
  /**
   * sliding
   */
  sliding: boolean;
  /**
   * Connection point, defined locally in the chassis body frame.
   */
  chassisConnectionPointLocal: Vec3;
  /**
   * chassisConnectionPointWorld
   */
  chassisConnectionPointWorld: Vec3;
  /**
   * directionLocal
   */
  directionLocal: Vec3;
  /**
   * directionWorld
   */
  directionWorld: Vec3;
  /**
   * axleLocal
   */
  axleLocal: Vec3;
  /**
   * axleWorld
   */
  axleWorld: Vec3;
  /**
   * suspensionRestLength
   * @default 1
   */
  suspensionRestLength: f32;
  /**
   * suspensionMaxLength
   * @default 2
   */
  suspensionMaxLength: f32;
  /**
   * radius
   * @default 1
   */
  radius: f32;
  /**
   * suspensionStiffness
   * @default 100
   */
  suspensionStiffness: f32;
  /**
   * dampingCompression
   * @default 10
   */
  dampingCompression: f32;
  /**
   * dampingRelaxation
   * @default 10
   */
  dampingRelaxation: f32;
  /**
   * frictionSlip
   * @default 10.5
   */
  frictionSlip: f32;
  /** forwardAcceleration */
  forwardAcceleration: f32;
  /** sideAcceleration */
  sideAcceleration: f32;
  /**
   * steering
   * @default 0
   */
  steering: f32;
  /**
   * Rotation value, in radians.
   * @default 0
   */
  rotation: f32;
  /**
   * deltaRotation
   * @default 0
   */
  deltaRotation: f32;
  /**
   * rollInfluence
   * @default 0.01
   */
  rollInfluence: f32;
  /**
   * maxSuspensionForce
   */
  maxSuspensionForce: f32;
  /**
   * engineForce
   */
  engineForce: f32;
  /**
   * brake
   */
  brake: f32;
  /**
   * isFrontWheel
   * @default true
   */
  isFrontWheel: boolean;
  /**
   * clippedInvContactDotSuspension
   * @default 1
   */
  clippedInvContactDotSuspension: f32;
  /**
   * suspensionRelativeVelocity
   * @default 0
   */
  suspensionRelativeVelocity: f32;
  /**
   * suspensionForce
   * @default 0
   */
  suspensionForce: f32;
  /**
   * slipInfo
   */
  slipInfo: f32;
  /**
   * skidInfo
   * @default 0
   */
  skidInfo: f32;
  /**
   * suspensionLength
   * @default 0
   */
  suspensionLength: f32;
  /**
   * sideImpulse
   */
  sideImpulse: f32;
  /**
   * forwardImpulse
   */
  forwardImpulse: f32;
  /**
   * The result from raycasting.
   */
  raycastResult: RaycastResult;
  /**
   * Wheel world transform.
   */
  worldTransform: Transform;
  /**
   * isInContact
   */
  isInContact: boolean;

  constructor(options = new WheelInfoOptions()) {
    this.maxSuspensionTravel = options.maxSuspensionTravel;
    this.customSlidingRotationalSpeed = options.customSlidingRotationalSpeed;
    this.useCustomSlidingRotationalSpeed =
      options.useCustomSlidingRotationalSpeed;
    this.sliding = false;
    this.chassisConnectionPointLocal =
      options.chassisConnectionPointLocal.clone();
    this.chassisConnectionPointWorld =
      options.chassisConnectionPointWorld.clone();
    this.directionLocal = options.directionLocal.clone();
    this.directionWorld = options.directionWorld.clone();
    this.axleLocal = options.axleLocal.clone();
    this.axleWorld = options.axleWorld.clone();
    this.suspensionRestLength = options.suspensionRestLength;
    this.suspensionMaxLength = options.suspensionMaxLength;
    this.radius = options.radius;
    this.suspensionStiffness = options.suspensionStiffness;
    this.dampingCompression = options.dampingCompression;
    this.dampingRelaxation = options.dampingRelaxation;
    this.frictionSlip = options.frictionSlip;
    this.forwardAcceleration = options.forwardAcceleration;
    this.sideAcceleration = options.sideAcceleration;
    this.steering = 0;
    this.rotation = 0;
    this.deltaRotation = 0;
    this.rollInfluence = options.rollInfluence;
    this.maxSuspensionForce = options.maxSuspensionForce;
    this.engineForce = 0;
    this.brake = 0;
    this.isFrontWheel = options.isFrontWheel;
    this.clippedInvContactDotSuspension = 1;
    this.suspensionRelativeVelocity = 0;
    this.suspensionForce = 0;
    this.slipInfo = options.slipInfo;
    this.skidInfo = options.skidInfo;
    this.suspensionLength = 0;
    this.sideImpulse = 0;
    this.forwardImpulse = 0;
    this.raycastResult = new RaycastResult();
    this.worldTransform = new Transform();
    this.isInContact = false;
  }

  updateWheel(chassis: Body): void {
    const raycastResult = this.raycastResult;

    if (this.isInContact) {
      const project = raycastResult.hitNormalWorld.dot(
        raycastResult.directionWorld!
      );
      raycastResult.hitPointWorld.vsub(chassis.position, relpos);
      chassis.getVelocityAtWorldPoint(relpos, chassis_velocity_at_contactPoint);
      const projVel = raycastResult.hitNormalWorld.dot(
        chassis_velocity_at_contactPoint
      );
      if (project >= -0.1) {
        this.suspensionRelativeVelocity = 0.0;
        this.clippedInvContactDotSuspension = 1.0 / 0.1;
      } else {
        const inv = -1 / project;
        this.suspensionRelativeVelocity = projVel * inv;
        this.clippedInvContactDotSuspension = inv;
      }
    } else {
      // Not in contact : position wheel in a nice (rest length) position
      raycastResult.suspensionLength = this.suspensionRestLength;
      this.suspensionRelativeVelocity = 0.0;
      raycastResult.directionWorld!.scale(-1, raycastResult.hitNormalWorld);
      this.clippedInvContactDotSuspension = 1.0;
    }
  }
}

const chassis_velocity_at_contactPoint = new Vec3();
const relpos = new Vec3();
