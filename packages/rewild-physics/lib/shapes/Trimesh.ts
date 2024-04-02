import { Shape } from '../shapes/Shape';
import { Vec3 } from '../math/Vec3';
import { Transform } from '../math/Transform';
import { AABB } from '../collision/AABB';
import { Octree } from '../utils/Octree';
import { Quaternion } from '../math/Quaternion';

/**
 * Trimesh.
 * @example
 *     // How to make a mesh with a single triangle
 *     const vertices = [
 *         0, 0, 0, // vertex 0
 *         1, 0, 0, // vertex 1
 *         0, 1, 0  // vertex 2
 *     ]
 *     const indices = [
 *         0, 1, 2  // triangle 0
 *     ]
 *     const trimeshShape = new CANNON.Trimesh(vertices, indices)
 */
export class Trimesh extends Shape {
  /**
   * vertices
   */
  vertices: Float32Array;

  /**
   * Array of integers, indicating which vertices each triangle consists of. The length of this array is thus 3 times the number of triangles.
   */
  indices: Int16Array;

  /**
   * The normals data.
   */
  normals: Float32Array;
  /**
   * The local AABB of the mesh.
   */
  aabb: AABB;

  /**
   * References to vertex pairs, making up all unique edges in the trimesh.
   */
  edges: Int16Array | null;

  /**
   * Local scaling of the mesh. Use .setScale() to set it.
   */
  scale: Vec3;

  /**
   * The indexed triangles. Use .updateTree() to update it.
   */
  tree: Octree;

  constructor(vertices: i32[], indices: i16[]) {
    super(Shape.TRIMESH);

    this.vertices = new Float32Array(vertices);
    this.indices = new Int16Array(indices);
    this.normals = new Float32Array(indices.length);
    this.aabb = new AABB();
    this.edges = null;
    this.scale = new Vec3(1, 1, 1);
    this.tree = new Octree();

    this.updateEdges();
    this.updateNormals();
    this.updateAABB();
    this.updateBoundingSphereRadius();
    this.updateTree();
  }

  /**
   * updateTree
   */
  updateTree(): void {
    const tree = this.tree;

    tree.reset();
    tree.aabb.copy(this.aabb);
    const scale = this.scale; // The local mesh AABB is scaled, but the octree AABB should be unscaled
    tree.aabb.lowerBound.x *= 1 / scale.x;
    tree.aabb.lowerBound.y *= 1 / scale.y;
    tree.aabb.lowerBound.z *= 1 / scale.z;
    tree.aabb.upperBound.x *= 1 / scale.x;
    tree.aabb.upperBound.y *= 1 / scale.y;
    tree.aabb.upperBound.z *= 1 / scale.z;

    // Insert all triangles
    const triangleAABB = new AABB();
    const a = new Vec3();
    const b = new Vec3();
    const c = new Vec3();
    const points = [a, b, c];
    for (let i: i32 = 0; i < this.indices.length / 3; i++) {
      //this.getTriangleVertices(i, a, b, c);

      // Get unscaled triangle verts
      const i3 = i * 3;
      this._getUnscaledVertex(this.indices[i3], a);
      this._getUnscaledVertex(this.indices[i3 + 1], b);
      this._getUnscaledVertex(this.indices[i3 + 2], c);

      triangleAABB.setFromPoints(points);
      tree.insert(triangleAABB, i);
    }
    tree.removeEmptyNodes();
  }

  /**
   * Get triangles in a local AABB from the trimesh.
   * @param result An array of integers, referencing the queried triangles.
   */
  getTrianglesInAABB(aabb: AABB, result: i32[]): i32[] {
    unscaledAABB.copy(aabb);

    // Scale it to local
    const scale = this.scale;
    const isx = scale.x;
    const isy = scale.y;
    const isz = scale.z;
    const l = unscaledAABB.lowerBound;
    const u = unscaledAABB.upperBound;
    l.x /= isx;
    l.y /= isy;
    l.z /= isz;
    u.x /= isx;
    u.y /= isy;
    u.z /= isz;

    return this.tree.aabbQuery(unscaledAABB, result);
  }

  /**
   * setScale
   */
  setScale(scale: Vec3): void {
    const wasUniform: boolean =
      this.scale.x == this.scale.y && this.scale.y == this.scale.z;
    const isUniform = scale.x == scale.y && scale.y == scale.z;

    if (!(wasUniform && isUniform)) {
      // Non-uniform scaling. Need to update normals.
      this.updateNormals();
    }
    this.scale.copy(scale);
    this.updateAABB();
    this.updateBoundingSphereRadius();
  }

  /**
   * Compute the normals of the faces. Will save in the `.normals` array.
   */
  updateNormals(): void {
    const n = computeNormals_n;

    // Generate normals
    const normals = this.normals;
    for (let i: i32 = 0; i < this.indices.length / 3; i++) {
      const i3 = i * 3;

      const a = this.indices[i3];
      const b = this.indices[i3 + 1];
      const c = this.indices[i3 + 2];

      this.getVertex(a, va);
      this.getVertex(b, vb);
      this.getVertex(c, vc);

      Trimesh.computeNormal(vb, va, vc, n);

      normals[i3] = n.x;
      normals[i3 + 1] = n.y;
      normals[i3 + 2] = n.z;
    }
  }

