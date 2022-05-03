import { TransformNode } from "../../../core/TransformNode";
import { Node } from "./Node";
import { Mesh } from "../../Mesh";
import { Portal } from "./Portal";

export class Container extends Node {
  protected objects: TransformNode[];
  protected loaded: boolean;

  constructor(name: string) {
    super(name);
    this.objects = [];
    this.loaded = false;
    this.portals.push(new Portal("Enter", this));
    this.portals.push(new Portal("Exit", this));
  }

  findObjectByName(name: string): TransformNode | null {
    const objects = this.objects;
    for (let i: i32 = 0, l = objects.length; i < l; i++) if (objects[i].name == name) return objects[i];

    return null;
  }

  addAsset(object: TransformNode): void {
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
