import {
  addChild,
  removeChild,
  TransformNode,
} from "../../../core/TransformNode";
import { Node } from "./Node";
import { Portal } from "./Portal";
import { Component } from "../../../core/Component";

export class Container extends Node {
  protected objects: TransformNode[];
  protected loaded: boolean;

  constructor(name: string, addDefaultPortals: boolean = true) {
    super(name);
    this.objects = [];
    this.loaded = false;

    if (addDefaultPortals) {
      this.portals.push(new Portal("Enter", this));
      this.portals.push(new Portal("Exit", this));
    }
  }

  findObjectByName(name: string): TransformNode | null {
    const objects = this.objects;
    for (let i: i32 = 0, l = objects.length; i < l; i++)
      if (unchecked(objects[i]).name == name) return unchecked(objects[i]);
    return null;
  }

  addAsset(object: TransformNode): void {
    this.objects.push(object);
  }

  onUpdate(delta: f32, total: u32): void {
    const objects = this.objects;
    let components: Component[];

    for (let c: i32 = 0, cl = objects.length; c < cl; c++) {
      components = objects[c].components;
      for (let i: i32 = 0, l = components.length; i < l; i++) {
        const component = unchecked(components[i]);
        component.onUpdate(delta, total);
      }
    }
  }

  mount(): void {
    const objects = this.objects;
    let components: Component[];

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      components = objects[i].components;
      addChild(this.runtime!.scene, unchecked(objects[i]));

      for (let c: i32 = 0, cl = components.length; c < cl; c++) {
        const component = unchecked(components[c]);
        component.mount();
      }
    }

    super.mount();
  }

  unMount(): void {
    const objects = this.objects;
    let components: Component[];

    console.log(this.name + " is unmounting and runtime ");

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      components = objects[i].components;
      removeChild(this.runtime!.scene, unchecked(objects[i]));

      for (let c: i32 = 0, cl = components.length; c < cl; c++) {
        const component = unchecked(components[c]);
        component.mount();
      }
    }
    super.unMount();
  }
}

export function createContainer(name: string): Container {
  return new Container(name);
}

export function addAsset(container: Container, object: TransformNode): void {
  container.addAsset(object);
}