  private static add(a: i32, b: i32, edges: Map<string, boolean>): void {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    edges.set(key, true);
  }
  /**
   * Update the `.edges` property
   */
  updateEdges(): void {
    const edges: Map<string, boolean> = new Map();

    for (let i: i32 = 0; i < this.indices.length / 3; i++) {
      const i3 = i * 3;
      const a = this.indices[i3];
      const b = this.indices[i3 + 1];
      const c = this.indices[i3 + 2];
      Trimesh.add(a, b, edges);
      Trimesh.add(b, c, edges);
      Trimesh.add(c, a, edges);
    }
    const keys = Array.from(edges.keys());
    this.edges = new Int16Array(keys.length * 2);
    for (let i: i32 = 0; i < keys.length; i++) {
      const indices = keys[i].split('_');
      this.edges[2 * i] = parseInt(indices[0], 10);
      this.edges[2 * i + 1] = parseInt(indices[1], 10);
    }
  }

  /**
   * Get an edge vertex
   * @param firstOrSecond 0 or 1, depending on which one of the vertices you need.
   * @param vertexStore Where to store the result
   */
  getEdgeVertex(edgeIndex: i32, firstOrSecond: i32, vertexStore: Vec3): void {
    const vertexIndex = this.edges![edgeIndex * 2 + (firstOrSecond ? 1 : 0)];
    this.getVertex(vertexIndex, vertexStore);
  }

  /**
   * Get a vector along an edge.
   */
  getEdgeVector(edgeIndex: i32, vectorStore: Vec3): void {
    const va = getEdgeVector_va;
    const vb = getEdgeVector_vb;
    this.getEdgeVertex(edgeIndex, 0, va);
    this.getEdgeVertex(edgeIndex, 1, vb);
    vb.vsub(va, vectorStore);
  }

  /**
   * Get face normal given 3 vertices
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
   * Get vertex i.
   * @return The "out" vector object
   */
  getVertex(i: i32, out: Vec3): Vec3 {
    const scale = this.scale;
    this._getUnscaledVertex(i, out);
    out.x *= scale.x;
    out.y *= scale.y;
    out.z *= scale.z;
    return out;
  }

  /**
   * Get raw vertex i
   * @return The "out" vector object
   */
  private _getUnscaledVertex(i: i32, out: Vec3): Vec3 {
    const i3 = i * 3;
    const vertices = this.vertices;
    return out.set(vertices[i3], vertices[i3 + 1], vertices[i3 + 2]);
  }

  /**
   * Get a vertex from the trimesh,transformed by the given position and quaternion.
   * @return The "out" vector object
   */
  getWorldVertex(i: i32, pos: Vec3, quat: Quaternion, out: Vec3): Vec3 {
    this.getVertex(i, out);
    Transform.pointToWorldFrame(pos, quat, out, out);
    return out;
  }

  /**
   * Get the three vertices for triangle i.
   */
  getTriangleVertices(i: i32, a: Vec3, b: Vec3, c: Vec3): void {
    const i3 = i * 3;
    this.getVertex(this.indices[i3], a);
    this.getVertex(this.indices[i3 + 1], b);
    this.getVertex(this.indices[i3 + 2], c);
  }

  /**
   * Compute the normal of triangle i.
   * @return The "target" vector object
   */
  getNormal(i: i32, target: Vec3): Vec3 {
    const i3 = i * 3;
    return target.set(
      this.normals[i3],
      this.normals[i3 + 1],
      this.normals[i3 + 2]
    );
  }

  /**
   * @return The "target" vector object
   */
  calculateLocalInertia(mass: f32, target: Vec3): Vec3 {
    // Approximate with box inertia
    // Exact inertia calculation is overkill, but see http://geometrictools.com/Documentation/PolyhedralMassProperties.pdf for the correct way to do it
    this.computeLocalAABB(cli_aabb);
    const x = cli_aabb.upperBound.x - cli_aabb.lowerBound.x;
    const y = cli_aabb.upperBound.y - cli_aabb.lowerBound.y;
    const z = cli_aabb.upperBound.z - cli_aabb.lowerBound.z;
    return target.set(
      (1.0 / 12.0) * mass * (2 * y * 2 * y + 2 * z * 2 * z),
      (1.0 / 12.0) * mass * (2 * x * 2 * x + 2 * z * 2 * z),
      (1.0 / 12.0) * mass * (2 * y * 2 * y + 2 * x * 2 * x)
    );
  }

