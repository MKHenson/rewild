import { Vec3 } from "../../math/Vec3";

/**
 * The class holds details of the contact point.
 * @author saharan
 */
export class ManifoldPoint {
  // Whether this manifold point is persisting or not.
  warmStarted: boolean;
  //  The position of this manifold point.
  position: Vec3;
  // The position in the first shape's coordinate.
  localPoint1: Vec3;
  //  The position in the second shape's coordinate.
  localPoint2: Vec3;
  // The normal vector of this manifold point.
  normal: Vec3;
  // The tangent vector of this manifold point.
  tangent: Vec3;
  // The binormal vector of this manifold point.
  binormal: Vec3;
  // The impulse in normal direction.
  normalImpulse: f32;
  // The impulse in tangent direction.
  tangentImpulse: f32;
  // The impulse in binormal direction.
  binormalImpulse: f32;
  // The denominator in normal direction.
  normalDenominator: f32;
  // The denominator in tangent direction.
  tangentDenominator: f32;
  // The denominator in binormal direction.
  binormalDenominator: f32;
  // The depth of penetration.
  penetration: f32;

  constructor() {
    this.warmStarted = false;
    this.position = new Vec3();
    this.localPoint1 = new Vec3();
    this.localPoint2 = new Vec3();
    this.normal = new Vec3();
    this.tangent = new Vec3();
    this.binormal = new Vec3();
    this.normalImpulse = 0;
    this.tangentImpulse = 0;
    this.binormalImpulse = 0;
    this.normalDenominator = 0;
    this.tangentDenominator = 0;
    this.binormalDenominator = 0;
    this.penetration = 0;
  }
}
