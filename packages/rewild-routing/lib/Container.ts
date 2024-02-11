import { Node } from './Node';
import { Portal } from './Portal';
import { Object3D } from 'rewild-wasmtime';

export class Container extends Node {
  protected objects: Object3D[];
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
    const parentObject3D = this.parentObject3D;

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      parentObject3D.add(objects[i]);
    }

    super.mount();
  }

  unMount(): void {
    const objects = this.objects;
    const parentObject3D = this.parentObject3D;

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      parentObject3D.remove(objects[i]);
    }

    super.unMount();
  }
}
