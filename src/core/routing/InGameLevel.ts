// import { Level } from 'rewild-routing';
// import { Object3D, Player, wasm } from 'rewild-wasmtime';

// export class InGameLevel extends Level {
//   private player: Player;
//   private terrain: Object3D;
//   private skybox: Object3D;

//   constructor(
//     name: string,
//     parentObject3D: Object3D,
//     autoDispose: boolean = false,
//     player: Player
//   ) {
//     super(name, parentObject3D, autoDispose);

//     this.player = player;
//     this.terrain = new Object3D('Terrain', wasm.createTerrain());
//     this.skybox = new Object3D('Skybox', wasm.createSkybox());

//     this.addAsset(this.terrain);
//     this.addAsset(this.skybox);
//   }

//   mount(): void {
//     super.mount();
//     if (this.player) this.parentObject3D.add(this.player);
//   }

//   unMount(): void {
//     super.unMount();
//     if (this.player) this.parentObject3D.remove(this.player);
//   }

//   dispose(): void {
//     super.dispose();
//     this.terrain.dispose();
//     this.skybox.dispose();
//   }
// }

import { Level } from 'rewild-routing';
import { Camera, Object3D, Player, Terrain, wasm } from 'rewild-wasmtime';
import { terrainManager } from '../renderer/AssetManagers/TerrainManager';

export class InGameLevel extends Level {
  private player: Player;
  private terrain: Terrain;
  private skybox: Object3D;

  constructor(
    name: string,
    parentObject3D: Object3D,
    autoDispose: boolean = false,
    player: Player
  ) {
    super(name, parentObject3D, autoDispose);

    this.player = player;
    this.terrain = terrainManager.addTerrain();
    this.skybox = new Object3D('Skybox', wasm.createSkybox());

    this.addAsset(this.terrain);
    this.addAsset(this.skybox);
  }

  mount(): void {
    super.mount();
    if (this.player) this.parentObject3D.add(this.player);

    const camera = new Camera();
    camera.setPosition(20, 0, 0);
    camera.lookAt(0, 0, 0);
  }

  unMount(): void {
    super.unMount();
    if (this.player) this.parentObject3D.remove(this.player);
  }

  dispose(): void {
    super.dispose();

    terrainManager.removeTerrain(this.terrain);
    this.skybox.dispose();
  }
}
