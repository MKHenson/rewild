// import { AABB } from "../collision/AABB";
import { Quaternion } from "../math/Quaternion";
import { Transform } from "../math/Transform";
import { Vec3 } from "../math/Vec3";
import { Shape } from "./Shape";

const computeEdges_tmpEdge = new Vec3();
const cb = new Vec3();
const ab = new Vec3();
const cah_WorldNormal = new Vec3();
const fsa_faceANormalWS3 = new Vec3(),
  fsa_Worldnormal1 = new Vec3(),
  fsa_deltaC = new Vec3(),
  fsa_worldEdge0 = new Vec3(),
  fsa_worldEdge1 = new Vec3(),
  fsa_Cross = new Vec3();
const maxminA: f32[] = [],
  maxminB: f32[] = [];

const cli_aabbmin = new Vec3(),
  cli_aabbmax = new Vec3();
const cfah_faceANormalWS = new Vec3(),
  cfah_edge0 = new Vec3(),
  cfah_WorldEdge0 = new Vec3(),
  cfah_worldPlaneAnormal1 = new Vec3(),
  cfah_planeNormalWS1 = new Vec3(),
  cfah_worldA1 = new Vec3(),
  cfah_localPlaneNormal = new Vec3(),
  cfah_planeNormalWS = new Vec3();

// const project_worldVertex = new Vec3();
const project_localAxis = new Vec3();
const project_localOrigin = new Vec3();

const ConvexPolyhedron_pointIsInside = new Vec3();
const ConvexPolyhedron_vToP = new Vec3();
const ConvexPolyhedron_vToPointInside = new Vec3();
// const computeLocalAABB_worldVert = new Vec3();
const tempWorldVertex = new Vec3();

export class Point {
  constructor(public point: Vec3, public normal: Vec3, public depth: f32) {}
}

export class ConvexPolyhedron extends Shape {
  vertices: Vec3[];
  worldVertices: Vec3[];
  worldVerticesNeedsUpdate: boolean;
  faces: i32[][];
  faceNormals: Vec3[];
  worldFaceNormalsNeedsUpdate: boolean;
  worldFaceNormals: Vec3[];
  uniqueEdges: Vec3[];
  uniqueAxes: Vec3[] | null;

  /**
   * A set of polygons describing a convex shape.
   * @class ConvexPolyhedron
   * @constructor
   * @extends Shape
   * @description The shape MUST be convex for the code to work properly. No polygons may be coplanar (contained
   * in the same 3D plane), instead these should be merged into one polygon.
   *
   * @param {array} points An array of Vec3's
   * @param {array} faces Array of integer arrays, describing which vertices that is included in each face.
   *
   * @author qiao / https://github.com/qiao (original author, see https://github.com/qiao/three.js/commit/85026f0c769e4000148a67d45a9e9b9c5108836f)
   * @author schteppe / https://github.com/schteppe
   * @see http://www.altdevblogaday.com/2011/05/13/contact-generation-between-3d-convex-meshes/
   * @see http://bullet.googlecode.com/svn/trunk/src/BulletCollision/NarrowPhaseCollision/btPolyhedralContactClipping.cpp
   *
   * @todo Move the clipping functions to ContactGenerator?
   * @todo Automatically merge coplanar polygons in constructor.
   */
  constructor(points: Vec3[] = [], faces: i32[][] = [], uniqueAxes: Vec3[] | null = null) {
    super(Shape.CONVEXPOLYHEDRON);

    /**
     * Array of Vec3
     * @property vertices
     * @type {Array}
     */
    this.vertices = points;

    this.worldVertices = []; // World transformed version of .vertices
    this.worldVerticesNeedsUpdate = true;

    /**
     * Array of integer arrays, indicating which vertices each face consists of
     * @property faces
     * @type {Array}
     */
    this.faces = faces || [];

    /**
     * Array of Vec3
     * @property faceNormals
     * @type {Array}
     */
    this.faceNormals = [];
    this.computeNormals();

    this.worldFaceNormalsNeedsUpdate = true;
    this.worldFaceNormals = []; // World transformed version of .faceNormals

    /**
     * Array of Vec3
     * @property uniqueEdges
     * @type {Array}
     */
    this.uniqueEdges = [];

    /**
     * If given, these locally defined, normalized axes are the only ones being checked when doing separating axis check.
     * @property {Array} uniqueAxes
     */
    this.uniqueAxes = uniqueAxes ? uniqueAxes.slice(0) : null;

    this.computeEdges();
    this.updateBoundingSphereRadius();
  }

