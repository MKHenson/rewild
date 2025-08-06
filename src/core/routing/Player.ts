import { ICameraController, Transform } from 'rewild-renderer';
import { Node } from 'rewild-routing';

export class Player extends Node {
  transform: Transform;
  cameraController: ICameraController;
  hunger: f32;
  health: f32;

  constructor(name: string, autoDispose: boolean = false) {
    super(name, autoDispose);
    this.hunger = 100.0; // Default hunger value
    this.health = 100.0; // Default health value
  }

  mount(): void {
    super.mount();
    this.hunger = 100.0; // Reset hunger on mount
    this.health = 100.0; // Reset health on mount
    this.transform.position.set(0, 0, -10); // Reset position
    this.cameraController.camera.lookAt(0, 0, 0);
  }

  onUpdate(delta: f32, total: u32): void {}
}
