import { Dispatcher } from 'rewild-common';
import { IAsset } from './IAsset';
import { Node } from './Node';
import { Portal } from './Portal';

type ContainerEvent = { kind: 'loading'; loadingPercent: f32 };

export class Container extends Node {
  protected objects: IAsset[];
  readonly activeOnStartup: boolean;
  parentObject3D: IAsset;
  dispatcher: Dispatcher<ContainerEvent>;

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
    this.dispatcher = new Dispatcher<ContainerEvent>();

    this.addPortal(new Portal('Enter'));
    this.addPortal(new Portal('Exit'));
  }

  protected onLoadingUpdate(): void {
    const objects = this.objects;
    const numAssets = objects.length;
    let numAssetsLoaded: i32 = 0;

    for (let i: i32 = 0, l = objects.length; i < l; i++)
      if (objects[i].loaded) numAssetsLoaded++;

    const loadingPercent = numAssetsLoaded / numAssets;
    this.dispatcher.dispatch({ kind: 'loading', loadingPercent });
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
    this.onLoadingUpdate();
    let object: IAsset;
    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      object = objects[i];
      if (object.loaded) {
        object.load().then(() => this.onLoadingUpdate());
      }
      parentObject3D.add(object);
      object.mount();
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

  onUpdate(delta: f32, total: u32): void {
    super.onUpdate(delta, total);
    const objects = this.objects;
    for (const obj of objects) {
      if (obj.behaviours) {
        for (const behavior of obj.behaviours) {
          behavior.onUpdate(delta, total, obj);
        }
      }
    }
  }
}
