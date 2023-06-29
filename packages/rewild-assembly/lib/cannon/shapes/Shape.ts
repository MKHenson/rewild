import { Material } from "../material/Material";
import { Quaternion } from "../math/Quaternion";
import { Vec3 } from "../math/Vec3";
import { Body } from "../objects/Body";

export abstract class Shape {
  id: i32;
  type: i32;
  boundingSphereRadius: f32;
  collisionResponse: boolean;
  collisionFilterGroup: i32;
  collisionFilterMask: i32;
  material: Material | null;
  body: Body | null;

  /**
   * Base class for shapes
   * @class Shape
   * @constructor
   * @param {object} [options]
   * @param {number} [options.collisionFilterGroup=1]
   * @param {number} [options.collisionFilterMask=-1]
   * @param {number} [options.collisionResponse=true]
   * @param {number} [options.material=null]
   * @author schteppe
   */
  constructor(
    type: i32 = 0,
    collisionResponse: boolean = true,
    collisionFilterGroup: i32 = 1,
    collisionFilterMask: i32 = -1,
    material: Material | null = null
  ) {
    /**
     * Identifyer of the Shape.
     * @property {number} id
     */
    this.id = Shape.idCounter++;

    /**
     * The type of this shape. Must be set to an int > 0 by subclasses.
     * @property type
     * @type {Number}
     * @see Shape.types
     */
    this.type = type;

    /**
     * The local bounding sphere radius of this shape.
     * @property {Number} boundingSphereRadius
     */
    this.boundingSphereRadius = 0;

    /**
     * Whether to produce contact forces when in contact with other bodies. Note that contacts will be generated, but they will be disabled.
     * @property {boolean} collisionResponse
     */
    this.collisionResponse = collisionResponse;

    /**
     * @property {Number} collisionFilterGroup
     */
    this.collisionFilterGroup = collisionFilterGroup;

    /**
     * @property {Number} collisionFilterMask
     */
    this.collisionFilterMask = collisionFilterMask;

    /**
     * @property {Material} material
     */
    this.material = material;

    /**
     * @property {Body} body
     */
    this.body = null;
  }

  /**
   * Computes the bounding sphere radius. The result is stored in the property .boundingSphereRadius
   * @method updateBoundingSphereRadius
   */
  abstract updateBoundingSphereRadius(): void;

  /**
   * Get the volume of this shape
   * @method volume
   * @return {Number}
   */
  abstract volume(): void;

  abstract calculateWorldAABB(
    pos: Vec3,
    quat: Quaternion,
    min: Vec3,
    max: Vec3
  ): void;

  /**
   * Calculates the inertia in the local frame for this shape.
   * @method calculateLocalInertia
   * @param {Number} mass
   * @param {Vec3} target
   * @see http://en.wikipedia.org/wiki/List_of_moments_of_inertia
   */
  abstract calculateLocalInertia(mass: f32, target: Vec3): void;

  static idCounter: i32 = 0;

  /**
   * The available shape types.
   * @static
   * @property types
   * @type {Object}
   */
  static SPHERE: i16 = 1;
  static PLANE: i16 = 2;
  static BOX: i16 = 4;
  static COMPOUND: i16 = 8;
  static CONVEXPOLYHEDRON: i16 = 16;
  static HEIGHTFIELD: i16 = 32;
  static PARTICLE: i16 = 64;
  static CYLINDER: i16 = 128;
  static TRIMESH: i16 = 256;
}