  /**
   * Computes uniqueEdges
   * @method computeEdges
   */
  computeEdges(): void {
    const faces = this.faces;
    const vertices = this.vertices;
    // const nv = vertices.length;
    const edges = this.uniqueEdges;

    edges.length = 0;

    const edge = computeEdges_tmpEdge;

    for (let i: i32 = 0; i !== faces.length; i++) {
      const face = faces[i];
      const numVertices = face.length;
      for (let j = 0; j !== numVertices; j++) {
        const k = (j + 1) % numVertices;
        vertices[face[j]].vsub(vertices[face[k]], edge);
        edge.normalize();
        let found = false;
        for (let p: i32 = 0; p !== edges.length; p++) {
          if (edges[p].almostEquals(edge) || edges[p].almostEquals(edge)) {
            found = true;
            break;
          }
        }

        if (!found) {
          edges.push(edge.clone());
        }
      }
    }
  }

  /**
   * Compute the normals of the faces. Will reuse existing Vec3 objects in the .faceNormals array if they exist.
   * @method computeNormals
   */
  computeNormals(): void {
    this.faceNormals.length = this.faces.length;

    // Generate normals
    for (let i: i32 = 0; i < this.faces.length; i++) {
      // Check so all vertices exists for this face
      for (let j = 0; j < this.faces[i].length; j++) {
        if (!this.vertices[this.faces[i][j]]) {
          throw new Error("Vertex " + this.faces[i][j] + " not found!");
        }
      }

      const n = this.faceNormals[i] || new Vec3();
      this.getFaceNormal(i, n);
      n.negate(n);
      this.faceNormals[i] = n;
      const vertex = this.vertices[this.faces[i][0]];
      if (n.dot(vertex) < 0) {
        console.error(
          ".faceNormals[" +
            i +
            "] = Vec3(" +
            n.toString() +
            ") looks like it points into the shape? The vertices follow. Make sure they are ordered CCW around the normal, using the right hand rule."
        );
        for (let j = 0; j < this.faces[i].length; j++) {
          console.warn(
            ".vertices[" + this.faces[i][j] + "] = Vec3(" + this.vertices[this.faces[i][j]].toString() + ")"
          );
        }
      }
    }
  }

  /**
   * Get face normal given 3 vertices
   * @static
   * @method getFaceNormal
   * @param {Vec3} va
   * @param {Vec3} vb
   * @param {Vec3} vc
   * @param {Vec3} target
   */
  static computeNormal(va: Vec3, vb: Vec3, vc: Vec3, target: Vec3): void {
    vb.vsub(va, ab);
    vc.vsub(vb, cb);
    cb.cross(ab, target);
    if (!target.isZero()) {
      target.normalize();
    }
  }

  /**
   * Compute the normal of a face from its vertices
   * @method getFaceNormal
   * @param  {Number} i
   * @param  {Vec3} target
   */
  getFaceNormal(i: i32, target: Vec3) {
    const f = this.faces[i];
    const va = this.vertices[f[0]];
    const vb = this.vertices[f[1]];
    const vc = this.vertices[f[2]];
    return ConvexPolyhedron.computeNormal(va, vb, vc, target);
  }

  /**
   * @method clipAgainstHull
   * @param {Vec3} posA
   * @param {Quaternion} quatA
   * @param {ConvexPolyhedron} hullB
   * @param {Vec3} posB
   * @param {Quaternion} quatB
   * @param {Vec3} separatingNormal
   * @param {Number} minDist Clamp distance
   * @param {Number} maxDist
   * @param {array} result The an array of contact point objects, see clipFaceAgainstHull
   * @see http://bullet.googlecode.com/svn/trunk/src/BulletCollision/NarrowPhaseCollision/btPolyhedralContactClipping.cpp
   */

