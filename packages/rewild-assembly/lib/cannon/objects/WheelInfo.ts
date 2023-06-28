import { RaycastResult } from "../collision/RaycastResult";
import { Transform } from "../math/Transform";
import { Vec3 } from "../math/Vec3";
import { Body } from "./Body";

const chassis_velocity_at_contactPoint = new Vec3();
const relpos = new Vec3();

export class WheelInfoOptions {
  constructor(
    public chassisConnectionPointLocal: Vec3 = new Vec3(),
    public chassisConnectionPointWorld: Vec3 = new Vec3(),
    public directionLocal: Vec3 = new Vec3(),
    public directionWorld: Vec3 = new Vec3(),
    public axleLocal: Vec3 = new Vec3(),
    public axleWorld: Vec3 = new Vec3(),
    public suspensionRestLength: f32 = 1,
    public suspensionMaxLength: f32 = 2,
    public radius: f32 = 1,
    public suspensionStiffness: f32 = 100,
    public dampingCompression: f32 = 10,
    public dampingRelaxation: f32 = 10,
    public frictionSlip: f32 = 10000,
    public steering: f32 = 0,
    public rotation: f32 = 0,
    public deltaRotation: f32 = 0,
    public rollInfluence: f32 = 0.01,
    public maxSuspensionForce: f32 = f32.MAX_VALUE,
    public isFrontWheel: boolean = true,
    public clippedInvContactDotSuspension: f32 = 1,
    public suspensionRelativeVelocity: f32 = 0,
    public suspensionForce: f32 = 0,
    public skidInfo: f32 = 0,
    public suspensionLength: f32 = 0,
    public maxSuspensionTravel: f32 = 1,
    public useCustomSlidingRotationalSpeed: boolean = false,
    public customSlidingRotationalSpeed: f32 = -0.1
  ) {}
}

export class WheelInfo {
  chassisConnectionPointLocal: Vec3;
  chassisConnectionPointWorld: Vec3;
  directionLocal: Vec3;
  directionWorld: Vec3;
  axleLocal: Vec3;
  axleWorld: Vec3;
  suspensionRestLength: f32;
  suspensionMaxLength: f32;
  radius: f32;
  suspensionStiffness: f32;
  dampingCompression: f32;
  dampingRelaxation: f32;
  frictionSlip: f32;
  steering: f32;
  rotation: f32;
  deltaRotation: f32;
  rollInfluence: f32;
  maxSuspensionForce: f32;
  isFrontWheel: boolean;
  clippedInvContactDotSuspension: f32;
  suspensionRelativeVelocity: f32;
  suspensionForce: f32;
  skidInfo: f32;
  suspensionLength: f32;
  maxSuspensionTravel: f32;
  useCustomSlidingRotationalSpeed: boolean;
  customSlidingRotationalSpeed: f32;
  sliding: boolean;
  engineForce: f32;
  rotationSpeed: f32;
  brake: f32;
  isInContact: boolean;
  sideImpulse: f32;
  forwardImpulse: f32;
  raycastResult: RaycastResult;
  worldTransform: Transform;

