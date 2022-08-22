import { SHAPE_NULL } from "../constants";
import { _Math } from "../math/Math";
import { Vec3 } from "../math/Vec3";
import { Mat33 } from "../math/Mat33";
import { AABB } from "../math/AABB";
import { MassInfo } from "./MassInfo";
import { ShapeConfig } from "./ShapeConfig";
import { Proxy } from "../collision/broadphase/Proxy";

let count = 0;
function ShapeIdCount() {
  return count++;
}

/**
 * A shape is used to detect collisions of rigid bodies.
 *
 * @author saharan
 * @author lo-th
 */
export abstract class Shape {
  type: i32;
  id: i32;
  prev: null;
  next: null;
  proxy: Proxy | null;
  parent: null;
  contactLink: null;
  numContacts: i32;
  position: Vec3;
  rotation: Mat33;
  relativePosition: Vec3;
  relativeRotation: Mat33;
  aabb: AABB;
  density: f32;
  friction: f32;
  restitution: f32;
  belongsTo: i32;
  collidesWith: i32;

  constructor(config: ShapeConfig) {
    this.type = SHAPE_NULL;

    // global identification of the shape should be unique to the shape.
    this.id = ShapeIdCount();

    // previous shape in parent rigid body. Used for fast interations.
    this.prev = null;

    // next shape in parent rigid body. Used for fast interations.
    this.next = null;

    // proxy of the shape used for broad-phase collision detection.
    this.proxy = null;

    // parent rigid body of the shape.
    this.parent = null;

    // linked list of the contacts with the shape.
    this.contactLink = null;

    // number of the contacts with the shape.
    this.numContacts = 0;

    // center of gravity of the shape in world coordinate system.
    this.position = new Vec3();

    // rotation matrix of the shape in world coordinate system.
    this.rotation = new Mat33();

    // position of the shape in parent's coordinate system.
    this.relativePosition = new Vec3().copy(config.relativePosition);

    // rotation matrix of the shape in parent's coordinate system.
    this.relativeRotation = new Mat33().copy(config.relativeRotation);

    // axis-aligned bounding box of the shape.
    this.aabb = new AABB();

    // density of the shape.
    this.density = config.density;

    // coefficient of friction of the shape.
    this.friction = config.friction;

    // coefficient of restitution of the shape.
    this.restitution = config.restitution;

    // bits of the collision groups to which the shape belongs.
    this.belongsTo = config.belongsTo;

    // bits of the collision groups with which the shape collides.
    this.collidesWith = config.collidesWith;
  }

  // Calculate the mass information of the shape.

  abstract calculateMassInfo(out: MassInfo): void;

  // Update the proxy of the shape.

  abstract updateProxy(): void;
}