  clipAgainstHull(
    posA: Vec3,
    quatA: Quaternion,
    hullB: ConvexPolyhedron,
    posB: Vec3,
    quatB: Quaternion,
    separatingNormal: Vec3,
    minDist: f32,
    maxDist: f32,
    result: Point[]
  ): void {
    const WorldNormal = cah_WorldNormal;
    // const hullA = this;
    // const curMaxDist: f32 = maxDist;
    let closestFaceB: f32 = -1;
    let dmax: f32 = -f32.MAX_VALUE;
    for (let face = 0; face < hullB.faces.length; face++) {
      WorldNormal.copy(hullB.faceNormals[face]);
      quatB.vmult(WorldNormal, WorldNormal);
      //posB.vadd(WorldNormal,WorldNormal);
      const d = WorldNormal.dot(separatingNormal);
      if (d > dmax) {
        dmax = d;
        closestFaceB = face;
      }
    }
    const worldVertsB1 = [];
    const polyB = hullB.faces[closestFaceB];
    const numVertices = polyB.length;
    for (let e0: i32 = 0; e0 < numVertices; e0++) {
      const b = hullB.vertices[polyB[e0]];
      const worldb = new Vec3();
      worldb.copy(b);
      quatB.vmult(worldb, worldb);
      posB.vadd(worldb, worldb);
      worldVertsB1.push(worldb);
    }

    if (closestFaceB >= 0) {
      this.clipFaceAgainstHull(separatingNormal, posA, quatA, worldVertsB1, minDist, maxDist, result);
    }
  }

  /**
   * Find the separating axis between this hull and another
   * @method findSeparatingAxis
   * @param {ConvexPolyhedron} hullB
   * @param {Vec3} posA
   * @param {Quaternion} quatA
   * @param {Vec3} posB
   * @param {Quaternion} quatB
   * @param {Vec3} target The target vector to save the axis in
   * @return {bool} Returns false if a separation is found, else true
   */

  findSeparatingAxis(
    hullB: ConvexPolyhedron,
    posA: Vec3,
    quatA: Quaternion,
    posB: Vec3,
    quatB: Quaternion,
    target: Vec3,
    faceListA: i32[] | null = null,
    faceListB: i32[] | null = null
  ): boolean {
    const faceANormalWS3 = fsa_faceANormalWS3,
      Worldnormal1 = fsa_Worldnormal1,
      deltaC = fsa_deltaC,
      worldEdge0 = fsa_worldEdge0,
      worldEdge1 = fsa_worldEdge1,
      Cross = fsa_Cross;

    let dmin: f32 = f32.MAX_VALUE;
    const hullA = this;
    let curPlaneTests: i32 = 0;

    if (!hullA.uniqueAxes) {
      const numFacesA = faceListA ? faceListA.length : hullA.faces.length;

      // Test face normals from hullA
      for (let i: i32 = 0; i < numFacesA; i++) {
        const fi = faceListA ? faceListA[i] : i;

        // Get world face normal
        faceANormalWS3.copy(hullA.faceNormals[fi]);
        quatA.vmult(faceANormalWS3, faceANormalWS3);

        const d = hullA.testSepAxis(faceANormalWS3, hullB, posA, quatA, posB, quatB);
        if (d === false) {
          return false;
        }

        if (d < dmin) {
          dmin = d;
          target.copy(faceANormalWS3);
        }
      }
    } else {
      // Test unique axes
      for (let i = 0; i !== hullA.uniqueAxes.length; i++) {
        // Get world axis
        quatA.vmult(hullA.uniqueAxes[i], faceANormalWS3);

        const d = hullA.testSepAxis(faceANormalWS3, hullB, posA, quatA, posB, quatB);
        if (d === false) {
          return false;
        }

        if (d < dmin) {
          dmin = d;
          target.copy(faceANormalWS3);
        }
      }
    }

    if (!hullB.uniqueAxes) {
      // Test face normals from hullB
      const numFacesB = faceListB ? faceListB.length : hullB.faces.length;
      for (let i: i32 = 0; i < numFacesB; i++) {
        const fi = faceListB ? faceListB[i] : i;

        Worldnormal1.copy(hullB.faceNormals[fi]);
        quatB.vmult(Worldnormal1, Worldnormal1);
        curPlaneTests++;
        const d = hullA.testSepAxis(Worldnormal1, hullB, posA, quatA, posB, quatB);
        if (d === false) {
          return false;
        }

        if (d < dmin) {
          dmin = d;
          target.copy(Worldnormal1);
        }
      }
    } else {
      // Test unique axes in B
      for (let i = 0; i !== hullB.uniqueAxes.length; i++) {
        quatB.vmult(hullB.uniqueAxes[i], Worldnormal1);

        curPlaneTests++;
        const d = hullA.testSepAxis(Worldnormal1, hullB, posA, quatA, posB, quatB);
        if (d === false) {
          return false;
        }

        if (d < dmin) {
          dmin = d;
          target.copy(Worldnormal1);
        }
      }
    }

    // Test edges
    for (let e0: i32 = 0; e0 !== hullA.uniqueEdges.length; e0++) {
      // Get world edge
      quatA.vmult(hullA.uniqueEdges[e0], worldEdge0);

      for (let e1 = 0; e1 !== hullB.uniqueEdges.length; e1++) {
        // Get world edge 2
        quatB.vmult(hullB.uniqueEdges[e1], worldEdge1);
        worldEdge0.cross(worldEdge1, Cross);

        if (!Cross.almostZero()) {
          Cross.normalize();
          const dist = hullA.testSepAxis(Cross, hullB, posA, quatA, posB, quatB);
          if (dist === false) {
            return false;
          }
          if (dist < dmin) {
            dmin = dist;
            target.copy(Cross);
          }
        }
      }
    }

    posB.vsub(posA, deltaC);
    if (deltaC.dot(target) > 0.0) {
      target.negate(target);
    }

    return true;
  }