  /**
   * Compute the local AABB for the trimesh
   */
  computeLocalAABB(aabb: AABB): void {
    const l = aabb.lowerBound;
    const u = aabb.upperBound;
    const n = this.vertices.length;
    // const vertices = this.vertices;
    const v = computeLocalAABB_worldVert;

    this.getVertex(0, v);
    l.copy(v);
    u.copy(v);

    for (let i: i32 = 0; i !== n; i++) {
      this.getVertex(i, v);

      if (v.x < l.x) {
        l.x = v.x;
      } else if (v.x > u.x) {
        u.x = v.x;
      }

      if (v.y < l.y) {
        l.y = v.y;
      } else if (v.y > u.y) {
        u.y = v.y;
      }

      if (v.z < l.z) {
        l.z = v.z;
      } else if (v.z > u.z) {
        u.z = v.z;
      }
    }
  }

  /**
   * Update the `.aabb` property
   */
  updateAABB(): void {
    this.computeLocalAABB(this.aabb);
  }

  /**
   * Will update the `.boundingSphereRadius` property
   */
  updateBoundingSphereRadius(): void {
    // Assume points are distributed with local (0,0,0) as center
    let max2: f32 = 0;
    const vertices = this.vertices;
    const v = new Vec3();
    for (let i: i32 = 0, N = vertices.length / 3; i !== N; i++) {
      this.getVertex(i, v);
      const norm2 = v.lengthSquared();
      if (norm2 > max2) {
        max2 = norm2;
      }
    }
    this.boundingSphereRadius = Mathf.sqrt(max2);
  }

  /**
   * calculateWorldAABB
   */
  calculateWorldAABB(pos: Vec3, quat: Quaternion, min: Vec3, max: Vec3): void {
    /*
        const n = this.vertices.length / 3,
            verts = this.vertices;
        const minx,miny,minz,maxx,maxy,maxz;

        const v = tempWorldVertex;
        for(let i=0; i<n; i++){
            this.getVertex(i, v);
            quat.vmult(v, v);
            pos.vadd(v, v);
            if (v.x < minx || minx===undefined){
                minx = v.x;
            } else if(v.x > maxx || maxx===undefined){
                maxx = v.x;
            }

            if (v.y < miny || miny===undefined){
                miny = v.y;
            } else if(v.y > maxy || maxy===undefined){
                maxy = v.y;
            }

            if (v.z < minz || minz===undefined){
                minz = v.z;
            } else if(v.z > maxz || maxz===undefined){
                maxz = v.z;
            }
        }
        min.set(minx,miny,minz);
        max.set(maxx,maxy,maxz);
        */

    // Faster approximation using local AABB
    const frame = calculateWorldAABB_frame;
    const result = calculateWorldAABB_aabb;
    frame.position = pos;
    frame.quaternion = quat;
    this.aabb.toWorldFrame(frame, result);
    min.copy(result.lowerBound);
    max.copy(result.upperBound);
  }

  /**
   * Get approximate volume
   */
  volume(): f32 {
    return (4.0 * Mathf.PI * this.boundingSphereRadius) / 3.0;
  }

  /**
   * Create a Trimesh instance, shaped as a torus.
   */
  static createTorus(
    radius: f32 = 1,
    tube: f32 = 0.5,
    radialSegments: i32 = 8,
    tubularSegments: i32 = 6,
    arc: f32 = Mathf.PI * 2
  ): Trimesh {
    const vertices = [];
    const indices = [];

    for (let j: i32 = 0; j <= radialSegments; j++) {
      for (let i: i32 = 0; i <= tubularSegments; i++) {
        const u = (i / tubularSegments) * arc;
        const v = (j / radialSegments) * Mathf.PI * 2;

        const x = (radius + tube * Mathf.cos(v)) * Mathf.cos(u);
        const y = (radius + tube * Mathf.cos(v)) * Mathf.sin(u);
        const z = tube * Mathf.sin(v);

        vertices.push(x);
        vertices.push(y);
        vertices.push(z);
      }
    }

    for (let j: i32 = 1; j <= radialSegments; j++) {
      for (let i: i32 = 1; i <= tubularSegments; i++) {
        const a = (tubularSegments + 1) * j + i - 1;
        const b = (tubularSegments + 1) * (j - 1) + i - 1;
        const c = (tubularSegments + 1) * (j - 1) + i;
        const d = (tubularSegments + 1) * j + i;

        indices.push(a);
        indices.push(b);
        indices.push(d);

        indices.push(b);
        indices.push(c);
        indices.push(d);
      }
    }

    return new Trimesh(vertices, indices);
  }
}

const computeNormals_n = new Vec3();

const unscaledAABB = new AABB();

const getEdgeVector_va = new Vec3();
const getEdgeVector_vb = new Vec3();

const cb = new Vec3();
const ab = new Vec3();

const va = new Vec3();
const vb = new Vec3();
const vc = new Vec3();

const cli_aabb = new AABB();

const computeLocalAABB_worldVert = new Vec3();

const calculateWorldAABB_frame = new Transform();
const calculateWorldAABB_aabb = new AABB();
