import { Light } from './lights/Light';
import { Transform } from './Transform';
import { UISurface3D } from './UISurface3D';

export class RenderList {
  solids: Transform[];
  overlay: Transform[];
  lights: Light[];
  surfaces: UISurface3D[];

  constructor() {
    this.solids = [];
    this.overlay = [];
    this.lights = [];
    this.surfaces = [];
  }

  reset(): void {
    this.solids.length = 0;
    this.overlay.length = 0;
    this.lights.length = 0;
    this.surfaces.length = 0;
  }
}
