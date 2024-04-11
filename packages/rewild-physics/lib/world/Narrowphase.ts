import { Shape } from '../shapes/Shape';
import { Vec3 } from '../math/Vec3';
import { Transform } from '../math/Transform';
import { Quaternion } from '../math/Quaternion';
import { Body } from '../objects/Body';
import { AABB } from '../collision/AABB';
import { Ray } from '../collision/Ray';
import { Vec3Pool } from '../utils/Vec3Pool';
import { ContactEquation } from '../equations/ContactEquation';
import { FrictionEquation } from '../equations/FrictionEquation';
import { Box } from '../shapes/Box';
import { Sphere } from '../shapes/Sphere';
import {
  ConvexPolyhedron,
  ConvexPolyhedronContactPoint,
} from '../shapes/ConvexPolyhedron';
import { Particle } from '../shapes/Particle';
import { Plane } from '../shapes/Plane';
import { Trimesh } from '../shapes/Trimesh';
import { Heightfield } from '../shapes/Heightfield';
import { Cylinder } from '../shapes/Cylinder';
import { ContactMaterial } from '../material/ContactMaterial';
import { World } from '../world/World';

/**
 * Helper class for the World. Generates ContactEquations.
 * @todo Sphere-ConvexPolyhedron contacts
 * @todo Contact reduction
 * @todo should move methods to prototype
 */
export class Narrowphase {
  /**
   * Internal storage of pooled contact points.
   */
  contactPointPool: ContactEquation[];
  frictionEquationPool: FrictionEquation[];
  result: ContactEquation[];
  frictionResult: FrictionEquation[];
  /**
   * Pooled vectors.
   */
  v3pool: Vec3Pool;
  world: World;
  currentContactMaterial: ContactMaterial | null;
  enableFrictionReduction: boolean;

  constructor(world: World) {
    this.contactPointPool = [];
    this.frictionEquationPool = [];
    this.result = [];
    this.frictionResult = [];
    this.v3pool = new Vec3Pool();
    this.world = world;
    this.currentContactMaterial = world.defaultContactMaterial;
    this.enableFrictionReduction = false;
  }

  /**
   * Make a contact object, by using the internal pool or creating a new one.
   */
  createContactEquation(
    bi: Body,
    bj: Body,
    si: Shape,
    sj: Shape,
    overrideShapeA: Shape | null,
    overrideShapeB: Shape | null
  ): ContactEquation {
    let c: ContactEquation;
    if (this.contactPointPool.length) {
      c = this.contactPointPool.pop() as ContactEquation;
      c.bi = bi;
      c.bj = bj;
    } else {
      c = new ContactEquation(bi, bj);
    }

    c.enabled =
      bi.collisionResponse &&
      bj.collisionResponse &&
      si.collisionResponse &&
      sj.collisionResponse;

    const cm = this.currentContactMaterial!;

    c.restitution = cm.restitution;

    c.setSpookParams(
      cm.contactEquationStiffness,
      cm.contactEquationRelaxation,
      this.world.dt
    );

    const matA = si.material || bi.material;
    const matB = sj.material || bj.material;
    if (matA && matB && matA.restitution >= 0 && matB.restitution >= 0) {
      c.restitution = matA.restitution * matB.restitution;
    }

    c.si = overrideShapeA || si;
    c.sj = overrideShapeB || sj;

    return c;
  }

  createFrictionEquationsFromContact(
    contactEquation: ContactEquation,
    outArray: FrictionEquation[]
  ): boolean {
    const bodyA = contactEquation.bi;
    const bodyB = contactEquation.bj;
    const shapeA = contactEquation.si;
    const shapeB = contactEquation.sj;

    const world = this.world;
    const cm = this.currentContactMaterial!;

    // If friction or restitution were specified in the material, use them
    let friction = cm.friction;
    const matA = shapeA.material || bodyA.material;
    const matB = shapeB.material || bodyB.material;
    if (matA && matB && matA.friction >= 0 && matB.friction >= 0) {
      friction = matA.friction * matB.friction;
    }

    if (friction > 0) {
      // Create 2 tangent equations
      // Users may provide a force different from global gravity to use when computing contact friction.
      const mug = friction * (world.frictionGravity || world.gravity).length();
      let reducedMass = bodyA.invMass + bodyB.invMass;
      if (reducedMass > 0) {
        reducedMass = 1 / reducedMass;
      }
      const pool = this.frictionEquationPool;
      const c1 = pool.length
        ? (pool.pop() as FrictionEquation)
        : new FrictionEquation(bodyA, bodyB, mug * reducedMass);
      const c2 = pool.length
        ? (pool.pop() as FrictionEquation)
        : new FrictionEquation(bodyA, bodyB, mug * reducedMass);

      c1.bi = c2.bi = bodyA;
      c1.bj = c2.bj = bodyB;
      c1.minForce = c2.minForce = -mug * reducedMass;
      c1.maxForce = c2.maxForce = mug * reducedMass;

      // Copy over the relative vectors
      c1.ri.copy(contactEquation.ri);
      c1.rj.copy(contactEquation.rj);
      c2.ri.copy(contactEquation.ri);
      c2.rj.copy(contactEquation.rj);

      // Construct tangents
      contactEquation.ni.tangents(c1.t, c2.t);

      // Set spook params
      c1.setSpookParams(
        cm.frictionEquationStiffness,
        cm.frictionEquationRelaxation,
        world.dt
      );
      c2.setSpookParams(
        cm.frictionEquationStiffness,
        cm.frictionEquationRelaxation,
        world.dt
      );

      c1.enabled = c2.enabled = contactEquation.enabled;

      outArray.push(c1);
      outArray.push(c2);

      return true;
    }

    return false;
  }

  /**
   * Take the average N latest contact point on the plane.
   */
  createFrictionFromAverage(numContacts: i32): void {
    // The last contactEquation
    let c = this.result[this.result.length - 1];

    // Create the result: two "average" friction equations
    if (
      !this.createFrictionEquationsFromContact(c, this.frictionResult) ||
      numContacts == 1
    ) {
      return;
    }

    const f1 = this.frictionResult[this.frictionResult.length - 2];
    const f2 = this.frictionResult[this.frictionResult.length - 1];

    averageNormal.setZero();
    averageContactPointA.setZero();
    averageContactPointB.setZero();

    const bodyA = c.bi;
    // const bodyB = c.bj
    for (let i: i32 = 0; i != numContacts; i++) {
      c = this.result[this.result.length - 1 - i];
      if (c.bi != bodyA) {
        averageNormal.vadd(c.ni, averageNormal);
        averageContactPointA.vadd(c.ri, averageContactPointA);
        averageContactPointB.vadd(c.rj, averageContactPointB);
      } else {
        averageNormal.vsub(c.ni, averageNormal);
        averageContactPointA.vadd(c.rj, averageContactPointA);
        averageContactPointB.vadd(c.ri, averageContactPointB);
      }
    }

    const invNumContacts: f32 = 1 / f32(numContacts);
    averageContactPointA.scale(invNumContacts, f1.ri);
    averageContactPointB.scale(invNumContacts, f1.rj);
    f2.ri.copy(f1.ri); // Should be the same
    f2.rj.copy(f1.rj);
    averageNormal.normalize();
    averageNormal.tangents(f1.t, f2.t);
    // return eq;
  }

