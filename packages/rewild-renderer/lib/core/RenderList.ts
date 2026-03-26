import { Light } from './lights/Light';
import { Transform } from './Transform';

export class RenderList {
  solids: Transform[];
  overlay: Transform[];
  uiElements: Transform[];
  lights: Light[];

  constructor() {
    this.solids = [];
    this.overlay = [];
    this.lights = [];
    this.uiElements = [];
  }

  reset(): void {
    this.solids.length = 0;
    this.overlay.length = 0;
    this.lights.length = 0;
    this.uiElements.length = 0;
  }
}
