import { Body, BodyOptions, Heightfield, Plane, Vec3 } from 'rewild-physics';
import { TransformNode } from '../../core/TransformNode';
import { groundMaterial } from '../physics/Materials';
import { degToRad } from 'rewild-common';
import { physicsManager } from '../physics/PhysicsManager';

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

  createBodyPlane(mapSize: i32, unitSize: f32): Body {
    // Create a matrix of height values
    let matrix: f32[][] = [];
    const heightValues = this.heightValues;

    for (let i: i32 = 0; i < mapSize; i++) {
      let innerMatrix: f32[] = [];
      matrix.push(innerMatrix);

      for (let j: i32 = 0; j < mapSize; j++) {
        let height: f32 = heightValues![i * mapSize + j];
        innerMatrix.push(height);
      }
    }

    // // Create a matrix of height values
    // const sizeX: i32 = mapSize,
    //   sizeY: i32 = mapSize;
    // for (let i: i32 = 0; i < sizeX; i++) {
    //   matrix.push([]);
    //   for (let j: i32 = 0; j < sizeY; j++) {
    //     let height: f32 = 0.0;
    //     matrix[i].push(height);
    //   }
    // }

    // Create the heightfield
    let shape = new Heightfield(matrix, f32.NaN, f32.NaN, unitSize);

    let body = new Body(
      new BodyOptions().setMass(0) // .setMaterial(groundMaterial)
    );
    body.addShape(shape);
    body.position.set(
      -(f32(mapSize) * unitSize) / 2,
      0,
      (f32(mapSize) * unitSize) / 2
    );
    // body.position.set(0, 0, 0);
    body.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -degToRad(90));

    // body.material = groundMaterial;

    // const boxOptions = new BodyOptions()
    //   .setMass(0)
    //   .setShape(new Plane())
    //   .setMaterial(groundMaterial);

    // const body = new Body(boxOptions);
    // body.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -degToRad(90));

    return body;
  }
}

export function generateTerrainChunkHeightmap(
  chunk: TerrainChunk,
  mapSize: i32
): usize {
  chunk.heightValues = new Float32Array(mapSize * mapSize);
  return changetype<usize>(chunk.heightValues);
}

export function generateChunkPhysicsBody(
  chunk: TerrainChunk,
  mapSize: i32,
  unitSize: f32
): void {
  chunk.body = chunk.createBodyPlane(mapSize, unitSize);
}