  getResolver(
    type: i32,
    si: Shape,
    sj: Shape,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    if (type == Shape.SPHERE)
      return this.sphereSphere(
        si as Sphere,
        sj as Sphere,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.SPHERE | Shape.HEIGHTFIELD))
      return this.sphereHeightfield(
        si as Sphere,
        sj as Heightfield,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.CONVEXPOLYHEDRON | Shape.HEIGHTFIELD))
      return this.convexHeightfield(
        si as ConvexPolyhedron,
        sj as Heightfield,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.PARTICLE | Shape.CONVEXPOLYHEDRON))
      return this.convexParticle(
        si as ConvexPolyhedron,
        sj as Particle,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.PLANE | Shape.PARTICLE))
      return this.planeParticle(
        si as Plane,
        sj as Particle,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.PLANE | Shape.TRIMESH))
      return this.planeTrimesh(
        si as Plane,
        sj as Trimesh,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.BOX | Shape.HEIGHTFIELD))
      return this.boxHeightfield(
        si as Box,
        sj as Heightfield,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.BOX | Shape.BOX))
      return this.boxBox(
        si as Box,
        sj as Box,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.BOX | Shape.CONVEXPOLYHEDRON))
      return this.boxConvex(
        si as Box,
        sj as ConvexPolyhedron,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.BOX | Shape.PARTICLE))
      return this.boxParticle(
        si as Box,
        sj as Particle,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.SPHERE | Shape.TRIMESH))
      return this.sphereTrimesh(
        si as Sphere,
        sj as Trimesh,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.SPHERE | Shape.PLANE))
      return this.spherePlane(
        si as Sphere,
        sj as Plane,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.PARTICLE | Shape.SPHERE))
      return this.sphereParticle(
        si as Sphere,
        sj as Particle,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.SPHERE | Shape.BOX))
      return this.sphereBox(
        si as Sphere,
        sj as Box,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.SPHERE | Shape.CONVEXPOLYHEDRON))
      return this.sphereConvex(
        si as Sphere,
        sj as ConvexPolyhedron,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.PLANE | Shape.BOX))
      return this.planeBox(
        si as Plane,
        sj as Box,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == Shape.CONVEXPOLYHEDRON)
      return this.convexConvex(
        si as ConvexPolyhedron,
        sj as ConvexPolyhedron,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.PLANE | Shape.CONVEXPOLYHEDRON))
      return this.planeConvex(
        si as Plane,
        sj as ConvexPolyhedron,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.HEIGHTFIELD | Shape.CYLINDER))
      return this.heightfieldCylinder(
        si as Heightfield,
        sj as Cylinder,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.PARTICLE | Shape.CYLINDER))
      return this.particleCylinder(
        si as Particle,
        sj as Cylinder,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.PLANE | Shape.CYLINDER))
      return this.planeConvex(
        si as Plane,
        sj as ConvexPolyhedron,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.CYLINDER | Shape.CYLINDER))
      return this.convexConvex(
        si as ConvexPolyhedron,
        sj as ConvexPolyhedron,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.SPHERE | Shape.CYLINDER))
      return this.sphereConvex(
        si as Sphere,
        sj as ConvexPolyhedron,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.BOX | Shape.CYLINDER))
      return this.boxConvex(
        si as Box,
        sj as ConvexPolyhedron,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    else if (type == (Shape.CONVEXPOLYHEDRON | Shape.CYLINDER))
      return this.convexConvex(
        si as ConvexPolyhedron,
        sj as ConvexPolyhedron,
        xi,
        xj,
        qi,
        qj,
        bi,
        bj,
        rsi,
        rsj,
        justTest
      );
    return false;
  }

  /**
   * Generate all contacts between a list of body pairs
   * @param p1 Array of body indices
   * @param p2 Array of body indices
   * @param result Array to store generated contacts
   * @param oldcontacts Optional. Array of reusable contact objects
   */
  getContacts(
    p1: Body[],
    p2: Body[],
    world: World,
    result: ContactEquation[],
    oldcontacts: ContactEquation[],
    frictionResult: FrictionEquation[],
    frictionPool: FrictionEquation[]
  ): void {
    // Save old contact objects
    this.contactPointPool = oldcontacts;
    this.frictionEquationPool = frictionPool;
    this.result = result;
    this.frictionResult = frictionResult;

    const qi = tmpQuat1;
    const qj = tmpQuat2;
    const xi = tmpVec1;
    const xj = tmpVec2;

    for (let k: i32 = 0, N = p1.length; k != N; k++) {
      // Get current collision bodies
      const bi = p1[k];

      const bj = p2[k];

      // Get contact material
      let bodyContactMaterial: ContactMaterial | null = null;
      if (bi.material && bj.material) {
        bodyContactMaterial =
          world.getContactMaterial(bi.material!, bj.material!) || null;
      }

      const justTest =
        (bi.type & Body.KINEMATIC && bj.type & Body.STATIC) ||
        (bi.type & Body.STATIC && bj.type & Body.KINEMATIC) ||
        (bi.type & Body.KINEMATIC && bj.type & Body.KINEMATIC);

      for (let i: i32 = 0; i < bi.shapes.length; i++) {
        bi.quaternion.mult(bi.shapeOrientations[i], qi);
        bi.quaternion.vmult(bi.shapeOffsets[i], xi);
        xi.vadd(bi.position, xi);
        const si = bi.shapes[i];

        for (let j: i32 = 0; j < bj.shapes.length; j++) {
          // Compute world transform of shapes
          bj.quaternion.mult(bj.shapeOrientations[j], qj);
          bj.quaternion.vmult(bj.shapeOffsets[j], xj);
          xj.vadd(bj.position, xj);
          const sj = bj.shapes[j];

          if (
            !(
              si.collisionFilterMask & sj.collisionFilterGroup &&
              sj.collisionFilterMask & si.collisionFilterGroup
            )
          ) {
            continue;
          }

          if (
            xi.distanceTo(xj) >
            si.boundingSphereRadius + sj.boundingSphereRadius
          ) {
            continue;
          }

          // Get collision material
          let shapeContactMaterial: ContactMaterial | null = null;
          if (si.material && sj.material) {
            shapeContactMaterial =
              world.getContactMaterial(si.material!, sj.material!) || null;
          }

          this.currentContactMaterial =
            shapeContactMaterial ||
            bodyContactMaterial ||
            world.defaultContactMaterial;

          // Get contacts
          let retval = false;

          // TO DO: investigate why sphereParticle and convexParticle
          // resolvers expect si and sj shapes to be in reverse order
          // (i.e. larger integer value type first instead of smaller first)
          if (i32(si.type) < i32(sj.type)) {
            retval = this.getResolver(
              si.type | sj.type,
              si,
              sj,
              xi,
              xj,
              qi,
              qj,
              bi,
              bj,
              si,
              sj,
              justTest
            );
          } else {
            retval = this.getResolver(
              si.type | sj.type,
              sj,
              si,
              xj,
              xi,
              qj,
              qi,
              bj,
              bi,
              si,
              sj,
              justTest
            );
          }

          if (retval && justTest) {
            // Register overlap
            world.shapeOverlapKeeper.set(si.id, sj.id);
            world.bodyOverlapKeeper.set(bi.id, bj.id);
          }
        }
      }
    }
  }

  boxBox(
    si: Box,
    sj: Box,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    si.convexPolyhedronRepresentation!.material = si.material;
    sj.convexPolyhedronRepresentation!.material = sj.material;
    si.convexPolyhedronRepresentation!.collisionResponse = si.collisionResponse;
    sj.convexPolyhedronRepresentation!.collisionResponse = sj.collisionResponse;
    return this.convexConvex(
      si.convexPolyhedronRepresentation!,
      sj.convexPolyhedronRepresentation!,
      xi,
      xj,
      qi,
      qj,
      bi,
      bj,
      si,
      sj,
      justTest
    );
  }

  boxConvex(
    si: Box,
    sj: ConvexPolyhedron,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    si.convexPolyhedronRepresentation!.material = si.material;
    si.convexPolyhedronRepresentation!.collisionResponse = si.collisionResponse;
    return this.convexConvex(
      si.convexPolyhedronRepresentation!,
      sj,
      xi,
      xj,
      qi,
      qj,
      bi,
      bj,
      rsi,
      rsj,
      justTest
    );
  }

  boxParticle(
    si: Box,
    sj: Particle,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    si.convexPolyhedronRepresentation!.material = si.material;
    si.convexPolyhedronRepresentation!.collisionResponse = si.collisionResponse;
    return this.convexParticle(
      si.convexPolyhedronRepresentation!,
      sj,
      xi,
      xj,
      qi,
      qj,
      bi,
      bj,
      si,
      sj,
      justTest
    );
  }

  sphereSphere(
    si: Sphere,
    sj: Sphere,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    if (justTest) {
      return xi.distanceSquared(xj) < (si.radius + sj.radius) ** 2;
    }

    // We will have only one contact in this case
    const contactEq = this.createContactEquation(bi, bj, si, sj, rsi, rsj);

    // Contact normal
    xj.vsub(xi, contactEq.ni);
    contactEq.ni.normalize();

    // Contact point locations
    contactEq.ri.copy(contactEq.ni);
    contactEq.rj.copy(contactEq.ni);
    contactEq.ri.scale(si.radius, contactEq.ri);
    contactEq.rj.scale(-sj.radius, contactEq.rj);

    contactEq.ri.vadd(xi, contactEq.ri);
    contactEq.ri.vsub(bi.position, contactEq.ri);

    contactEq.rj.vadd(xj, contactEq.rj);
    contactEq.rj.vsub(bj.position, contactEq.rj);

    this.result.push(contactEq);

    this.createFrictionEquationsFromContact(contactEq, this.frictionResult);

    return false;
  }

  planeTrimesh(
    planeShape: Plane,
    trimeshShape: Trimesh,
    planePos: Vec3,
    trimeshPos: Vec3,
    planeQuat: Quaternion,
    trimeshQuat: Quaternion,
    planeBody: Body,
    trimeshBody: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    // Make contacts!
    const v = new Vec3();

    const normal = planeTrimesh_normal;
    normal.set(0, 0, 1);
    planeQuat.vmult(normal, normal); // Turn normal according to plane

    for (let i: i32 = 0; i < trimeshShape.vertices.length / 3; i++) {
      // Get world vertex from trimesh
      trimeshShape.getVertex(i, v);

      // Safe up
      const v2 = new Vec3();
      v2.copy(v);
      Transform.pointToWorldFrame(trimeshPos, trimeshQuat, v2, v);

      // Check plane side
      const relpos = planeTrimesh_relpos;
      v.vsub(planePos, relpos);
      const dot = normal.dot(relpos);

      if (dot <= 0.0) {
        if (justTest) {
          return true;
        }

        const r = this.createContactEquation(
          planeBody,
          trimeshBody,
          planeShape,
          trimeshShape,
          rsi,
          rsj
        );

        r.ni.copy(normal); // Contact normal is the plane normal

        // Get vertex position projected on plane
        const projected = planeTrimesh_projected;
        normal.scale(relpos.dot(normal), projected);
        v.vsub(projected, projected);

        // ri is the projected world position minus plane position
        r.ri.copy(projected);
        r.ri.vsub(planeBody.position, r.ri);

        r.rj.copy(v);
        r.rj.vsub(trimeshBody.position, r.rj);

        // Store result
        this.result.push(r);
        this.createFrictionEquationsFromContact(r, this.frictionResult);
      }
    }

    return false;
  }

  sphereTrimesh(
    sphereShape: Sphere,
    trimeshShape: Trimesh,
    spherePos: Vec3,
    trimeshPos: Vec3,
    sphereQuat: Quaternion,
    trimeshQuat: Quaternion,
    sphereBody: Body,
    trimeshBody: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    const edgeVertexA = sphereTrimesh_edgeVertexA;
    const edgeVertexB = sphereTrimesh_edgeVertexB;
    const edgeVector = sphereTrimesh_edgeVector;
    const edgeVectorUnit = sphereTrimesh_edgeVectorUnit;
    const localSpherePos = sphereTrimesh_localSpherePos;
    const tmp = sphereTrimesh_tmp;
    const localSphereAABB = sphereTrimesh_localSphereAABB;
    const v2 = sphereTrimesh_v2;
    const relpos = sphereTrimesh_relpos;
    const triangles = sphereTrimesh_triangles;

    // Convert sphere position to local in the trimesh
    Transform.pointToLocalFrame(
      trimeshPos,
      trimeshQuat,
      spherePos,
      localSpherePos
    );

    // Get the aabb of the sphere locally in the trimesh
    const sphereRadius = sphereShape.radius;
    localSphereAABB.lowerBound.set(
      localSpherePos.x - sphereRadius,
      localSpherePos.y - sphereRadius,
      localSpherePos.z - sphereRadius
    );
    localSphereAABB.upperBound.set(
      localSpherePos.x + sphereRadius,
      localSpherePos.y + sphereRadius,
      localSpherePos.z + sphereRadius
    );

    trimeshShape.getTrianglesInAABB(localSphereAABB, triangles);
    //for (let i = 0; i < trimeshShape.indices.length / 3; i++) triangles.push(i); // All

    // Vertices
    const v = sphereTrimesh_v;
    const radiusSquared = sphereShape.radius * sphereShape.radius;
    for (let i: i32 = 0; i < triangles.length; i++) {
      for (let j: i32 = 0; j < 3; j++) {
        trimeshShape.getVertex(trimeshShape.indices[triangles[i] * 3 + j], v);

        // Check vertex overlap in sphere
        v.vsub(localSpherePos, relpos);

        if (relpos.lengthSquared() <= radiusSquared) {
          // Safe up
          v2.copy(v);
          Transform.pointToWorldFrame(trimeshPos, trimeshQuat, v2, v);

          v.vsub(spherePos, relpos);

          if (justTest) {
            return true;
          }

          let r = this.createContactEquation(
            sphereBody,
            trimeshBody,
            sphereShape,
            trimeshShape,
            rsi,
            rsj
          );
          r.ni.copy(relpos);
          r.ni.normalize();

          // ri is the vector from sphere center to the sphere surface
          r.ri.copy(r.ni);
          r.ri.scale(sphereShape.radius, r.ri);
          r.ri.vadd(spherePos, r.ri);
          r.ri.vsub(sphereBody.position, r.ri);

          r.rj.copy(v);
          r.rj.vsub(trimeshBody.position, r.rj);

          // Store result
          this.result.push(r);
          this.createFrictionEquationsFromContact(r, this.frictionResult);
        }
      }
    }

    // Check all edges
    for (let i: i32 = 0; i < triangles.length; i++) {
      for (let j: i32 = 0; j < 3; j++) {
        trimeshShape.getVertex(
          trimeshShape.indices[triangles[i] * 3 + j],
          edgeVertexA
        );
        trimeshShape.getVertex(
          trimeshShape.indices[triangles[i] * 3 + ((j + 1) % 3)],
          edgeVertexB
        );
        edgeVertexB.vsub(edgeVertexA, edgeVector);

        // Project sphere position to the edge
        localSpherePos.vsub(edgeVertexB, tmp);
        const positionAlongEdgeB = tmp.dot(edgeVector);

        localSpherePos.vsub(edgeVertexA, tmp);
        let positionAlongEdgeA = tmp.dot(edgeVector);

        if (positionAlongEdgeA > 0 && positionAlongEdgeB < 0) {
          // Now check the orthogonal distance from edge to sphere center
          localSpherePos.vsub(edgeVertexA, tmp);

          edgeVectorUnit.copy(edgeVector);
          edgeVectorUnit.normalize();
          positionAlongEdgeA = tmp.dot(edgeVectorUnit);

          edgeVectorUnit.scale(positionAlongEdgeA, tmp);
          tmp.vadd(edgeVertexA, tmp);

          // tmp is now the sphere center position projected to the edge, defined locally in the trimesh frame
          const dist = tmp.distanceTo(localSpherePos);
          if (dist < sphereShape.radius) {
            if (justTest) {
              return true;
            }

            const r = this.createContactEquation(
              sphereBody,
              trimeshBody,
              sphereShape,
              trimeshShape,
              rsi,
              rsj
            );

            tmp.vsub(localSpherePos, r.ni);
            r.ni.normalize();
            r.ni.scale(sphereShape.radius, r.ri);
            r.ri.vadd(spherePos, r.ri);
            r.ri.vsub(sphereBody.position, r.ri);

            Transform.pointToWorldFrame(trimeshPos, trimeshQuat, tmp, tmp);
            tmp.vsub(trimeshBody.position, r.rj);

            Transform.vectorToWorldFrame(trimeshQuat, r.ni, r.ni);
            Transform.vectorToWorldFrame(trimeshQuat, r.ri, r.ri);

            this.result.push(r);
            this.createFrictionEquationsFromContact(r, this.frictionResult);
          }
        }
      }
    }

    // Triangle faces
    const va = sphereTrimesh_va;
    const vb = sphereTrimesh_vb;
    const vc = sphereTrimesh_vc;
    const normal = sphereTrimesh_normal;
    for (let i: i32 = 0, N = triangles.length; i != N; i++) {
      trimeshShape.getTriangleVertices(triangles[i], va, vb, vc);
      trimeshShape.getNormal(triangles[i], normal);
      localSpherePos.vsub(va, tmp);
      let dist = tmp.dot(normal);
      normal.scale(dist, tmp);
      localSpherePos.vsub(tmp, tmp);

      // tmp is now the sphere position projected to the triangle plane
      dist = tmp.distanceTo(localSpherePos);
      if (Ray.pointInTriangle(tmp, va, vb, vc) && dist < sphereShape.radius) {
        if (justTest) {
          return true;
        }
        let r = this.createContactEquation(
          sphereBody,
          trimeshBody,
          sphereShape,
          trimeshShape,
          rsi,
          rsj
        );

        tmp.vsub(localSpherePos, r.ni);
        r.ni.normalize();
        r.ni.scale(sphereShape.radius, r.ri);
        r.ri.vadd(spherePos, r.ri);
        r.ri.vsub(sphereBody.position, r.ri);

        Transform.pointToWorldFrame(trimeshPos, trimeshQuat, tmp, tmp);
        tmp.vsub(trimeshBody.position, r.rj);

        Transform.vectorToWorldFrame(trimeshQuat, r.ni, r.ni);
        Transform.vectorToWorldFrame(trimeshQuat, r.ri, r.ri);

        this.result.push(r);
        this.createFrictionEquationsFromContact(r, this.frictionResult);
      }
    }

    triangles.length = 0;
    return false;
  }

  spherePlane(
    si: Sphere,
    sj: Plane,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    // We will have one contact in this case
    const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);

    // Contact normal
    r.ni.set(0, 0, 1);
    qj.vmult(r.ni, r.ni);
    r.ni.negate(r.ni); // body i is the sphere, flip normal
    r.ni.normalize(); // Needed?

    // Vector from sphere center to contact point
    r.ni.scale(si.radius, r.ri);

    // Project down sphere on plane
    xi.vsub(xj, point_on_plane_to_sphere);
    r.ni.scale(r.ni.dot(point_on_plane_to_sphere), plane_to_sphere_ortho);
    point_on_plane_to_sphere.vsub(plane_to_sphere_ortho, r.rj); // The sphere position projected to plane

    if (-point_on_plane_to_sphere.dot(r.ni) <= si.radius) {
      if (justTest) {
        return true;
      }

      // Make it relative to the body
      const ri = r.ri;
      const rj = r.rj;
      ri.vadd(xi, ri);
      ri.vsub(bi.position, ri);
      rj.vadd(xj, rj);
      rj.vsub(bj.position, rj);

      this.result.push(r);
      this.createFrictionEquationsFromContact(r, this.frictionResult);
    }

    return false;
  }

  sphereBox(
    si: Sphere,
    sj: Box,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    const v3pool = this.v3pool;

    // we refer to the box as body j
    const sides = sphereBox_sides;
    xi.vsub(xj, box_to_sphere);
    sj.getSideNormals(sides, qj);
    const R = si.radius;
    // const penetrating_sides = []

    // Check side (plane) intersections
    let found = false;

    // Store the resulting side penetration info
    const side_ns = sphereBox_side_ns;
    const side_ns1 = sphereBox_side_ns1;
    const side_ns2 = sphereBox_side_ns2;
    let side_h: f32 = 0;
    let side_penetrations: i32 = 0;
    let side_dot1: f32 = 0;
    let side_dot2: f32 = 0;
    let side_distance_isNull: boolean = true;
    let side_distance: f32 = 0;
    for (
      let idx: i32 = 0, nsides = sides.length;
      idx != nsides && found == false;
      idx++
    ) {
      // Get the plane side normal (ns)
      const ns = sphereBox_ns;
      ns.copy(sides[idx]);

      const h = ns.length();
      ns.normalize();

      // The normal/distance dot product tells which side of the plane we are
      const dot = box_to_sphere.dot(ns);

      if (dot < h + R && dot > 0) {
        // Intersects plane. Now check the other two dimensions
        const ns1 = sphereBox_ns1;
        const ns2 = sphereBox_ns2;
        ns1.copy(sides[(idx + 1) % 3]);
        ns2.copy(sides[(idx + 2) % 3]);
        const h1 = ns1.length();
        const h2 = ns2.length();
        ns1.normalize();
        ns2.normalize();
        const dot1 = box_to_sphere.dot(ns1);
        const dot2 = box_to_sphere.dot(ns2);
        if (dot1 < h1 && dot1 > -h1 && dot2 < h2 && dot2 > -h2) {
          const dist = Mathf.abs(dot - h - R);
          if (side_distance_isNull || dist < side_distance) {
            side_distance = dist;
            side_dot1 = dot1;
            side_dot2 = dot2;
            side_h = h;
            side_ns.copy(ns);
            side_ns1.copy(ns1);
            side_ns2.copy(ns2);
            side_penetrations++;

            if (justTest) {
              return true;
            }
          }
        }
      }
    }
    if (side_penetrations) {
      found = true;
      const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);
      side_ns.scale(-R, r.ri); // Sphere r
      r.ni.copy(side_ns);
      r.ni.negate(r.ni); // Normal should be out of sphere
      side_ns.scale(side_h, side_ns);
      side_ns1.scale(side_dot1, side_ns1);
      side_ns.vadd(side_ns1, side_ns);
      side_ns2.scale(side_dot2, side_ns2);
      side_ns.vadd(side_ns2, r.rj);

      // Make relative to bodies
      r.ri.vadd(xi, r.ri);
      r.ri.vsub(bi.position, r.ri);
      r.rj.vadd(xj, r.rj);
      r.rj.vsub(bj.position, r.rj);

      this.result.push(r);
      this.createFrictionEquationsFromContact(r, this.frictionResult);
    }

    // Check corners
    let rj: Vec3 | null = v3pool.get();
    const sphere_to_corner = sphereBox_sphere_to_corner;
    for (let j: i32 = 0; j != 2 && !found; j++) {
      for (let k: i32 = 0; k != 2 && !found; k++) {
        for (let l: i32 = 0; l != 2 && !found; l++) {
          rj.set(0, 0, 0);
          if (j) {
            rj.vadd(sides[0], rj);
          } else {
            rj.vsub(sides[0], rj);
          }
          if (k) {
            rj.vadd(sides[1], rj);
          } else {
            rj.vsub(sides[1], rj);
          }
          if (l) {
            rj.vadd(sides[2], rj);
          } else {
            rj.vsub(sides[2], rj);
          }

          // World position of corner
          xj.vadd(rj, sphere_to_corner);
          sphere_to_corner.vsub(xi, sphere_to_corner);

          if (sphere_to_corner.lengthSquared() < R * R) {
            if (justTest) {
              return true;
            }
            found = true;
            const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);
            r.ri.copy(sphere_to_corner);
            r.ri.normalize();
            r.ni.copy(r.ri);
            r.ri.scale(R, r.ri);
            r.rj.copy(rj);

            // Make relative to bodies
            r.ri.vadd(xi, r.ri);
            r.ri.vsub(bi.position, r.ri);
            r.rj.vadd(xj, r.rj);
            r.rj.vsub(bj.position, r.rj);

            this.result.push(r);
            this.createFrictionEquationsFromContact(r, this.frictionResult);
          }
        }
      }
    }
    v3pool.releaseOne(rj);
    rj = null;

    // Check edges
    const edgeTangent = v3pool.get();
    const edgeCenter = v3pool.get();
    const r = v3pool.get(); // r = edge center to sphere center
    const orthogonal = v3pool.get();
    const dist = v3pool.get();
    const Nsides = sides.length;
    for (let j: i32 = 0; j != Nsides && !found; j++) {
      for (let k: i32 = 0; k != Nsides && !found; k++) {
        if (j % 3 != k % 3) {
          // Get edge tangent
          sides[k].cross(sides[j], edgeTangent);
          edgeTangent.normalize();
          sides[j].vadd(sides[k], edgeCenter);
          r.copy(xi);
          r.vsub(edgeCenter, r);
          r.vsub(xj, r);
          const orthonorm = r.dot(edgeTangent); // distance from edge center to sphere center in the tangent direction
          edgeTangent.scale(orthonorm, orthogonal); // Vector from edge center to sphere center in the tangent direction

          // Find the third side orthogonal to this one
          let l: i32 = 0;
          while (l == j % 3 || l == k % 3) {
            l++;
          }

          // vec from edge center to sphere projected to the plane orthogonal to the edge tangent
          dist.copy(xi);
          dist.vsub(orthogonal, dist);
          dist.vsub(edgeCenter, dist);
          dist.vsub(xj, dist);

          // Distances in tangent direction and distance in the plane orthogonal to it
          const tdist = Mathf.abs(orthonorm);
          const ndist = dist.length();

          if (tdist < sides[l].length() && ndist < R) {
            if (justTest) {
              return true;
            }
            found = true;
            const res = this.createContactEquation(bi, bj, si, sj, rsi, rsj);
            edgeCenter.vadd(orthogonal, res.rj); // box rj
            res.rj.copy(res.rj);
            dist.negate(res.ni);
            res.ni.normalize();

            res.ri.copy(res.rj);
            res.ri.vadd(xj, res.ri);
            res.ri.vsub(xi, res.ri);
            res.ri.normalize();
            res.ri.scale(R, res.ri);

            // Make relative to bodies
            res.ri.vadd(xi, res.ri);
            res.ri.vsub(bi.position, res.ri);
            res.rj.vadd(xj, res.rj);
            res.rj.vsub(bj.position, res.rj);

            this.result.push(res);
            this.createFrictionEquationsFromContact(res, this.frictionResult);
          }
        }
      }
    }
    v3pool.releaseOne(edgeTangent);
    v3pool.releaseOne(edgeCenter);
    v3pool.releaseOne(r);
    v3pool.releaseOne(orthogonal);
    v3pool.releaseOne(dist);

    return false;
  }

  sphereConvex(
    si: Sphere,
    sj: ConvexPolyhedron,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    const v3pool = this.v3pool;
    xi.vsub(xj, convex_to_sphere);
    const normals = sj.faceNormals;
    const faces = sj.faces;
    const verts = sj.vertices;
    const R = si.radius;
    // const penetrating_sides = []

    // if(convex_to_sphere.lengthSquared() > si.boundingSphereRadius + sj.boundingSphereRadius){
    //     return;
    // }
    let found = false;

    // Check corners
    for (let i: i32 = 0; i != verts.length; i++) {
      const v = verts[i];

      // World position of corner
      const worldCorner = sphereConvex_worldCorner;
      qj.vmult(v, worldCorner);
      xj.vadd(worldCorner, worldCorner);
      const sphere_to_corner = sphereConvex_sphereToCorner;
      worldCorner.vsub(xi, sphere_to_corner);
      if (sphere_to_corner.lengthSquared() < R * R) {
        if (justTest) {
          return true;
        }
        found = true;
        const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);
        r.ri.copy(sphere_to_corner);
        r.ri.normalize();
        r.ni.copy(r.ri);
        r.ri.scale(R, r.ri);
        worldCorner.vsub(xj, r.rj);

        // Should be relative to the body.
        r.ri.vadd(xi, r.ri);
        r.ri.vsub(bi.position, r.ri);

        // Should be relative to the body.
        r.rj.vadd(xj, r.rj);
        r.rj.vsub(bj.position, r.rj);

        this.result.push(r);
        this.createFrictionEquationsFromContact(r, this.frictionResult);
        return false;
      }
    }

    // Check side (plane) intersections
    for (
      let i: i32 = 0, nfaces = faces.length;
      i != nfaces && found == false;
      i++
    ) {
      const normal = normals[i]!;
      const face = faces[i];

      // Get world-transformed normal of the face
      const worldNormal = sphereConvex_worldNormal;
      qj.vmult(normal, worldNormal);

      // Get a world vertex from the face
      const worldPoint = sphereConvex_worldPoint;
      qj.vmult(verts[face[0]], worldPoint);
      worldPoint.vadd(xj, worldPoint);

      // Get a point on the sphere, closest to the face normal
      const worldSpherePointClosestToPlane =
        sphereConvex_worldSpherePointClosestToPlane;
      worldNormal.scale(-R, worldSpherePointClosestToPlane);
      xi.vadd(worldSpherePointClosestToPlane, worldSpherePointClosestToPlane);

      // Vector from a face point to the closest point on the sphere
      const penetrationVec = sphereConvex_penetrationVec;
      worldSpherePointClosestToPlane.vsub(worldPoint, penetrationVec);

      // The penetration. Negative value means overlap.
      const penetration = penetrationVec.dot(worldNormal);

      const worldPointToSphere = sphereConvex_sphereToWorldPoint;
      xi.vsub(worldPoint, worldPointToSphere);

      if (penetration < 0 && worldPointToSphere.dot(worldNormal) > 0) {
        // Intersects plane. Now check if the sphere is inside the face polygon
        const faceVerts: Vec3[] = []; // Face vertices, in world coords
        for (let j: i32 = 0, Nverts = face.length; j != Nverts; j++) {
          const worldVertex = v3pool.get();
          qj.vmult(verts[face[j]], worldVertex);
          xj.vadd(worldVertex, worldVertex);
          faceVerts.push(worldVertex);
        }

        if (pointInPolygon(faceVerts, worldNormal, xi)) {
          // Is the sphere center in the face polygon?
          if (justTest) {
            return true;
          }
          found = true;
          const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);

          worldNormal.scale(-R, r.ri); // Contact offset, from sphere center to contact
          worldNormal.negate(r.ni); // Normal pointing out of sphere

          const penetrationVec2 = v3pool.get();
          worldNormal.scale(-penetration, penetrationVec2);
          const penetrationSpherePoint = v3pool.get();
          worldNormal.scale(-R, penetrationSpherePoint);

          //xi.vsub(xj).vadd(penetrationSpherePoint).vadd(penetrationVec2 , r.rj);
          xi.vsub(xj, r.rj);
          r.rj.vadd(penetrationSpherePoint, r.rj);
          r.rj.vadd(penetrationVec2, r.rj);

          // Should be relative to the body.
          r.rj.vadd(xj, r.rj);
          r.rj.vsub(bj.position, r.rj);

          // Should be relative to the body.
          r.ri.vadd(xi, r.ri);
          r.ri.vsub(bi.position, r.ri);

          v3pool.releaseOne(penetrationVec2);
          v3pool.releaseOne(penetrationSpherePoint);

          this.result.push(r);
          this.createFrictionEquationsFromContact(r, this.frictionResult);

          // Release world vertices
          for (
            let j: i32 = 0, Nfaceverts = faceVerts.length;
            j != Nfaceverts;
            j++
          ) {
            v3pool.releaseOne(faceVerts[j]);
          }

          return false; // We only expect *one* face contact
        } else {
          // Edge?
          for (let j: i32 = 0; j != face.length; j++) {
            // Get two world transformed vertices
            const v1 = v3pool.get();
            const v2 = v3pool.get();
            qj.vmult(verts[face[(j + 1) % face.length]], v1);
            qj.vmult(verts[face[(j + 2) % face.length]], v2);
            xj.vadd(v1, v1);
            xj.vadd(v2, v2);

            // Construct edge vector
            const edge = sphereConvex_edge;
            v2.vsub(v1, edge);

            // Construct the same vector, but normalized
            const edgeUnit = sphereConvex_edgeUnit;
            edge.unit(edgeUnit);

            // p is xi projected onto the edge
            const p = v3pool.get();
            const v1_to_xi = v3pool.get();
            xi.vsub(v1, v1_to_xi);
            const dot = v1_to_xi.dot(edgeUnit);
            edgeUnit.scale(dot, p);
            p.vadd(v1, p);

            // Compute a vector from p to the center of the sphere
            const xi_to_p = v3pool.get();
            p.vsub(xi, xi_to_p);

            // Collision if the edge-sphere distance is less than the radius
            // AND if p is in between v1 and v2
            if (
              dot > 0 &&
              dot * dot < edge.lengthSquared() &&
              xi_to_p.lengthSquared() < R * R
            ) {
              // Collision if the edge-sphere distance is less than the radius
              // Edge contact!
              if (justTest) {
                return true;
              }
              const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);
              p.vsub(xj, r.rj);

              p.vsub(xi, r.ni);
              r.ni.normalize();

              r.ni.scale(R, r.ri);

              // Should be relative to the body.
              r.rj.vadd(xj, r.rj);
              r.rj.vsub(bj.position, r.rj);

              // Should be relative to the body.
              r.ri.vadd(xi, r.ri);
              r.ri.vsub(bi.position, r.ri);

              this.result.push(r);
              this.createFrictionEquationsFromContact(r, this.frictionResult);

              // Release world vertices
              for (
                let j: i32 = 0, Nfaceverts = faceVerts.length;
                j != Nfaceverts;
                j++
              ) {
                v3pool.releaseOne(faceVerts[j]);
              }

              v3pool.releaseOne(v1);
              v3pool.releaseOne(v2);
              v3pool.releaseOne(p);
              v3pool.releaseOne(xi_to_p);
              v3pool.releaseOne(v1_to_xi);

              return false;
            }

            v3pool.releaseOne(v1);
            v3pool.releaseOne(v2);
            v3pool.releaseOne(p);
            v3pool.releaseOne(xi_to_p);
            v3pool.releaseOne(v1_to_xi);
          }
        }

        // Release world vertices
        for (
          let j: i32 = 0, Nfaceverts = faceVerts.length;
          j != Nfaceverts;
          j++
        ) {
          v3pool.releaseOne(faceVerts[j]);
        }
      }
    }

    return false;
  }

  planeBox(
    si: Plane,
    sj: Box,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    sj.convexPolyhedronRepresentation!.material = sj.material;
    sj.convexPolyhedronRepresentation!.collisionResponse = sj.collisionResponse;
    sj.convexPolyhedronRepresentation!.id = sj.id;
    return this.planeConvex(
      si,
      sj.convexPolyhedronRepresentation!,
      xi,
      xj,
      qi,
      qj,
      bi,
      bj,
      si,
      sj,
      justTest
    );
  }

  planeConvex(
    planeShape: Plane,
    convexShape: ConvexPolyhedron,
    planePosition: Vec3,
    convexPosition: Vec3,
    planeQuat: Quaternion,
    convexQuat: Quaternion,
    planeBody: Body,
    convexBody: Body,
    si: Shape,
    sj: Shape,
    justTest: i32
  ): boolean {
    // Simply return the points behind the plane.
    const worldVertex = planeConvex_v;

    const worldNormal = planeConvex_normal;
    worldNormal.set(0, 0, 1);
    planeQuat.vmult(worldNormal, worldNormal); // Turn normal according to plane orientation

    let numContacts: i32 = 0;
    const relpos = planeConvex_relpos;
    for (let i: i32 = 0; i != convexShape.vertices.length; i++) {
      // Get world convex vertex
      worldVertex.copy(convexShape.vertices[i]);
      convexQuat.vmult(worldVertex, worldVertex);
      convexPosition.vadd(worldVertex, worldVertex);
      worldVertex.vsub(planePosition, relpos);

      const dot = worldNormal.dot(relpos);
      if (dot <= 0.0) {
        if (justTest) {
          return true;
        }

        const r = this.createContactEquation(
          planeBody,
          convexBody,
          planeShape,
          convexShape,
          si,
          sj
        );

        // Get vertex position projected on plane
        const projected = planeConvex_projected;
        worldNormal.scale(worldNormal.dot(relpos), projected);
        worldVertex.vsub(projected, projected);
        projected.vsub(planePosition, r.ri); // From plane to vertex projected on plane

        r.ni.copy(worldNormal); // Contact normal is the plane normal out from plane

        // rj is now just the vector from the convex center to the vertex
        worldVertex.vsub(convexPosition, r.rj);

        // Make it relative to the body
        r.ri.vadd(planePosition, r.ri);
        r.ri.vsub(planeBody.position, r.ri);
        r.rj.vadd(convexPosition, r.rj);
        r.rj.vsub(convexBody.position, r.rj);

        this.result.push(r);
        numContacts++;
        if (!this.enableFrictionReduction) {
          this.createFrictionEquationsFromContact(r, this.frictionResult);
        }
      }
    }

    if (this.enableFrictionReduction && numContacts) {
      this.createFrictionFromAverage(numContacts);
    }

    return false;
  }

  convexConvex(
    si: ConvexPolyhedron,
    sj: ConvexPolyhedron,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape | null = null,
    rsj: Shape | null = null,
    justTest: i32 = 0,
    faceListA: i32[] | null = null,
    faceListB: i32[] | null = null
  ): boolean {
    const sepAxis = convexConvex_sepAxis;

    if (xi.distanceTo(xj) > si.boundingSphereRadius + sj.boundingSphereRadius) {
      return false;
    }

    if (
      si.findSeparatingAxis(sj, xi, qi, xj, qj, sepAxis, faceListA, faceListB)
    ) {
      const res: ConvexPolyhedronContactPoint[] = [];
      const q = convexConvex_q;
      si.clipAgainstHull(xi, qi, sj, xj, qj, sepAxis, -100, 100, res);
      let numContacts: i32 = 0;
      for (let j: i32 = 0; j != res.length; j++) {
        if (justTest) {
          return true;
        }
        const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);
        const ri = r.ri;
        const rj = r.rj;
        sepAxis.negate(r.ni);
        res[j].normal.negate(q);
        q.scale(res[j].depth, q);
        res[j].point.vadd(q, ri);
        rj.copy(res[j].point);

        // Contact points are in world coordinates. Transform back to relative
        ri.vsub(xi, ri);
        rj.vsub(xj, rj);

        // Make relative to bodies
        ri.vadd(xi, ri);
        ri.vsub(bi.position, ri);
        rj.vadd(xj, rj);
        rj.vsub(bj.position, rj);

        this.result.push(r);
        numContacts++;
        if (!this.enableFrictionReduction) {
          this.createFrictionEquationsFromContact(r, this.frictionResult);
        }
      }
      if (this.enableFrictionReduction && numContacts) {
        this.createFrictionFromAverage(numContacts);
      }
    }

    return false;
  }

  // convexTrimesh(
  //   si: ConvexPolyhedron, sj: Trimesh, xi: Vec3, xj: Vec3, qi: Quaternion, qj: Quaternion,
  //   bi: Body, bj: Body, rsi?: Shape | null, rsj?: Shape | null,
  //   faceListA?: number[] | null, faceListB?: number[] | null,
  // ) {
  //   const sepAxis = convexConvex_sepAxis;

  //   if(xi.distanceTo(xj) > si.boundingSphereRadius + sj.boundingSphereRadius){
  //       return;
  //   }

  //   // Construct a temp hull for each triangle
  //   const hullB = new ConvexPolyhedron();

  //   hullB.faces = [[0,1,2]];
  //   const va = new Vec3();
  //   const vb = new Vec3();
  //   const vc = new Vec3();
  //   hullB.vertices = [
  //       va,
  //       vb,
  //       vc
  //   ];

  //   for (let i = 0; i < sj.indices.length / 3; i++) {

  //       const triangleNormal = new Vec3();
  //       sj.getNormal(i, triangleNormal);
  //       hullB.faceNormals = [triangleNormal];

  //       sj.getTriangleVertices(i, va, vb, vc);

  //       let d = si.testSepAxis(triangleNormal, hullB, xi, qi, xj, qj);
  //       if(!d){
  //           triangleNormal.scale(-1, triangleNormal);
  //           d = si.testSepAxis(triangleNormal, hullB, xi, qi, xj, qj);

  //           if(!d){
  //               continue;
  //           }
  //       }

  //       const res: ConvexPolyhedronContactPoint[] = [];
  //       const q = convexConvex_q;
  //       si.clipAgainstHull(xi,qi,hullB,xj,qj,triangleNormal,-100,100,res);
  //       for(let j = 0; j != res.length; j++){
  //           const r = this.createContactEquation(bi,bj,si,sj,rsi,rsj),
  //               ri = r.ri,
  //               rj = r.rj;
  //           r.ni.copy(triangleNormal);
  //           r.ni.negate(r.ni);
  //           res[j].normal.negate(q);
  //           q.mult(res[j].depth, q);
  //           res[j].point.vadd(q, ri);
  //           rj.copy(res[j].point);

  //           // Contact points are in world coordinates. Transform back to relative
  //           ri.vsub(xi,ri);
  //           rj.vsub(xj,rj);

  //           // Make relative to bodies
  //           ri.vadd(xi, ri);
  //           ri.vsub(bi.position, ri);
  //           rj.vadd(xj, rj);
  //           rj.vsub(bj.position, rj);

  //           result.push(r);
  //       }
  //   }
  // }

  planeParticle(
    sj: Plane,
    si: Particle,
    xj: Vec3,
    xi: Vec3,
    qj: Quaternion,
    qi: Quaternion,
    bj: Body,
    bi: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    const normal = particlePlane_normal;
    normal.set(0, 0, 1);
    bj.quaternion.vmult(normal, normal); // Turn normal according to plane orientation
    const relpos = particlePlane_relpos;
    xi.vsub(bj.position, relpos);
    const dot = normal.dot(relpos);
    if (dot <= 0.0) {
      if (justTest) {
        return true;
      }

      const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);
      r.ni.copy(normal); // Contact normal is the plane normal
      r.ni.negate(r.ni);
      r.ri.set(0, 0, 0); // Center of particle

      // Get particle position projected on plane
      const projected = particlePlane_projected;
      normal.scale(normal.dot(xi), projected);
      xi.vsub(projected, projected);
      //projected.vadd(bj.position,projected);

      // rj is now the projected world position minus plane position
      r.rj.copy(projected);
      this.result.push(r);
      this.createFrictionEquationsFromContact(r, this.frictionResult);
    }

    return false;
  }

  sphereParticle(
    sj: Sphere,
    si: Particle,
    xj: Vec3,
    xi: Vec3,
    qj: Quaternion,
    qi: Quaternion,
    bj: Body,
    bi: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    // The normal is the unit vector from sphere center to particle center
    const normal = particleSphere_normal;
    normal.set(0, 0, 1);
    xi.vsub(xj, normal);
    const lengthSquared = normal.lengthSquared();

    if (lengthSquared <= sj.radius * sj.radius) {
      if (justTest) {
        return true;
      }
      const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);
      normal.normalize();
      r.rj.copy(normal);
      r.rj.scale(sj.radius, r.rj);
      r.ni.copy(normal); // Contact normal
      r.ni.negate(r.ni);
      r.ri.set(0, 0, 0); // Center of particle
      this.result.push(r);
      this.createFrictionEquationsFromContact(r, this.frictionResult);
    }

    return false;
  }

  convexParticle(
    sj: ConvexPolyhedron,
    si: Particle,
    xj: Vec3,
    xi: Vec3,
    qj: Quaternion,
    qi: Quaternion,
    bj: Body,
    bi: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    let penetratedFaceIndex: i32 = -1;
    const penetratedFaceNormal = convexParticle_penetratedFaceNormal;
    const worldPenetrationVec = convexParticle_worldPenetrationVec;
    let minPenetration_isNull: boolean = true;
    let minPenetration: f32 = 0;
    // let numDetectedFaces = 0;

    // Convert particle position xi to local coords in the convex
    const local = convexParticle_local;
    local.copy(xi);
    local.vsub(xj, local); // Convert position to relative the convex origin
    qj.conjugate(cqj);
    cqj.vmult(local, local);

    if (sj.pointIsInside(local)) {
      if (sj.worldVerticesNeedsUpdate) {
        sj.computeWorldVertices(xj, qj);
      }
      if (sj.worldFaceNormalsNeedsUpdate) {
        sj.computeWorldFaceNormals(qj);
      }

      // For each world polygon in the polyhedra
      for (let i: i32 = 0, nfaces = sj.faces.length; i != nfaces; i++) {
        // Construct world face vertices
        const verts = [sj.worldVertices[sj.faces[i][0]]];
        const normal = sj.worldFaceNormals[i];

        // Check how much the particle penetrates the polygon plane.
        xi.vsub(verts[0], convexParticle_vertexToParticle);
        const penetration = -normal.dot(convexParticle_vertexToParticle);
        if (
          minPenetration_isNull ||
          Mathf.abs(penetration) < Mathf.abs(minPenetration)
        ) {
          if (justTest) {
            return true;
          }

          minPenetration_isNull = false;
          minPenetration = penetration;
          penetratedFaceIndex = i;
          penetratedFaceNormal.copy(normal);
          // numDetectedFaces++;
        }
      }

      if (penetratedFaceIndex != -1) {
        // Setup contact
        const r = this.createContactEquation(bi, bj, si, sj, rsi, rsj);
        penetratedFaceNormal.scale(minPenetration, worldPenetrationVec);

        // rj is the particle position projected to the face
        worldPenetrationVec.vadd(xi, worldPenetrationVec);
        worldPenetrationVec.vsub(xj, worldPenetrationVec);
        r.rj.copy(worldPenetrationVec);
        //const projectedToFace = xi.vsub(xj).vadd(worldPenetrationVec);
        //projectedToFace.copy(r.rj);

        //qj.vmult(r.rj,r.rj);
        penetratedFaceNormal.negate(r.ni); // Contact normal
        r.ri.set(0, 0, 0); // Center of particle

        const ri = r.ri;
        const rj = r.rj;

        // Make relative to bodies
        ri.vadd(xi, ri);
        ri.vsub(bi.position, ri);
        rj.vadd(xj, rj);
        rj.vsub(bj.position, rj);

        this.result.push(r);
        this.createFrictionEquationsFromContact(r, this.frictionResult);
      } else {
        console.warn(
          'Point found inside convex, but did not find penetrating face!'
        );
      }
    }

    return false;
  }

  boxHeightfield(
    si: Box,
    sj: Heightfield,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    si.convexPolyhedronRepresentation!.material = si.material;
    si.convexPolyhedronRepresentation!.collisionResponse = si.collisionResponse;
    return this.convexHeightfield(
      si.convexPolyhedronRepresentation!,
      sj,
      xi,
      xj,
      qi,
      qj,
      bi,
      bj,
      si,
      sj,
      justTest
    );
  }

  convexHeightfield(
    convexShape: ConvexPolyhedron,
    hfShape: Heightfield,
    convexPos: Vec3,
    hfPos: Vec3,
    convexQuat: Quaternion,
    hfQuat: Quaternion,
    convexBody: Body,
    hfBody: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    const data = hfShape.data;
    const w = hfShape.elementSize;
    const radius = convexShape.boundingSphereRadius;
    const worldPillarOffset = convexHeightfield_tmp2;
    const faceList = convexHeightfield_faceList;

    // Get sphere position to heightfield local!
    const localConvexPos = convexHeightfield_tmp1;
    Transform.pointToLocalFrame(hfPos, hfQuat, convexPos, localConvexPos);

    // Get the index of the data points to test against
    let iMinX: i32 = i32(Mathf.floor((localConvexPos.x - radius) / w)) - 1;

    let iMaxX: i32 = i32(Mathf.ceil((localConvexPos.x + radius) / w)) + 1;
    let iMinY: i32 = i32(Mathf.floor((localConvexPos.y - radius) / w)) - 1;
    let iMaxY: i32 = i32(Mathf.ceil((localConvexPos.y + radius) / w)) + 1;

    // Bail out if we are out of the terrain
    if (
      iMaxX < 0 ||
      iMaxY < 0 ||
      iMinX > data.length ||
      iMinY > data[0].length
    ) {
      return false;
    }

    // Clamp index to edges
    if (iMinX < 0) {
      iMinX = 0;
    }
    if (iMaxX < 0) {
      iMaxX = 0;
    }
    if (iMinY < 0) {
      iMinY = 0;
    }
    if (iMaxY < 0) {
      iMaxY = 0;
    }
    if (iMinX >= data.length) {
      iMinX = data.length - 1;
    }
    if (iMaxX >= data.length) {
      iMaxX = data.length - 1;
    }
    if (iMaxY >= data[0].length) {
      iMaxY = data[0].length - 1;
    }
    if (iMinY >= data[0].length) {
      iMinY = data[0].length - 1;
    }

    const minMax: f32[] = [];
    hfShape.getRectMinMax(iMinX, iMinY, iMaxX, iMaxY, minMax);
    const min = minMax[0];
    const max = minMax[1];

    // Bail out if we're cant touch the bounding height box
    if (localConvexPos.z - radius > max || localConvexPos.z + radius < min) {
      return false;
    }

    for (let i: i32 = iMinX; i < iMaxX; i++) {
      for (let j: i32 = iMinY; j < iMaxY; j++) {
        let intersecting = false;

        // Lower triangle
        hfShape.getConvexTrianglePillar(i, j, false);
        Transform.pointToWorldFrame(
          hfPos,
          hfQuat,
          hfShape.pillarOffset,
          worldPillarOffset
        );
        if (
          convexPos.distanceTo(worldPillarOffset) <
          hfShape.pillarConvex.boundingSphereRadius +
            convexShape.boundingSphereRadius
        ) {
          intersecting = this.convexConvex(
            convexShape,
            hfShape.pillarConvex,
            convexPos,
            worldPillarOffset,
            convexQuat,
            hfQuat,
            convexBody,
            hfBody,
            null,
            null,
            justTest,
            faceList,
            null
          );
        }

        if (justTest && intersecting) {
          return true;
        }

        // Upper triangle
        hfShape.getConvexTrianglePillar(i, j, true);
        Transform.pointToWorldFrame(
          hfPos,
          hfQuat,
          hfShape.pillarOffset,
          worldPillarOffset
        );
        if (
          convexPos.distanceTo(worldPillarOffset) <
          hfShape.pillarConvex.boundingSphereRadius +
            convexShape.boundingSphereRadius
        ) {
          intersecting = this.convexConvex(
            convexShape,
            hfShape.pillarConvex,
            convexPos,
            worldPillarOffset,
            convexQuat,
            hfQuat,
            convexBody,
            hfBody,
            null,
            null,
            justTest,
            faceList,
            null
          );
        }

        if (justTest && intersecting) {
          return true;
        }
      }
    }

    return false;
  }

  sphereHeightfield(
    sphereShape: Sphere,
    hfShape: Heightfield,
    spherePos: Vec3,
    hfPos: Vec3,
    sphereQuat: Quaternion,
    hfQuat: Quaternion,
    sphereBody: Body,
    hfBody: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    const data = hfShape.data;
    const radius = sphereShape.radius;
    const w = hfShape.elementSize;
    const worldPillarOffset = sphereHeightfield_tmp2;

    // Get sphere position to heightfield local!
    const localSpherePos = sphereHeightfield_tmp1;
    Transform.pointToLocalFrame(hfPos, hfQuat, spherePos, localSpherePos);

    // Get the index of the data points to test against
    let iMinX: i32 = i32(Mathf.floor((localSpherePos.x - radius) / w)) - 1;

    let iMaxX: i32 = i32(Mathf.ceil((localSpherePos.x + radius) / w)) + 1;
    let iMinY: i32 = i32(Mathf.floor((localSpherePos.y - radius) / w)) - 1;
    let iMaxY: i32 = i32(Mathf.ceil((localSpherePos.y + radius) / w)) + 1;

    // Bail out if we are out of the terrain
    if (
      iMaxX < 0 ||
      iMaxY < 0 ||
      iMinX > data.length ||
      iMinY > data[0].length
    ) {
      return false;
    }

    // Clamp index to edges
    if (iMinX < 0) {
      iMinX = 0;
    }
    if (iMaxX < 0) {
      iMaxX = 0;
    }
    if (iMinY < 0) {
      iMinY = 0;
    }
    if (iMaxY < 0) {
      iMaxY = 0;
    }
    if (iMinX >= data.length) {
      iMinX = data.length - 1;
    }
    if (iMaxX >= data.length) {
      iMaxX = data.length - 1;
    }
    if (iMaxY >= data[0].length) {
      iMaxY = data[0].length - 1;
    }
    if (iMinY >= data[0].length) {
      iMinY = data[0].length - 1;
    }

    const minMax: f32[] = [];
    hfShape.getRectMinMax(iMinX, iMinY, iMaxX, iMaxY, minMax);
    const min = minMax[0];
    const max = minMax[1];

    // Bail out if we can't touch the bounding height box
    if (localSpherePos.z - radius > max || localSpherePos.z + radius < min) {
      return false;
    }

    const result = this.result;
    for (let i: i32 = iMinX; i < iMaxX; i++) {
      for (let j: i32 = iMinY; j < iMaxY; j++) {
        const numContactsBefore = result.length;

        let intersecting = false;

        // Lower triangle
        hfShape.getConvexTrianglePillar(i, j, false);
        Transform.pointToWorldFrame(
          hfPos,
          hfQuat,
          hfShape.pillarOffset,
          worldPillarOffset
        );
        if (
          spherePos.distanceTo(worldPillarOffset) <
          hfShape.pillarConvex.boundingSphereRadius +
            sphereShape.boundingSphereRadius
        ) {
          intersecting = this.sphereConvex(
            sphereShape,
            hfShape.pillarConvex,
            spherePos,
            worldPillarOffset,
            sphereQuat,
            hfQuat,
            sphereBody,
            hfBody,
            sphereShape,
            hfShape,
            justTest
          );
        }

        if (justTest && intersecting) {
          return true;
        }

        // Upper triangle
        hfShape.getConvexTrianglePillar(i, j, true);
        Transform.pointToWorldFrame(
          hfPos,
          hfQuat,
          hfShape.pillarOffset,
          worldPillarOffset
        );
        if (
          spherePos.distanceTo(worldPillarOffset) <
          hfShape.pillarConvex.boundingSphereRadius +
            sphereShape.boundingSphereRadius
        ) {
          intersecting = this.sphereConvex(
            sphereShape,
            hfShape.pillarConvex,
            spherePos,
            worldPillarOffset,
            sphereQuat,
            hfQuat,
            sphereBody,
            hfBody,
            sphereShape,
            hfShape,
            justTest
          );
        }

        if (justTest && intersecting) {
          return true;
        }

        const numContacts = result.length - numContactsBefore;

        if (numContacts > 2) {
          return false;
        }
        /*
          // Skip all but 1
          for (let k = 0; k < numContacts - 1; k++) {
              result.pop();
          }
        */
      }
    }

    return false;
  }

  heightfieldCylinder(
    hfShape: Heightfield,
    convexShape: Cylinder,
    hfPos: Vec3,
    convexPos: Vec3,
    hfQuat: Quaternion,
    convexQuat: Quaternion,
    hfBody: Body,
    convexBody: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    return this.convexHeightfield(
      convexShape as ConvexPolyhedron,
      hfShape,
      convexPos,
      hfPos,
      convexQuat,
      hfQuat,
      convexBody,
      hfBody,
      rsi,
      rsj,
      justTest
    );
  }

  particleCylinder(
    si: Particle,
    sj: Cylinder,
    xi: Vec3,
    xj: Vec3,
    qi: Quaternion,
    qj: Quaternion,
    bi: Body,
    bj: Body,
    rsi: Shape,
    rsj: Shape,
    justTest: i32
  ): boolean {
    return this.convexParticle(
      sj as ConvexPolyhedron,
      si,
      xj,
      xi,
      qj,
      qi,
      bj,
      bi,
      rsi,
      rsj,
      justTest
    );
  }
}

