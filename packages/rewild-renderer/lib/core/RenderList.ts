import { Light } from './lights/Light';
import { Transform } from './Transform';

export class RenderList {
  solids: Transform[];
  lights: Light[];

  constructor() {
    this.solids = [];
    this.lights = [];
  }

  reset(): void {
    this.solids.length = 0;
    this.lights.length = 0;
  }
}