  /**
   * Test separating axis against two hulls. Both hulls are projected onto the axis and the overlap size is returned if there is one.
   * @method testSepAxis
   * @param {Vec3} axis
   * @param {ConvexPolyhedron} hullB
   * @param {Vec3} posA
   * @param {Quaternion} quatA
   * @param {Vec3} posB
   * @param {Quaternion} quatB
   * @return {number} The overlap depth, or FALSE if no penetration.
   */
  testSepAxis(
    axis: Vec3,
    hullB: ConvexPolyhedron,
    posA: Vec3,
    quatA: Quaternion,
    posB: Vec3,
    quatB: Quaternion
  ): f32 | false {
    const hullA = this;
    ConvexPolyhedron.project(hullA, axis, posA, quatA, maxminA);
    ConvexPolyhedron.project(hullB, axis, posB, quatB, maxminB);
    const maxA = maxminA[0];
    const minA = maxminA[1];
    const maxB = maxminB[0];
    const minB = maxminB[1];
    if (maxA < minB || maxB < minA) {
      return false; // Separated
    }
    const d0 = maxA - minB;
    const d1 = maxB - minA;
    const depth = d0 < d1 ? d0 : d1;
    return depth;
  }

  /**
   * @method calculateLocalInertia
   * @param  {Number} mass
   * @param  {Vec3} target
   */
  calculateLocalInertia(mass: f32, target: Vec3): void {
    // Approximate with box inertia
    // Exact inertia calculation is overkill, but see http://geometrictools.com/Documentation/PolyhedralMassProperties.pdf for the correct way to do it
    this.computeLocalAABB(cli_aabbmin, cli_aabbmax);
    const x = cli_aabbmax.x - cli_aabbmin.x,
      y = cli_aabbmax.y - cli_aabbmin.y,
      z = cli_aabbmax.z - cli_aabbmin.z;
    target.x = (1.0 / 12.0) * mass * (2 * y * 2 * y + 2 * z * 2 * z);
    target.y = (1.0 / 12.0) * mass * (2 * x * 2 * x + 2 * z * 2 * z);
    target.z = (1.0 / 12.0) * mass * (2 * y * 2 * y + 2 * x * 2 * x);
  }

  /**
   * @method getPlaneConstantOfFace
   * @param  {Number} face_i Index of the face
   * @return {Number}
   */
  getPlaneConstantOfFace(face_i: i32): f32 {
    const f = this.faces[face_i];
    const n = this.faceNormals[face_i];
    const v = this.vertices[f[0]];
    const c = -n.dot(v);
    return c;
  }

  /**
   * Clip a face against a hull.
   * @method clipFaceAgainstHull
   * @param {Vec3} separatingNormal
   * @param {Vec3} posA
   * @param {Quaternion} quatA
   * @param {Array} worldVertsB1 An array of Vec3 with vertices in the world frame.
   * @param {Number} minDist Distance clamping
   * @param {Number} maxDist
   * @param Array result Array to store resulting contact points in. Will be objects with properties: point, depth, normal. These are represented in world coordinates.
   */