const averageNormal = new Vec3();
const averageContactPointA = new Vec3();
const averageContactPointB = new Vec3();

const tmpVec1 = new Vec3();
const tmpVec2 = new Vec3();
const tmpQuat1 = new Quaternion();
const tmpQuat2 = new Quaternion();

// let numWarnings = 0;
// const maxWarnings = 10;

// function warn(msg: string): void {
//   if (numWarnings > maxWarnings) {
//     return;
//   }
//   numWarnings++;
//   console.warn(msg);
// }

const planeTrimesh_normal = new Vec3();
const planeTrimesh_relpos = new Vec3();
const planeTrimesh_projected = new Vec3();

const sphereTrimesh_normal = new Vec3();
const sphereTrimesh_relpos = new Vec3();
// const sphereTrimesh_projected = new Vec3()
const sphereTrimesh_v = new Vec3();
const sphereTrimesh_v2 = new Vec3();
const sphereTrimesh_edgeVertexA = new Vec3();
const sphereTrimesh_edgeVertexB = new Vec3();
const sphereTrimesh_edgeVector = new Vec3();
const sphereTrimesh_edgeVectorUnit = new Vec3();
const sphereTrimesh_localSpherePos = new Vec3();
const sphereTrimesh_tmp = new Vec3();
const sphereTrimesh_va = new Vec3();
const sphereTrimesh_vb = new Vec3();
const sphereTrimesh_vc = new Vec3();
const sphereTrimesh_localSphereAABB = new AABB();
const sphereTrimesh_triangles: i32[] = [];

