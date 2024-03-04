import { WebGPURenderer } from '../renderers/WebGPURenderer';
import { Scene } from '../scenes/Scene';
import { PerspectiveCamera } from '../cameras/PerspectiveCamera';
import { addChild } from '../core/TransformNode';
import { physicsManager } from './physics/PhysicsManager';

export class Runtime {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;

  constructor(width: f32, height: f32, renderer: WebGPURenderer) {
    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(
      45,
      f32(width) / f32(height),
      0.1,
      10000
    );
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    addChild(this.scene, this.camera);
  }

  OnLoop(delta: f32, total: u32): void {
    physicsManager.update();
    this.scene.onUpdate(delta, total);
    this.renderer.render(this.scene, this.camera);
  }

  onResize(width: f32, height: f32): void {
    this.camera.aspect = f32(width) / f32(height);
    this.camera.updateProjectionMatrix();
  }
}
