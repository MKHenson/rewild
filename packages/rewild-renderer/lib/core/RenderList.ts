import { Light } from './lights/Light';
import { Transform } from './Transform';

export class RenderList {
  solids: Transform[];
  uiElements: Transform[];
  lights: Light[];

  constructor() {
    this.solids = [];
    this.lights = [];
    this.uiElements = [];
  }

  reset(): void {
    this.solids.length = 0;
    this.lights.length = 0;
    this.uiElements.length = 0;
  }
}