const point_on_plane_to_sphere = new Vec3();
const plane_to_sphere_ortho = new Vec3();

// See http://bulletphysics.com/Bullet/BulletFull/SphereTriangleDetector_8cpp_source.html
const pointInPolygon_edge = new Vec3();
const pointInPolygon_edge_x_normal = new Vec3();
const pointInPolygon_vtp = new Vec3();
function pointInPolygon(verts: Vec3[], normal: Vec3, p: Vec3): boolean {
  let positiveResult: boolean = false;
  let positiveResultHasBeenSet = false;
  const N = verts.length;
  for (let i: i32 = 0; i != N; i++) {
    const v = verts[i];

    // Get edge to the next vertex
    const edge = pointInPolygon_edge;
    verts[(i + 1) % N].vsub(v, edge);

    // Get cross product between polygon normal and the edge
    const edge_x_normal = pointInPolygon_edge_x_normal;
    //const edge_x_normal = new Vec3();
    edge.cross(normal, edge_x_normal);

    // Get vector between point and current vertex
    const vertex_to_p = pointInPolygon_vtp;
    p.vsub(v, vertex_to_p);

    // This dot product determines which side of the edge the point is
    const r = edge_x_normal.dot(vertex_to_p);

    // If all such dot products have same sign, we are inside the polygon.
    if (
      positiveResultHasBeenSet == false ||
      (r > 0 && positiveResult == true) ||
      (r <= 0 && positiveResult == false)
    ) {
      if (positiveResultHasBeenSet == false) {
        positiveResult = r > 0;
        positiveResultHasBeenSet = true;
      }
      continue;
    } else {
      return false; // Encountered some other sign. Exit.
    }
  }

  // If we got here, all dot products were of the same sign.
  return true;
}

