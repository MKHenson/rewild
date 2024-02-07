import { Camera } from '../../cameras/Camera';
import { TransformNode } from '../../core/TransformNode';
import { initializeSkybox } from '../../Imports';
import { getRuntime } from '../routing/AsSceneManager';

export class Skybox extends TransformNode {
  constructor() {
    super();
    this.scale.set(5000, 5000, 5000);
    this.position.set(0, 0, 0);
    initializeSkybox(this);
  }

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);

    const runtime = getRuntime();
    const camPos = runtime.camera.position;
    this.position.set(camPos.x, camPos.y, camPos.z);
  }
}

export function createSkybox(): TransformNode {
  return new Skybox();
}
