import { Vector3 } from 'rewild-common';
import { Transform } from 'rewild-renderer';
import { IAsset } from 'rewild-routing/lib/IAsset';

export class Asset3D implements IAsset {
  transform: Transform;
  children: IAsset[] = [];
  loaded: boolean;
  initialPosition: Vector3;

  constructor(transform: Transform) {
    this.transform = transform;
    this.loaded = false;
    this.initialPosition = new Vector3();
  }

  get name(): string {
    return this.transform.name;
  }

  set name(value: string) {
    this.transform.name = value;
  }

  get id(): string {
    return this.transform.id;
  }

  set id(value: string) {
    this.transform.id = value;
  }

  async load() {
    this.loaded = true;
    return this;
  }

  mount(): void {
    this.transform.position.copy(this.initialPosition);
  }

  add(child: IAsset): IAsset {
    if (this.children.includes(child)) {
      return child; // Already added
    }

    this.children.push(child);
    if (child instanceof Asset3D) this.transform.addChild(child.transform);
    return child;
  }

  remove(child: IAsset): IAsset {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);

      if (child instanceof Asset3D) this.transform.removeChild(child.transform);
    }
    return child;
  }
}
