import { Renderer } from '..';
import { AtmosphereMaterial } from '../materials/sky/AtmosphereMaterial';
import { Camera } from './Camera';

export class Atmosphere {
  material: AtmosphereMaterial;
  initialized: boolean;

  constructor() {
    this.initialized = false;
    this.material = new AtmosphereMaterial();
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    if (!this.initialized) {
      this.material.init(renderer);
      this.initialized = true;
    }

    this.material.render(renderer, pass, camera);
  }
}
