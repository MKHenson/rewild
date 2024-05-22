import { Level } from 'rewild-routing';
import { Object3D, Player, wasm } from 'rewild-wasmtime';

export class InGameLevel extends Level {
  private player: Player;
  private terrain: Object3D;
  private skybox: Object3D;

  constructor(
    name: string,
    parentObject3D: Object3D,
    autoDispose: boolean = false,
    player: Player
  ) {
    super(name, parentObject3D, autoDispose);

    this.player = player;
    this.terrain = new Object3D('Terrain', wasm.createTerrain());
    this.skybox = new Object3D('Skybox', wasm.createSkybox());

    this.addAsset(this.terrain);
    this.addAsset(this.skybox);
  }

  mount(): void {
    super.mount();
    if (this.player) {
      this.player.setPosition(0, 0, -10);
      this.parentObject3D.add(this.player);
      this.player.camera.lookAt(0, 0, 0);
    }
  }

  onUpdate(delta: number, total: number): void {}

  unMount(): void {
    super.unMount();
    if (this.player) this.parentObject3D.remove(this.player);
  }

  dispose(): void {
    super.dispose();
    this.terrain.dispose();
    this.skybox.dispose();
  }
}
