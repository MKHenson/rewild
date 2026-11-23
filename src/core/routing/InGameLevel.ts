import { Level } from 'rewild-routing';
import { Asset3D } from './Asset3D';

export class InGameLevel extends Level {
  constructor(name: string, parentObject3D: Asset3D, autoDispose = false) {
    super(name, parentObject3D, autoDispose);
  }
}