  clipFaceAgainstHull(
    separatingNormal: Vec3,
    posA: Vec3,
    quatA: Quaternion,
    worldVertsB1: Vec3[],
    minDist: f32,
    maxDist: f32,
    result: Point[]
  ) {
    const faceANormalWS = cfah_faceANormalWS,
      edge0 = cfah_edge0,
      WorldEdge0 = cfah_WorldEdge0,
      worldPlaneAnormal1 = cfah_worldPlaneAnormal1,
      planeNormalWS1 = cfah_planeNormalWS1,
      worldA1 = cfah_worldA1,
      localPlaneNormal = cfah_localPlaneNormal,
      planeNormalWS = cfah_planeNormalWS;

    const hullA = this;
    const worldVertsB2: Vec3[] = [];
    const pVtxIn = worldVertsB1;
    const pVtxOut = worldVertsB2;
    // Find the face with normal closest to the separating axis
    let closestFaceA: i32 = -1;
    let dmin = f32.MAX_VALUE;
    for (let face: i32 = 0; face < hullA.faces.length; face++) {
      faceANormalWS.copy(hullA.faceNormals[face]);
      quatA.vmult(faceANormalWS, faceANormalWS);
      //posA.vadd(faceANormalWS,faceANormalWS);
      const d = faceANormalWS.dot(separatingNormal);
      if (d < dmin) {
        dmin = d;
        closestFaceA = face;
      }
    }
    if (closestFaceA < 0) {
      // console.log("--- did not find any closest face... ---");
      return;
    }
    //console.log("closest A: ",closestFaceA);
    // Get the face and construct connected faces
    const polyA = hullA.faces[closestFaceA];
    // polyA.connectedFaces = [];
    const connectedFaces: i32[] = [];
    for (let i: i32 = 0; i < hullA.faces.length; i++) {
      for (let j = 0; j < hullA.faces[i].length; j++) {
        if (
          polyA.indexOf(hullA.faces[i][j]) !== -1 /* Sharing a vertex*/ &&
          i !== closestFaceA /* Not the one we are looking for connections from */ &&
          connectedFaces.indexOf(i) === -1 /* Not already added */
        ) {
          connectedFaces.push(i);
        }
      }
    }
    // Clip the polygon to the back of the planes of all faces of hull A, that are adjacent to the witness face
    // const numContacts = pVtxIn.length;
    const numVerticesA = polyA.length;
    // const res = [];
    for (let e0 = 0; e0 < numVerticesA; e0++) {
      const a = hullA.vertices[polyA[e0]];
      const b = hullA.vertices[polyA[(e0 + 1) % numVerticesA]];
      a.vsub(b, edge0);
      WorldEdge0.copy(edge0);
      quatA.vmult(WorldEdge0, WorldEdge0);
      posA.vadd(WorldEdge0, WorldEdge0);
      worldPlaneAnormal1.copy(this.faceNormals[closestFaceA]); //transA.getBasis()* btVector3(polyA.m_plane[0],polyA.m_plane[1],polyA.m_plane[2]);
      quatA.vmult(worldPlaneAnormal1, worldPlaneAnormal1);
      posA.vadd(worldPlaneAnormal1, worldPlaneAnormal1);
      WorldEdge0.cross(worldPlaneAnormal1, planeNormalWS1);
      planeNormalWS1.negate(planeNormalWS1);
      worldA1.copy(a);
      quatA.vmult(worldA1, worldA1);
      posA.vadd(worldA1, worldA1);
      const planeEqWS1 = -worldA1.dot(planeNormalWS1);
      let planeEqWS: f32;
      if (true) {
        const otherFace = connectedFaces[e0];
        localPlaneNormal.copy(this.faceNormals[otherFace]);
        const localPlaneEq = this.getPlaneConstantOfFace(otherFace);

        planeNormalWS.copy(localPlaneNormal);
        quatA.vmult(planeNormalWS, planeNormalWS);
        //posA.vadd(planeNormalWS,planeNormalWS);
        planeEqWS = localPlaneEq - planeNormalWS.dot(posA);
      } else {
        planeNormalWS.copy(planeNormalWS1);
        planeEqWS = planeEqWS1;
      }

      // Clip face against our constructed plane
      this.clipFaceAgainstPlane(pVtxIn, pVtxOut, planeNormalWS, planeEqWS);

      // Throw away all clipped points, but save the reamining until next clip
      while (pVtxIn.length) {
        pVtxIn.shift();
      }
      while (pVtxOut.length) {
        pVtxIn.push(pVtxOut.shift()!);
      }
    }

    //console.log("Resulting points after clip:",pVtxIn);

    // only keep contact points that are behind the witness face
    localPlaneNormal.copy(this.faceNormals[closestFaceA]);

    const localPlaneEq = this.getPlaneConstantOfFace(closestFaceA);
    planeNormalWS.copy(localPlaneNormal);
    quatA.vmult(planeNormalWS, planeNormalWS);

    const planeEqWS = localPlaneEq - planeNormalWS.dot(posA);
    for (let i: i32 = 0; i < pVtxIn.length; i++) {
      let depth: f32 = planeNormalWS.dot(pVtxIn[i]) + planeEqWS; //???
      /*console.log("depth calc from normal=",planeNormalWS.toString()," and constant "+planeEqWS+" and vertex ",pVtxIn[i].toString()," gives "+depth);*/
      if (depth <= minDist) {
        console.log("clamped: depth=" + depth + " to minDist=" + (minDist + ""));
        depth = minDist;
      }

      if (depth <= maxDist) {
        const point = pVtxIn[i];
        if (depth <= 0) {
          /*console.log("Got contact point ",point.toString(),
                  ", depth=",depth,
                  "contact normal=",separatingNormal.toString(),
                  "plane",planeNormalWS.toString(),
                  "planeConstant",planeEqWS);*/
          const p = new Point(point, planeNormalWS, depth);
          result.push(p);
        }
      }
    }
  }

