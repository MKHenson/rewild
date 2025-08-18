import { Transform } from 'rewild-renderer';
import { IAsset } from 'rewild-routing/lib/IAsset';

export class Asset3D implements IAsset {
  transform: Transform;
  children: IAsset[] = [];

  constructor(transform: Transform) {
    this.transform = transform;
  }

  get name(): string {
    return this.transform.name;
  }

  add(child: IAsset): IAsset {
    if (this.children.includes(child)) {
      return child; // Already added
    }

    this.children.push(child);
    return child;
  }

  remove(child: IAsset): IAsset {
    const index = this.children.indexOf(child);
    if (index > -1) {
      this.children.splice(index, 1);
    }
    return child;
  }
}
