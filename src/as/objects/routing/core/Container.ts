import { Object } from "../../../core/Object";
import { Node } from "./Node";
import { Mesh } from "../../Mesh";
import { print } from "../../../Imports";
import { Portal } from "./Portal";

let totalTime: f32 = 0;
export class Container extends Node {
  protected objects: Object[];
  protected loaded: boolean;

  constructor(name: string) {
    super(name);
    this.objects = [];
    this.loaded = false;
    this.portals.push(new Portal("Enter", this));
    this.portals.push(new Portal("Exit", this));
  }

  addAsset(object: Object): void {
    this.objects.push(object);
  }

  onUpdate(delta: f32, total: u32, fps: u32): void {}

  mount(): void {
    const objects = this.objects;
    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      this.runtime!.scene.add(objects[i]);
    }
    super.mount();
  }

  unMount(): void {
    const objects = this.objects;
    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      this.runtime!.scene.remove(objects[i]);
    }
    super.unMount();
  }

  init(): void {
    // Load any assets
    const objects = this.objects;
    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      const obj = objects[i];
      if (obj instanceof Mesh) {
        const geometry = (obj as Mesh).geometry;
        if (geometry) this.runtime!.renderer.geometries.set(geometry);
      }
    }

    super.init();
  }
}

export function createContainer(name: string): Container {
  return new Container(name);
}
