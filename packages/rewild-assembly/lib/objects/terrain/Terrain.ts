import { Body, BodyOptions, Plane, Vec3 } from 'rewild-physics';
import { TransformNode } from '../../core/TransformNode';
import { createChunk } from '../../Imports';
import { groundMaterial } from '../physics/Materials';
import { degToRad } from 'rewild-common';
import { physicsManager } from '../physics/PhysicsManager';

export class Terrain extends TransformNode {
  isChunkLoaded: boolean;
  plane: Body | null = null;

  constructor() {
    super();
    this.isChunkLoaded = false;
    this.plane = this.createBodyPlane();
  }

  createBodyPlane(): Body {
    const boxOptions = new BodyOptions()
      .setMass(0)
      .setShape(new Plane())
      .setMaterial(groundMaterial);

    const body = new Body(boxOptions);
    body.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -degToRad(90));
    return body;
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);

    if (!this.isChunkLoaded) {
      this.isChunkLoaded = true;
      createChunk(this);
    }
  }

  onAddedToParent(): void {
    super.onAddedToParent();
    physicsManager.world.add(this.plane!);
  }

  onRemovedFromParent(): void {
    super.onRemovedFromParent();
    physicsManager.world.removeBody(this.plane!);
  }
}

export function createTerrain(): TransformNode {
  return new Terrain();
}
