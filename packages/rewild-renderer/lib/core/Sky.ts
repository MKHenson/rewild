import { Renderer } from '..';
import { SkyRenderer } from '../renderers/sky/SkyRenderer';
import { Camera } from './Camera';
import { Transform } from './Transform';

export class Sky {
  transform: Transform;
  skyRenderer: SkyRenderer;
  initialized: boolean;

  constructor() {
    this.initialized = false;
    this.transform = new Transform();
    this.skyRenderer = new SkyRenderer(this.transform);
  }

  update(renderer: Renderer, camera: Camera) {
    // No longer needs to follow camera — sky is rendered as a fullscreen quad
  }

  dispose() {
    this.skyRenderer.dispose();
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    if (!this.initialized) {
      this.skyRenderer.init(renderer);
      this.initialized = true;
    }

    this.skyRenderer.render(renderer, pass, camera);
  }
}
