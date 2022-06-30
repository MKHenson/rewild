import { Vec3 } from "../maths/Vec3";
import { PhysicsMaterialOptions } from "../materials/PhysicsMaterial";
import { Body } from "../objects/Body";
import { Quaternion } from "../maths/Quaternion";

export enum ShapeType {
  SPHERE = 1,
  PLANE = 2,
  BOX = 4,
  COMPOUND = 8,
  CONVEXPOLYHEDRON = 16,
  HEIGHTFIELD = 32,
  PARTICLE = 64,
  CYLINDER = 128,
  TRIMESH = 256,
}

export class ShapeOptions {
  constructor(
    public collisionFilterGroup: i32 = 1,
    public collisionFilterMask: i32 = -1,
    public collisionResponse: boolean = true,
    public material: PhysicsMaterialOptions | null = null
  ) {}
}

export abstract class Shape {
  static idCounter: i32 = 0;
  id: i32;
  type: ShapeType;

  collisionFilterGroup: i32;
  collisionFilterMask: i32;
  material: PhysicsMaterialOptions | null;
  body: Body | null;

  // Whether to produce contact forces when in contact with other bodies. Note that contacts will be generated, but they will be disabled.
  collisionResponse: boolean;

  // The local bounding sphere radius of this shape.
  boundingSphereRadius: f32;

  constructor(type: ShapeType, options: ShapeOptions | null = null) {
    this.id = Shape.idCounter++;
    this.type = type;
    this.boundingSphereRadius = 0;
    this.collisionResponse = options?.collisionResponse || true;
    this.collisionFilterGroup = options?.collisionFilterGroup || 1;
    this.collisionFilterMask = options?.collisionFilterMask || -1;
    this.material = options?.material || null;
    this.body = null;
  }

  /**
   * Computes the bounding sphere radius. The result is stored in the property .boundingSphereRadius
   * @method updateBoundingSphereRadius
   */
  abstract updateBoundingSphereRadius(): void;

  abstract calculateWorldAABB(pos: Vec3, quat: Quaternion, min: Vec3, max: Vec3): void;

  /**
   * Get the volume of this shape
   * @method volume
   * @return {Number}
   */
  abstract volume(): void;

  /**
   * Calculates the inertia in the local frame for this shape.
   * @method calculateLocalInertia
   * @see http://en.wikipedia.org/wiki/List_of_moments_of_inertia
   */
  abstract calculateLocalInertia(mass: f32, target: Vec3): void;
}
