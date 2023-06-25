import { ContactLink } from "./ContactLink";
import { ImpulseDataBuffer } from "./ImpulseDataBuffer";
import { ContactManifold } from "./ContactManifold";
import { ContactConstraint } from "./ContactConstraint";
import { _Math } from "../../math/Math";
import { ManifoldPoint } from "./ManifoldPoint";
import { Shape } from "../../shape/Shape";
import { CollisionDetector } from "../../collision/narrowphase/CollisionDetector";
import { RigidBody } from "../../core/RigidBody";
/**
 * A contact is a pair of shapes whose axis-aligned bounding boxes are overlapping.
 * @author saharan
 */

export class Contact {
  // The first shape.
  shape1: Shape | null;
  // The second shape.
  shape2: Shape | null;
  // The first rigid body.
  body1: RigidBody | null;
  // The second rigid body.
  body2: RigidBody | null;
  // The previous contact in the world.
  prev: Contact | null;
  // The next contact in the world.
  next: Contact | null;
  // Internal
  persisting: boolean;
  // Whether both the rigid bodies are sleeping or not.
  sleeping: boolean;
  // The collision detector between two shapes.
  detector: CollisionDetector | null;
  // The contact constraint of the contact.
  constraint: ContactConstraint | null;
  // Whether the shapes are touching or not.
  touching: boolean;
  // shapes is very close and touching
  close: boolean;

  dist: f64;

  b1Link!: ContactLink;
  b2Link!: ContactLink;
  s1Link!: ContactLink;
  s2Link!: ContactLink;

  // The contact manifold of the contact.
  manifold: ContactManifold;

  buffer: ImpulseDataBuffer[];
  points: ManifoldPoint[];

  constructor() {
    this.shape1 = null;
    this.shape2 = null;
    this.body1 = null;
    this.body2 = null;
    this.prev = null;
    this.next = null;
    this.persisting = false;
    this.sleeping = false;
    this.detector = null;
    this.constraint = null;
    this.touching = false;
    this.close = false;

    this.dist = Infinity;

    this.manifold = new ContactManifold();
    this.buffer = [new ImpulseDataBuffer(), new ImpulseDataBuffer(), new ImpulseDataBuffer(), new ImpulseDataBuffer()];

    this.points = this.manifold.points;
    this.constraint = new ContactConstraint(this.manifold);

    this.b1Link = new ContactLink(this);
    this.b2Link = new ContactLink(this);
    this.s1Link = new ContactLink(this);
    this.s2Link = new ContactLink(this);
  }

  mixRestitution(restitution1: f32, restitution2: f32): f32 {
    return Mathf.sqrt(restitution1 * restitution2);
  }
  mixFriction(friction1: f32, friction2: f32): f32 {
    return Mathf.sqrt(friction1 * friction2);
  }

