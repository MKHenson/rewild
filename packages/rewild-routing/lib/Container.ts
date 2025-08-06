import { IAsset } from './IAsset';
import { Node } from './Node';
import { Portal } from './Portal';

export class Container extends Node {
  protected objects: IAsset[];
  readonly activeOnStartup: boolean;
  parentObject3D: IAsset;

  constructor(
    name: string,
    activeOnStartup: boolean,
    parentObject3D: IAsset,
    autoDispose: boolean = false
  ) {
    super(name, autoDispose);
    this.objects = [];
    this.parentObject3D = parentObject3D;
    this.activeOnStartup = activeOnStartup;

    this.addPortal(new Portal('Enter'));
    this.addPortal(new Portal('Exit'));
  }

  findObjectByName(name: string): IAsset | null {
    const objects = this.objects;
    for (let i: i32 = 0, l = objects.length; i < l; i++)
      if (unchecked(objects[i]).name == name) return unchecked(objects[i]);
    return null;
  }

  addAsset(object: IAsset): void {
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
