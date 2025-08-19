import { ICameraController } from 'rewild-renderer';
import { Node } from 'rewild-routing';
import { Asset3D } from './Asset3D';

export class Player extends Node {
  cameraController: ICameraController;
  asset: Asset3D;
  hunger: f32;
  health: f32;

  constructor(name: string, autoDispose: boolean = false) {
    super(name, autoDispose);
    this.hunger = 100.0; // Default hunger value
    this.health = 100.0; // Default health value
  }

  setCamera(cameraController: ICameraController): void {
    this.cameraController = cameraController;
    this.asset = new Asset3D(cameraController.camera.transform);
  }

  mount(): void {
    super.mount();
    this.hunger = 100.0; // Reset hunger on mount
    this.health = 100.0; // Reset health on mount
    this.cameraController.camera.transform.position.set(0, 0, -10); // Reset position
    this.cameraController.camera.lookAt(0, 0, 0);
  }

  onUpdate(delta: f32, total: u32): void {}
}