  /**
   * Update the contact manifold.
   */
  updateManifold(): void {
    this.constraint!.restitution = this.mixRestitution(this.shape1!.restitution, this.shape2!.restitution);
    this.constraint!.friction = this.mixFriction(this.shape1!.friction, this.shape2!.friction);
    let numBuffers = this.manifold.numPoints;
    let i: i32 = numBuffers;
    while (i--) {
      //for(const i=0;i<numBuffers;i++){
      const b = this.buffer[i];
      const p = this.points[i];
      b.lp1X = p.localPoint1.x;
      b.lp1Y = p.localPoint1.y;
      b.lp1Z = p.localPoint1.z;
      b.lp2X = p.localPoint2.x;
      b.lp2Y = p.localPoint2.y;
      b.lp2Z = p.localPoint2.z;
      b.impulse = p.normalImpulse;
    }
    this.manifold.numPoints = 0;
    this.detector!.detectCollision(this.shape1!, this.shape2!, this.manifold);
    const num = this.manifold.numPoints;
    if (num == 0) {
      this.touching = false;
      this.close = false;
      this.dist = Infinity;
      return;
    }

    if (this.touching || this.dist < 0.001) this.close = true;
    this.touching = true;
    i = num;
    let p: ManifoldPoint;

    while (i--) {
      //for(i=0; i<num; i++){
      p = this.points[i];
      const lp1x = p.localPoint1.x;
      const lp1y = p.localPoint1.y;
      const lp1z = p.localPoint1.z;
      const lp2x = p.localPoint2.x;
      const lp2y = p.localPoint2.y;
      const lp2z = p.localPoint2.z;
      let index = -1;
      let minDistance: f32 = 0.0004;
      let j = numBuffers;
      let b: ImpulseDataBuffer;

      while (j--) {
        //for(const j=0;j<numBuffers;j++){
        b = this.buffer[j];
        let dx = b.lp1X - lp1x;
        let dy = b.lp1Y - lp1y;
        let dz = b.lp1Z - lp1z;
        const distance1 = dx * dx + dy * dy + dz * dz;
        dx = b.lp2X - lp2x;
        dy = b.lp2Y - lp2y;
        dz = b.lp2Z - lp2z;
        const distance2 = dx * dx + dy * dy + dz * dz;
        if (distance1 < distance2) {
          if (distance1 < minDistance) {
            minDistance = distance1;
            index = j;
          }
        } else {
          if (distance2 < minDistance) {
            minDistance = distance2;
            index = j;
          }
        }

        if (minDistance < this.dist) this.dist = minDistance;
      }
      if (index != -1) {
        const tmp = this.buffer[index];
        this.buffer[index] = this.buffer[--numBuffers];
        this.buffer[numBuffers] = tmp;
        p.normalImpulse = tmp.impulse;
        p.warmStarted = true;
      } else {
        p.normalImpulse = 0;
        p.warmStarted = false;
      }
    }
  }
  /**
   * Attach the contact to the shapes.
   * @param   shape1
   * @param   shape2
   */
  attach(shape1: Shape, shape2: Shape): void {
    this.shape1 = shape1;
    this.shape2 = shape2;
    this.body1 = shape1.parent;
    this.body2 = shape2.parent;

    this.manifold.body1 = this.body1;
    this.manifold.body2 = this.body2;
    this.constraint!.body1 = this.body1;
    this.constraint!.body2 = this.body2;
    this.constraint!.attach();

    this.s1Link.shape = shape2;
    this.s1Link.body = this.body2;
    this.s2Link.shape = shape1;
    this.s2Link.body = this.body1;

    if (shape1.contactLink != null) {
      this.s1Link.next = shape1.contactLink;
      shape1.contactLink!.prev = this.s1Link;
    } else {
      this.s1Link.next = null;
    }
    shape1.contactLink = this.s1Link;
    shape1.numContacts++;

    if (shape2.contactLink != null) {
      this.s2Link.next = shape2.contactLink;
      shape2.contactLink!.prev = this.s2Link;
    } else {
      this.s2Link.next = null;
    }
    shape2.contactLink = this.s2Link;
    shape2.numContacts++;

    this.b1Link.shape = shape2;
    this.b1Link.body = this.body2;
    this.b2Link.shape = shape1;
    this.b2Link.body = this.body1;

    if (this.body1!.contactLink != null) {
      this.b1Link.next = this.body1!.contactLink;
      this.body1!.contactLink!.prev = this.b1Link;
    } else {
      this.b1Link.next = null;
    }
    this.body1!.contactLink = this.b1Link;
    this.body1!.numContacts++;

    if (this.body2!.contactLink != null) {
      this.b2Link.next = this.body2!.contactLink;
      this.body2!.contactLink!.prev = this.b2Link;
    } else {
      this.b2Link.next = null;
    }

    this.body2!.contactLink = this.b2Link;
    this.body2!.numContacts++;

    this.prev = null;
    this.next = null;

    this.persisting = true;
    this.sleeping = this.body1!.sleeping && this.body2!.sleeping;
    this.manifold.numPoints = 0;
  }
  /**
   * Detach the contact from the shapes.
   */
  detach(): void {
    let prev = this.s1Link.prev;
    let next = this.s1Link.next;
    if (prev != null) prev.next = next;
    if (next != null) next.prev = prev;
    if (this.shape1!.contactLink == this.s1Link) this.shape1!.contactLink = next;
    this.s1Link.prev = null;
    this.s1Link.next = null;
    this.s1Link.shape = null;
    this.s1Link.body = null;
    this.shape1!.numContacts--;

    prev = this.s2Link.prev;
    next = this.s2Link.next;
    if (prev != null) prev.next = next;
    if (next != null) next.prev = prev;
    if (this.shape2!.contactLink == this.s2Link) this.shape2!.contactLink = next;
    this.s2Link.prev = null;
    this.s2Link.next = null;
    this.s2Link.shape = null;
    this.s2Link.body = null;
    this.shape2!.numContacts--;

    prev = this.b1Link.prev;
    next = this.b1Link.next;
    if (prev != null) prev.next = next;
    if (next != null) next.prev = prev;
    if (this.body1!.contactLink == this.b1Link) this.body1!.contactLink = next;
    this.b1Link.prev = null;
    this.b1Link.next = null;
    this.b1Link.shape = null;
    this.b1Link.body = null;
    this.body1!.numContacts--;

    prev = this.b2Link.prev;
    next = this.b2Link.next;
    if (prev != null) prev.next = next;
    if (next != null) next.prev = prev;
    if (this.body2!.contactLink == this.b2Link) this.body2!.contactLink = next;
    this.b2Link.prev = null;
    this.b2Link.next = null;
    this.b2Link.shape = null;
    this.b2Link.body = null;
    this.body2!.numContacts--;

    this.manifold.body1 = null;
    this.manifold.body2 = null;
    this.constraint!.body1 = null;
    this.constraint!.body2 = null;
    this.constraint!.detach();

    this.shape1 = null;
    this.shape2 = null;
    this.body1 = null;
    this.body2 = null;
  }
}