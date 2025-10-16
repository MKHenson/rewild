import { IResource } from 'models';
import { Vector3 } from 'rewild-common';
import { Transform } from 'rewild-renderer';
import { IAsset, IBehaviour, StateMachine } from 'rewild-routing';

export class Asset3D implements IAsset<IResource> {
  transform: Transform;
  children: IAsset[] = [];
  loaded: boolean;
  stateMachine: StateMachine | null;
  initialPosition: Vector3;
  behaviours: IBehaviour[];
  data: IResource;

  constructor(transform: Transform) {
    this.transform = transform;
    this.loaded = false;
    this.behaviours = [];
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

  addBehavior(behavior: IBehaviour): void {
    if (this.behaviours.includes(behavior)) return; // Avoid duplicates
    this.behaviours.push(behavior);
    behavior.onAdded?.(this);
  }

  removeBehavior(behavior: IBehaviour): void {
    const index = this.behaviours.indexOf(behavior);
    if (index > -1) {
      this.behaviours.splice(index, 1);
      behavior.onRemoved?.(this);
    }
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
