import { Body, BodyOptions, ConvexPolyhedron, Vec3 } from 'rewild-physics';
import { TransformNode } from '../../core/TransformNode';
import { groundMaterial } from '../physics/Materials';
import { AttributeType, degToRad } from 'rewild-common';
import { physicsManager } from '../physics/PhysicsManager';
import { BufferGeometry } from '../../core/BufferGeometry';
import { Float32BufferAttribute } from '../../core/BufferAttribute';
import { debugF32Array, debugUI32Array } from '../../Imports';

export class TerrainChunk extends TransformNode {
  heightValues: Float32Array | null;
  body: Body | null = null;

  constructor() {
    super();
    this.heightValues = null;
    this.body = null;
  }

  onAddedToParent(): void {
    super.onAddedToParent();
    if (this.body) {
      physicsManager.world.add(this.body!);
    }
  }

  onRemovedFromParent(): void {
    super.onRemovedFromParent();
    if (this.body) {
      physicsManager.world.removeBody(this.body!);
    }
  }
}

export function generateChunkPhysicsBody(
  chunk: TerrainChunk,
  geometry: BufferGeometry
): void {
  // Get vertices
  const verts: Vec3[] = [];
  const faces: i32[][] = [];
  const rawVertsAttribute = geometry.getAttribute<Float32BufferAttribute>(
    AttributeType.POSITION
  )!;
  const indicesAttribute = geometry.getIndexes()!;
  const vertsArray = rawVertsAttribute.getArray() as Float32Array;

  debugF32Array(vertsArray);
  debugUI32Array(indicesAttribute.array);

  const terrainBody = new Body(
    new BodyOptions().setMass(0).setMaterial(groundMaterial)
  );

  for (let j: i32 = 0; j < vertsArray.length; j += 3) {
    verts.push(new Vec3(vertsArray[j], vertsArray[j + 1], vertsArray[j + 2]));
  }

  for (let j: i32 = 0; j < indicesAttribute.array.length; j += 3) {
    faces.push([
      indicesAttribute.array[j + 0],
      indicesAttribute.array[j + 1],
      indicesAttribute.array[j + 2],
    ]);
  }

  // Construct polyhedron
  const bunnyPart = new ConvexPolyhedron(verts, faces);
  terrainBody.addShape(bunnyPart);
  chunk.body = terrainBody;
}

export function generateTerrainChunkHeightmap(
  chunk: TerrainChunk,
  mapSize: i32
): usize {
  chunk.heightValues = new Float32Array(mapSize * mapSize);
  return changetype<usize>(chunk.heightValues);
}
