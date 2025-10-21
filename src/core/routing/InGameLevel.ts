import { Level } from 'rewild-routing';
import { Asset3D } from './Asset3D';
import { Player } from './Player';

export class InGameLevel extends Level {
  private player: Player;

  constructor(
    name: string,
    parentObject3D: Asset3D,
    autoDispose: boolean = false,
    player: Player
  ) {
    super(name, parentObject3D, autoDispose);
    this.player = player;
  }

  mount(): void {
    super.mount();
    if (this.player) {
      this.player.cameraController.camera.transform.position.set(0, 0, -10);
      this.parentObject3D.add(this.player.asset);
      this.player.cameraController.camera.lookAt(0, 0, 0);
    }
  }

  onUpdate(delta: number, total: number): void {
    // this.player.onUpdate(delta, total);
  }

  unMount(): void {
    super.unMount();
    if (this.player) this.parentObject3D.remove(this.player.asset);
  }

  dispose(): void {
    super.dispose();
  }
}