  /**
   * Clip a face in a hull against the back of a plane.
   * @method clipFaceAgainstPlane
   * @param {Array} inVertices
   * @param {Array} outVertices
   * @param {Vec3} planeNormal
   * @param {Number} planeConstant The constant in the mathematical plane equation
   */
  clipFaceAgainstPlane(inVertices: Vec3[], outVertices: Vec3[], planeNormal: Vec3, planeConstant: f32): Vec3[] {
    let n_dot_first: f32, n_dot_last: f32;
    const numVerts = inVertices.length;

    if (numVerts < 2) {
      return outVertices;
    }

    let firstVertex = inVertices[inVertices.length - 1],
      lastVertex = inVertices[0];

    n_dot_first = planeNormal.dot(firstVertex) + planeConstant;

    for (let vi = 0; vi < numVerts; vi++) {
      lastVertex = inVertices[vi];
      n_dot_last = planeNormal.dot(lastVertex) + planeConstant;
      if (n_dot_first < 0) {
        if (n_dot_last < 0) {
          // Start < 0, end < 0, so output lastVertex
          const newv = new Vec3();
          newv.copy(lastVertex);
          outVertices.push(newv);
        } else {
          // Start < 0, end >= 0, so output intersection
          const newv = new Vec3();
          firstVertex.lerp(lastVertex, n_dot_first / (n_dot_first - n_dot_last), newv);
          outVertices.push(newv);
        }
      } else {
        if (n_dot_last < 0) {
          // Start >= 0, end < 0 so output intersection and end
          const newv = new Vec3();
          firstVertex.lerp(lastVertex, n_dot_first / (n_dot_first - n_dot_last), newv);
          outVertices.push(newv);
          outVertices.push(lastVertex);
        }
      }
      firstVertex = lastVertex;
      n_dot_first = n_dot_last;
    }
    return outVertices;
  }

  // Updates .worldVertices and sets .worldVerticesNeedsUpdate to false.
  computeWorldVertices(position: Vec3, quat: Quaternion): void {
    const N = this.vertices.length;
    while (this.worldVertices.length < N) {
      this.worldVertices.push(new Vec3());
    }

    const verts = this.vertices,
      worldVerts = this.worldVertices;
    for (let i: i32 = 0; i !== N; i++) {
      quat.vmult(verts[i], worldVerts[i]);
      position.vadd(worldVerts[i], worldVerts[i]);
    }

    this.worldVerticesNeedsUpdate = false;
  }

