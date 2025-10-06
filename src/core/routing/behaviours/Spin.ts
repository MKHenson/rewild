import { IBehaviour, IAsset } from 'rewild-routing';
import { Asset3D } from '../Asset3D';

export class Spin implements IBehaviour {
  name: string;
  constructor() {
    this.name = 'spin';
  }

  onUpdate(delta: f32, total: u32, asset: IAsset): void {
    if (asset instanceof Asset3D && asset.transform) {
      asset.transform.rotateY(delta * 0.5); // Rotate at 0.5 radians per second
    }
  }
}
