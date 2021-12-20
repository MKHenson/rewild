import { Listener } from "../../../core/EventDispatcher";
import { WebGPURenderer } from "../../../renderers/WebGPURenderer";
import { inputManager } from "../../../exports/ASInputManager";
import { Event } from "../../../core/Event";
import { Scene } from "../../../scenes/Scene";
import { PerspectiveCamera } from "../../../cameras/PerspectiveCamera";
import { Container } from "./Container";

export class Runtime implements Listener {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  private activeNodes: Container[];

  constructor(width: f32, height: f32, renderer: WebGPURenderer) {
    this.activeNodes = [];

    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(45, f32(width) / f32(height), 0.1, 1000);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera);

    inputManager.addEventListener("mousemove", this);
  }

  addContainer(container: Container): void {
    container.runtime = this;
    this.activeNodes.push(container);
  }

  OnLoop(delta: f32, total: u32, fps: u32): void {
    const activeNodes = this.activeNodes;

    for (let i: i32 = 0, l: i32 = activeNodes.length; i < l; i++) {
      const node = activeNodes[i];

      if (!node.initialized) node.init();
      if (!node.mounted) node.mount();
    }

    for (let i: i32 = 0, l: i32 = activeNodes.length; i < l; i++) {
      activeNodes[i].onUpdate(delta, total, fps);
    }

    this.renderer.render(this.scene, this.camera);
  }

  onResize(width: f32, height: f32): void {
    this.camera.aspect = f32(width) / f32(height);
    this.camera.updateProjectionMatrix();
  }

  onEvent(event: Event): void {}
}