  computeLocalAABB(aabbmin: Vec3, aabbmax: Vec3): void {
    const n = this.vertices.length,
      vertices = this.vertices;
    // worldVert = computeLocalAABB_worldVert;

    aabbmin.set(f32.MAX_VALUE, f32.MAX_VALUE, f32.MAX_VALUE);
    aabbmax.set(-f32.MAX_VALUE, -f32.MAX_VALUE, -f32.MAX_VALUE);

    for (let i: i32 = 0; i < n; i++) {
      const v = vertices[i];
      if (v.x < aabbmin.x) {
        aabbmin.x = v.x;
      } else if (v.x > aabbmax.x) {
        aabbmax.x = v.x;
      }
      if (v.y < aabbmin.y) {
        aabbmin.y = v.y;
      } else if (v.y > aabbmax.y) {
        aabbmax.y = v.y;
      }
      if (v.z < aabbmin.z) {
        aabbmin.z = v.z;
      } else if (v.z > aabbmax.z) {
        aabbmax.z = v.z;
      }
    }
  }

  /**
   * Updates .worldVertices and sets .worldVerticesNeedsUpdate to false.
   * @method computeWorldFaceNormals
   * @param  {Quaternion} quat
   */
  computeWorldFaceNormals(quat: Quaternion): void {
    const N = this.faceNormals.length;
    while (this.worldFaceNormals.length < N) {
      this.worldFaceNormals.push(new Vec3());
    }

    const normals = this.faceNormals,
      worldNormals = this.worldFaceNormals;
    for (let i: i32 = 0; i !== N; i++) {
      quat.vmult(normals[i], worldNormals[i]);
    }

    this.worldFaceNormalsNeedsUpdate = false;
  }

  /**
   * @method updateBoundingSphereRadius
   */
  updateBoundingSphereRadius() {
    // Assume points are distributed with local (0,0,0) as center
    let max2: f32 = 0;
    const verts = this.vertices;
    for (let i: i32 = 0, N = verts.length; i !== N; i++) {
      const norm2 = verts[i].norm2();
      if (norm2 > max2) {
        max2 = norm2;
      }
    }
    this.boundingSphereRadius = Math.sqrt(max2);
  }

  /**
   * @method calculateWorldAABB
   * @param {Vec3}        pos
   * @param {Quaternion}  quat
   * @param {Vec3}        min
   * @param {Vec3}        max
   */
  calculateWorldAABB(pos: Vec3, quat: Quaternion, min: Vec3, max: Vec3): void {
    const n = this.vertices.length,
      verts = this.vertices;
    let minx: f32 = f32.MAX_VALUE,
      miny: f32 = f32.MAX_VALUE,
      minz: f32 = f32.MAX_VALUE,
      maxx: f32 = f32.MIN_VALUE,
      maxy: f32 = f32.MIN_VALUE,
      maxz: f32 = f32.MIN_VALUE;

    for (let i: i32 = 0; i < n; i++) {
      tempWorldVertex.copy(verts[i]);
      quat.vmult(tempWorldVertex, tempWorldVertex);
      pos.vadd(tempWorldVertex, tempWorldVertex);
      const v = tempWorldVertex;
      if (v.x < minx || minx === undefined) {
        minx = v.x;
      } else if (v.x > maxx || maxx === undefined) {
        maxx = v.x;
      }

      if (v.y < miny || miny === undefined) {
        miny = v.y;
      } else if (v.y > maxy || maxy === undefined) {
        maxy = v.y;
      }

      if (v.z < minz || minz === undefined) {
        minz = v.z;
      } else if (v.z > maxz || maxz === undefined) {
        maxz = v.z;
      }
    }
    min.set(minx, miny, minz);
    max.set(maxx, maxy, maxz);
  }

  /**
   * Get approximate convex volume
   * @method volume
   * @return {Number}
   */
  volume(): f32 {
    return (4.0 * Math.PI * this.boundingSphereRadius) / 3.0;
  }

