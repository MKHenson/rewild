import { Vec3 } from '../math/Vec3';
import { Quaternion } from '../math/Quaternion';
import { Body } from '../objects/Body';
import { Material } from '../material/Material';

/**
 * Base class for shapes
 */
export abstract class Shape {
  /**
   * Identifier of the Shape.
   */
  id: i32;

  /**
   * The type of this shape. Must be set to an int > 0 by subclasses.
   */
  type: i32;

  /**
   * The local bounding sphere radius of this shape.
   */
  boundingSphereRadius: f32;

  /**
   * Whether to produce contact forces when in contact with other bodies. Note that contacts will be generated, but they will be disabled.
   * @default true
   */
  collisionResponse: boolean;

  /**
   * @default 1
   */
  collisionFilterGroup: i32;

  /**
   * @default -1
   */
  collisionFilterMask: i32;

  /**
   * Optional material of the shape that regulates contact properties.
   */
  material: Material | null;

  /**
   * The body to which the shape is added to.
   */
  body: Body | null;

  static idCounter: i32 = 0;

  constructor(
    /**
     * The type of this shape.
     */
    type: i32 = 0,
    /**
     * Whether to produce contact forces when in contact with other bodies.
     * @default true
     */
    collisionResponse: boolean = true,
    /**
     * @default 1
     */
    collisionFilterGroup: i32 = 1,
    /**
     * @default -1
     */
    collisionFilterMask: i32 = -1,
    /**
     * Optional material of the shape that regulates contact properties.
     * @default null
     * @todo check this, the material is passed to the body, right?
     */
    material: Material | null = null
  ) {
    this.id = Shape.idCounter++;
    this.type = type;
    this.boundingSphereRadius = 0;
    this.collisionResponse = collisionResponse;
    this.collisionFilterGroup = collisionFilterGroup;
    this.collisionFilterMask = collisionFilterMask;
    this.material = material;
    this.body = null;
  }

  /**
   * Computes the bounding sphere radius.
   * The result is stored in the property `.boundingSphereRadius`
   */
  abstract updateBoundingSphereRadius(): void;

  /**
   * Get the volume of this shape
   */
  abstract volume(): f32;

  /**
   * Calculates the inertia in the local frame for this shape.
   * @see http://en.wikipedia.org/wiki/List_of_moments_of_inertia
   */
  abstract calculateLocalInertia(mass: f32, target: Vec3): void;

  /**
   * @todo use abstract for these kind of methods
   */
  abstract calculateWorldAABB(
    pos: Vec3,
    quat: Quaternion,
    min: Vec3,
    max: Vec3
  ): void;

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
