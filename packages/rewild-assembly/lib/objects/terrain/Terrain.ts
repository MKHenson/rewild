import { Body, BodyOptions, Heightfield, Plane, Vec3 } from 'rewild-physics';
import { TransformNode } from '../../core/TransformNode';
import { createChunk } from '../../Imports';
import { groundMaterial } from '../physics/Materials';
import { degToRad } from 'rewild-common';
import { physicsManager } from '../physics/PhysicsManager';
import { TerrainChunk } from './TerrainChunk';

export class Terrain extends TransformNode {
  isChunkLoaded: boolean;
  plane: Body | null = null;

  constructor() {
    super();
    this.isChunkLoaded = false;
    // this.plane = this.createBodyPlane();
  }

  createBodyPlane(): Body {
    // Create a matrix of height values
    let matrix: f32[][] = [];
    let sizeX: f32 = 15,
      sizeY: f32 = 15;

    for (let i: f32 = 0; i < sizeX; i++) {
      let innerMatrix: f32[] = [];
      matrix.push(innerMatrix);

      for (let j: f32 = 0; j < sizeY; j++) {
        let height: f32 =
          Mathf.cos((i / sizeX) * Mathf.PI * 2.0) *
            Mathf.cos((j / sizeY) * Mathf.PI * 2.0) +
          2.0;

        if (i === 0.0 || i === sizeX - 1.0 || j === 0.0 || j === sizeY - 1.0)
          height = 3.0;

        innerMatrix.push(height);
      }
    }

    // Create the heightfield
    let shape = new Heightfield(matrix, f32.NaN, f32.NaN, 5);
    let body = new Body(
      new BodyOptions().setMass(0).setShape(shape).setMaterial(groundMaterial)
    );

    body.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -degToRad(90));
    body.material = groundMaterial;

    return body;
    // const boxOptions = new BodyOptions()
    //   .setMass(0)
    //   .setShape(new Plane())
    //   .setMaterial(groundMaterial);

    // const body = new Body(boxOptions);
    // body.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -degToRad(90));
    // return body;
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);

    if (!this.isChunkLoaded) {
      this.isChunkLoaded = true;
      const newChunk = new TerrainChunk();
      createChunk(this, newChunk);
    }
  }

  // onAddedToParent(): void {
  //   super.onAddedToParent();
  //   physicsManager.world.add(this.plane!);
  // }

  // onRemovedFromParent(): void {
  //   super.onRemovedFromParent();
  //   physicsManager.world.removeBody(this.plane!);
  // }
}

export function createTerrain(): TransformNode {
  return new Terrain();
}