  /**
   * Get an average of all the vertices positions
   * @method getAveragePointLocal
   * @param  {Vec3} target
   * @return {Vec3}
   */
  getAveragePointLocal(target: Vec3): Vec3 {
    target = target || new Vec3();
    const n = this.vertices.length,
      verts = this.vertices;
    for (let i: i32 = 0; i < n; i++) {
      target.vadd(verts[i], target);
    }
    target.mult(1 / n, target);
    return target;
  }

  /**
   * Transform all local points. Will change the .vertices
   * @method transformAllPoints
   * @param  {Vec3} offset
   * @param  {Quaternion} quat
   */
  transformAllPoints(offset: Vec3, quat: Quaternion): void {
    const n = this.vertices.length,
      verts = this.vertices;

    // Apply rotation
    if (quat) {
      // Rotate vertices
      for (let i: i32 = 0; i < n; i++) {
        const v = verts[i];
        quat.vmult(v, v);
      }
      // Rotate face normals
      for (let i: i32 = 0; i < this.faceNormals.length; i++) {
        const v = this.faceNormals[i];
        quat.vmult(v, v);
      }
      /*
        // Rotate edges
        for(let i:i32=0; i<this.uniqueEdges.length; i++){
            const v = this.uniqueEdges[i];
            quat.vmult(v,v);
        }*/
    }

    // Apply offset
    if (offset) {
      for (let i: i32 = 0; i < n; i++) {
        const v = verts[i];
        v.vadd(offset, v);
      }
    }
  }

  /**
   * Checks whether p is inside the polyhedra. Must be in local coords. The point lies outside of the convex hull of the other points if and only if the direction of all the vectors from it to those other points are on less than one half of a sphere around it.
   * @method pointIsInside
   * @param  {Vec3} p      A point given in local coordinates
   * @return {Boolean}
   */
  pointIsInside(p: Vec3): i32 | boolean {
    // const n = this.vertices.length,
    const verts = this.vertices,
      faces = this.faces,
      normals = this.faceNormals;
    const positiveResult = null;
    const N = this.faces.length;
    const pointInside = ConvexPolyhedron_pointIsInside;
    this.getAveragePointLocal(pointInside);
    for (let i: i32 = 0; i < N; i++) {
      // const numVertices = this.faces[i].length;
      const n = normals[i];
      const v = verts[faces[i][0]]; // We only need one point in the face

      // This dot product determines which side of the edge the point is
      const vToP = ConvexPolyhedron_vToP;
      p.vsub(v, vToP);
      const r1 = n.dot(vToP);

      const vToPointInside = ConvexPolyhedron_vToPointInside;
      pointInside.vsub(v, vToPointInside);
      const r2 = n.dot(vToPointInside);

      if ((r1 < 0 && r2 > 0) || (r1 > 0 && r2 < 0)) {
        return false; // Encountered some other sign. Exit.
      } else {
      }
    }

    // If we got here, all dot products were of the same sign.
    return positiveResult ? 1 : -1;
  }

  /**
   * Get max and min dot product of a convex hull at position (pos,quat) projected onto an axis. Results are saved in the array maxmin.
   * @static
   * @method project
   * @param {ConvexPolyhedron} hull
   * @param {Vec3} axis
   * @param {Vec3} pos
   * @param {Quaternion} quat
   * @param {array} result result[0] and result[1] will be set to maximum and minimum, respectively.
   */
  static project(hull: ConvexPolyhedron, axis: Vec3, pos: Vec3, quat: Quaternion, result: f32[]) {
    const n = hull.vertices.length,
      // worldVertex = project_worldVertex,
      localAxis = project_localAxis;
    let max: f32 = 0,
      min: f32 = 0,
      localOrigin = project_localOrigin,
      vs = hull.vertices;

    localOrigin.setZero();

    // Transform the axis to local
    Transform.vectorToLocalFrame(pos, quat, axis, localAxis);
    Transform.pointToLocalFrame(pos, quat, localOrigin, localOrigin);
    const add = localOrigin.dot(localAxis);

    min = max = vs[0].dot(localAxis);

    for (let i = 1; i < n; i++) {
      const val = vs[i].dot(localAxis);

      if (val > max) {
        max = val;
      }

      if (val < min) {
        min = val;
      }
    }

    min -= add;
    max -= add;

    if (min > max) {
      // Inconsistent - swap
      const temp = min;
      min = max;
      max = temp;
    }
    // Output
    result[0] = max;
    result[1] = min;
  }
}
