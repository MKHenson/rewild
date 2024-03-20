import { Body, BodyOptions, NewHeightfield, Vec3 } from 'rewild-physics';
import { TransformNode } from '../../core/TransformNode';
import { groundMaterial } from '../physics/Materials';
import { AttributeType, degToRad } from 'rewild-common';
import { physicsManager } from '../physics/PhysicsManager';
import { BufferGeometry } from '../../core/BufferGeometry';
import { Float32BufferAttribute } from '../../core/BufferAttribute';

export class TerrainChunk extends TransformNode {
  heightValues: Float32Array | null;
  body: Body | null = null;

  constructor() {
    super();
    this.name = 'TerrainChunk';
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
  geometry: BufferGeometry,
  size: i32
): void {
  const rawVertsAttribute = geometry.getAttribute<Float32BufferAttribute>(
    AttributeType.POSITION
  )!;
  const indexBuffer = geometry.indexes!.array;
  const vertsArray = rawVertsAttribute.getArray() as Float32Array;

  const heights: f32[][] = new Array<f32[]>(size);
  if (geometry.boundingBox == null) geometry.computeBoundingBox();

  // Generate the heights array from the vertex and indices data
  for (let i: i32 = 0; i < size; i++) {
    heights[i] = new Array<f32>(size);

    for (let j: i32 = 0; j < size; j++) {
      const index = i * size + j;
      const y = vertsArray[index * 3 + 1];
      heights[i][j] = 0;
    }
  }

  const heightmapShape = new NewHeightfield(heights);
  const terrainBody = new Body(
    new BodyOptions().setMass(0).setMaterial(groundMaterial)
  );

  console.log(`geometry.boundingBox!.min.x = ${geometry.boundingBox!.min.x}`);
  console.log(`geometry.boundingBox!.min.z = ${geometry.boundingBox!.min.z}`);

  terrainBody.addShape(heightmapShape);
  // terrainBody.position.set(
  //   geometry.boundingBox!.min.x,
  //   0,
  //   geometry.boundingBox!.min.z
  // );
  // terrainBody.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -degToRad(15));
  chunk.body = terrainBody;
}

export function generateTerrainChunkHeightmap(
  chunk: TerrainChunk,
  mapSize: i32
): usize {
  chunk.heightValues = new Float32Array(mapSize * mapSize);
  return changetype<usize>(chunk.heightValues);
}
