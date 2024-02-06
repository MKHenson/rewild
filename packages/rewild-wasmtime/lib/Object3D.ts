import { wasm } from "./WasmManager";
import { generateUUID } from "rewild-common";
import { Component } from "./components";

let objectId = 1;

export class Object3D {
  transform: Number;
  name: string;
  id: number;
  uuid: string = generateUUID();
  components: Component[] = [];

  constructor(name?: string, transform?: Number) {
    this.transform = 0;
    this.name = name || "";
    this.id = objectId++;
    this.transform = transform || wasm.createTransformNode(this.name);
    wasm.setId(this.transform as any, this.id);
  }

  set visibility(val: boolean) {
    wasm.setVisibility(this.transform as any, val);
  }

  get visibility() {
    return wasm.getVisibility(this.transform as any);
  }

  setPosition(x: number, y: number, z: number) {
    wasm.setPosition(this.transform as any, x, y, z);
  }

  add(child: Object3D) {
    wasm.addChild(this.transform as any, child.transform as any);
  }

  remove(child: Object3D) {
    wasm.removeChild(this.transform as any, child.transform as any);
  }

  addComponent(component: Component) {
    wasm.addComponent(this.transform as any, component.pointer);

    if (this.components.indexOf(component) === -1)
      this.components.push(component);
  }

  removeComponent(component: Component) {
    wasm.removeComponent(this.transform as any, component.pointer);

    const index = this.components.indexOf(component);
    if (index !== -1) this.components.splice(index, 1);
  }
}
