import { Node } from './Node';
import { Portal } from './Portal';
import { Object3D, wasm } from 'rewild-wasmtime';

export class Container extends Node {
  protected objects: Object3D[];
  protected loaded: boolean;
  readonly activeOnStartup: boolean;
  private parentObject3D: Object3D;

  constructor(
    name: string,
    activeOnStartup: boolean,
    parentObject3D: Object3D,
    autoDispose: boolean = false
  ) {
    super(name, autoDispose);
    this.objects = [];
    this.loaded = false;
    this.parentObject3D = parentObject3D;
    this.activeOnStartup = activeOnStartup;

    this.addPortal(new Portal('Enter'));
    this.addPortal(new Portal('Exit'));
  }

  findObjectByName(name: string): Object3D | null {
    const objects = this.objects;
    for (let i: i32 = 0, l = objects.length; i < l; i++)
      if (unchecked(objects[i]).name == name) return unchecked(objects[i]);
    return null;
  }

  addAsset(object: Object3D): void {
    this.objects.push(object);
  }

  mount(): void {
    const objects = this.objects;

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      wasm.addChild(
        this.parentObject3D.transform as any,
        unchecked(objects[i].transform as any)
      );
    }

    super.mount();
  }

  unMount(): void {
    const objects = this.objects;

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      wasm.removeChild(
        this.parentObject3D.transform as any,
        unchecked(objects[i].transform as any)
      );
    }

    super.unMount();
  }
}