const box_to_sphere = new Vec3();
const sphereBox_ns = new Vec3();
const sphereBox_ns1 = new Vec3();
const sphereBox_ns2 = new Vec3();
const sphereBox_sides = [
  new Vec3(),
  new Vec3(),
  new Vec3(),
  new Vec3(),
  new Vec3(),
  new Vec3(),
];
const sphereBox_sphere_to_corner = new Vec3();
const sphereBox_side_ns = new Vec3();
const sphereBox_side_ns1 = new Vec3();
const sphereBox_side_ns2 = new Vec3();

const convex_to_sphere = new Vec3();
const sphereConvex_edge = new Vec3();
const sphereConvex_edgeUnit = new Vec3();
const sphereConvex_sphereToCorner = new Vec3();
const sphereConvex_worldCorner = new Vec3();
const sphereConvex_worldNormal = new Vec3();
const sphereConvex_worldPoint = new Vec3();
const sphereConvex_worldSpherePointClosestToPlane = new Vec3();
const sphereConvex_penetrationVec = new Vec3();
const sphereConvex_sphereToWorldPoint = new Vec3();

// const planeBox_normal = new Vec3()
// const plane_to_corner = new Vec3()

const planeConvex_v = new Vec3();
const planeConvex_normal = new Vec3();
const planeConvex_relpos = new Vec3();
const planeConvex_projected = new Vec3();

const convexConvex_sepAxis = new Vec3();
const convexConvex_q = new Vec3();

const particlePlane_normal = new Vec3();
const particlePlane_relpos = new Vec3();
const particlePlane_projected = new Vec3();

const particleSphere_normal = new Vec3();

// WIP
const cqj = new Quaternion();
const convexParticle_local = new Vec3();
// const convexParticle_normal = new Vec3()
const convexParticle_penetratedFaceNormal = new Vec3();
const convexParticle_vertexToParticle = new Vec3();
const convexParticle_worldPenetrationVec = new Vec3();

const convexHeightfield_tmp1 = new Vec3();
const convexHeightfield_tmp2 = new Vec3();
const convexHeightfield_faceList = [0];

const sphereHeightfield_tmp1 = new Vec3();
const sphereHeightfield_tmp2 = new Vec3();
