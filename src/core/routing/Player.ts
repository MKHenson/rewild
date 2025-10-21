import { ICameraController, Renderer } from 'rewild-renderer';
import { Node } from 'rewild-routing';
import { Asset3D } from './Asset3D';
import { StateMachineData } from './Types';
import { Vector3 } from 'node_modules/rewild-common';
import { Raycaster } from 'node_modules/rewild-renderer/lib/core/Raycaster';

export class Player extends Node {
  cameraController: ICameraController;
  asset: Asset3D;
  hunger: f32;
  health: f32;
  raycaster: Raycaster;

  constructor(name: string, autoDispose: boolean = false) {
    super(name, autoDispose);
    this.hunger = 100.0; // Default hunger value
    this.health = 100.0; // Default health value
    this.raycaster = new Raycaster();
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

  onUpdate(delta: f32, total: u32): void {
    // Shoot ray down from sky to see if it hits the ground
    // If it does, set the player's Y position to the hit point's Y coordinate

    const stateData = this.stateMachine?.data as StateMachineData;

    const coords = this.get3DCoords(stateData.renderer);
    if (coords)
      this.cameraController.camera.transform.position.y = coords.y + 1.8; // Set player height above ground
  }

  get3DCoords(renderer: Renderer) {
    const position = this.cameraController.camera.transform.position;

    this.raycaster.set(
      new Vector3(position.x, position.y + 100, position.z),
      Vector3.DOWN
    );
    const intersects = this.raycaster.intersectObjects([renderer.scene], true);

    if (intersects.length > 0) {
      const intersection = intersects[0];
      return intersection.point;
    }

    return null;
  }
}
