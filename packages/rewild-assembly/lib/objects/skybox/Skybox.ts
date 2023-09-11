import { Camera } from "../../cameras/Camera";
import { TransformNode } from "../../core/TransformNode";
import { initializeSkybox } from "../../Imports";

export class Skybox extends TransformNode {
  constructor() {
    super();
    this.scale.set(5000, 5000, 5000);
    this.position.set(0, 0, 0);
    initializeSkybox(this);
  }

  update(camera: Camera): void {
    const camPos = camera.position;
    this.position.set(camPos.x, camPos.y, camPos.z);
  }
}
