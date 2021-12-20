import { Object } from "../../../core/Object";
import { Node } from "./Node";
import { Mesh } from "../../Mesh";
import { print } from "../../../Imports";

let totalTime: f32 = 0;
export class Container extends Node {
  protected meshes: Mesh[];
  protected loaded: boolean;

  constructor() {
    super();
    this.meshes = [];
    this.loaded = false;
  }

  addAsset(object: Object): void {
    if (object instanceof Mesh) {
      const mesh = object as Mesh;

      print(`Adding mesh to container...`);
      this.meshes.push(mesh);
    }
  }

  onUpdate(delta: f32, total: u32, fps: u32): void {}

  mount(): void {
    const meshes = this.meshes;
    for (let i: i32 = 0, l: i32 = meshes.length; i < l; i++) {
      this.runtime!.scene.add(meshes[i]);
    }
    super.mount();
  }

  unMount(): void {
    const meshes = this.meshes;
    for (let i: i32 = 0, l: i32 = meshes.length; i < l; i++) {
      this.runtime!.scene.remove(meshes[i]);
    }
    super.unMount();
  }

  init(): void {
    // Load any assets
    const meshes = this.meshes;
    for (let i: i32 = 0, l: i32 = meshes.length; i < l; i++) {
      const geometry = meshes[i].geometry;
      if (geometry) this.runtime!.renderer.geometries.set(geometry);
    }

    super.init();
  }
}

export function createContainer(): Container {
  return new Container();
}