  /**
   * @class WheelInfo
   * @constructor
   * @param {Object} [options]
   *
   * @param {Vec3} [options.chassisConnectionPointLocal]
   * @param {Vec3} [options.chassisConnectionPointWorld]
   * @param {Vec3} [options.directionLocal]
   * @param {Vec3} [options.directionWorld]
   * @param {Vec3} [options.axleLocal]
   * @param {Vec3} [options.axleWorld]
   * @param {number} [options.suspensionRestLength=1]
   * @param {number} [options.suspensionMaxLength=2]
   * @param {number} [options.radius=1]
   * @param {number} [options.suspensionStiffness=100]
   * @param {number} [options.dampingCompression=10]
   * @param {number} [options.dampingRelaxation=10]
   * @param {number} [options.frictionSlip=10000]
   * @param {number} [options.steering=0]
   * @param {number} [options.rotation=0]
   * @param {number} [options.deltaRotation=0]
   * @param {number} [options.rollInfluence=0.01]
   * @param {number} [options.maxSuspensionForce]
   * @param {boolean} [options.isFrontWheel=true]
   * @param {number} [options.clippedInvContactDotSuspension=1]
   * @param {number} [options.suspensionRelativeVelocity=0]
   * @param {number} [options.suspensionForce=0]
   * @param {number} [options.skidInfo=0]
   * @param {number} [options.suspensionLength=0]
   * @param {number} [options.maxSuspensionTravel=1]
   * @param {boolean} [options.useCustomSlidingRotationalSpeed=false]
   * @param {number} [options.customSlidingRotationalSpeed=-0.1]
   */
  constructor(options = new WheelInfoOptions()) {
    /**
     * Max travel distance of the suspension, in meters.
     * @property {number} maxSuspensionTravel
     */
    this.maxSuspensionTravel = options.maxSuspensionTravel;

    /**
     * Speed to apply to the wheel rotation when the wheel is sliding.
     * @property {number} customSlidingRotationalSpeed
     */
    this.customSlidingRotationalSpeed = options.customSlidingRotationalSpeed;

    /**
     * If the customSlidingRotationalSpeed should be used.
     * @property {Boolean} useCustomSlidingRotationalSpeed
     */
    this.useCustomSlidingRotationalSpeed = options.useCustomSlidingRotationalSpeed;

    /**
     * @property {Boolean} sliding
     */
    this.sliding = false;

    /**
     * Connection point, defined locally in the chassis body frame.
     * @property {Vec3} chassisConnectionPointLocal
     */
    this.chassisConnectionPointLocal = options.chassisConnectionPointLocal.clone();

    /**
     * @property {Vec3} chassisConnectionPointWorld
     */
    this.chassisConnectionPointWorld = options.chassisConnectionPointWorld.clone();

    /**
     * @property {Vec3} directionLocal
     */
    this.directionLocal = options.directionLocal.clone();

    /**
     * @property {Vec3} directionWorld
     */
    this.directionWorld = options.directionWorld.clone();

    /**
     * @property {Vec3} axleLocal
     */
    this.axleLocal = options.axleLocal.clone();

    /**
     * @property {Vec3} axleWorld
     */
    this.axleWorld = options.axleWorld.clone();

    /**
     * @property {number} suspensionRestLength
     */
    this.suspensionRestLength = options.suspensionRestLength;

    /**
     * @property {number} suspensionMaxLength
     */
    this.suspensionMaxLength = options.suspensionMaxLength;

    /**
     * @property {number} radius
     */
    this.radius = options.radius;

    /**
     * @property {number} suspensionStiffness
     */
    this.suspensionStiffness = options.suspensionStiffness;

    /**
     * @property {number} dampingCompression
     */
    this.dampingCompression = options.dampingCompression;

    /**
     * @property {number} dampingRelaxation
     */
    this.dampingRelaxation = options.dampingRelaxation;

    /**
     * @property {number} frictionSlip
     */
    this.frictionSlip = options.frictionSlip;

    /**
     * @property {number} steering
     */
    this.steering = 0;

    /**
     * Rotation value, in radians.
     * @property {number} rotation
     */
    this.rotation = 0;

    /**
     * @property {number} deltaRotation
     */
    this.deltaRotation = 0;

    /**
     * @property {number} rollInfluence
     */
    this.rollInfluence = options.rollInfluence;

    /**
     * @property {number} maxSuspensionForce
     */
    this.maxSuspensionForce = options.maxSuspensionForce;

    /**
     * @property {number} engineForce
     */
    this.engineForce = 0;

    /**
     * @property {number} brake
     */
    this.brake = 0;

    /**
     * @property {number} isFrontWheel
     */
    this.isFrontWheel = options.isFrontWheel;

    /**
     * @property {number} clippedInvContactDotSuspension
     */
    this.clippedInvContactDotSuspension = 1;

    /**
     * @property {number} suspensionRelativeVelocity
     */
    this.suspensionRelativeVelocity = 0;

    /**
     * @property {number} suspensionForce
     */
    this.suspensionForce = 0;

    /**
     * @property {number} skidInfo
     */
    this.skidInfo = 0;

    /**
     * @property {number} suspensionLength
     */
    this.suspensionLength = 0;

    /**
     * @property {number} sideImpulse
     */
    this.sideImpulse = 0;

    /**
     * @property {number} forwardImpulse
     */
    this.forwardImpulse = 0;

    /**
     * The result from raycasting
     * @property {RaycastResult} raycastResult
     */
    this.raycastResult = new RaycastResult();

    /**
     * Wheel world transform
     * @property {Transform} worldTransform
     */
    this.worldTransform = new Transform();

    /**
     * @property {boolean} isInContact
     */
    this.isInContact = false;
  }

  updateWheel(chassis: Body): void {
    const raycastResult = this.raycastResult;

    if (this.isInContact) {
      const project = raycastResult.hitNormalWorld.dot(raycastResult.directionWorld);
      raycastResult.hitPointWorld.vsub(chassis.position, relpos);
      chassis.getVelocityAtWorldPoint(relpos, chassis_velocity_at_contactPoint);
      const projVel = raycastResult.hitNormalWorld.dot(chassis_velocity_at_contactPoint);
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
      raycastResult.directionWorld.scale(-1, raycastResult.hitNormalWorld);
      this.clippedInvContactDotSuspension = 1.0;
    }
  }
}
