import {
  addChild,
  removeChild,
  TransformNode,
} from '../../../core/TransformNode';
import { Node } from './Node';
import { Portal } from './Portal';
import { Component } from '../../../core/Component';
import { BehaviourComponent } from '../../../components/BehaviourComponent';

export class Container extends Node {
  protected objects: TransformNode[];
  activeOnStartup: boolean;

  constructor(
    name: string,
    activeOnStartup: boolean,
    autoDispose: boolean = false
  ) {
    super(name, autoDispose);
    this.objects = [];
    this.activeOnStartup = activeOnStartup;

    this.addPortal(new Portal('Enter'));
    this.addPortal(new Portal('Exit'));
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

  mount(): void {
    const objects = this.objects;
    let components: Component[];

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      components = objects[i].components;
      addChild(this.runtime!.scene, unchecked(objects[i]));
    }

    super.mount();
  }

  unMount(): void {
    const objects = this.objects;
    let components: Component[];

    for (let i: i32 = 0, l: i32 = objects.length; i < l; i++) {
      components = objects[i].components;
      removeChild(this.runtime!.scene, unchecked(objects[i]));
    }
    super.unMount();
  }
}

export function createContainer(
  name: string,
  activeOnStartup: boolean,
  autoDispose: boolean = false
): Node {
  return new Container(name, activeOnStartup, autoDispose);
}

export function addAsset(container: Container, object: TransformNode): void {
  container.addAsset(object);
}
