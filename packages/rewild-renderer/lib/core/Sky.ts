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

  // Runs at the top of the frame, before the shadow and scene passes read the
  // wind; the sky itself renders as a fullscreen quad and needs nothing here.
  update(renderer: Renderer, camera: Camera) {
    const sky = this.skyRenderer;
    sky.wind.update(
      sky.windDirection.x,
      sky.windDirection.y,
      sky.windiness,
      renderer.delta / 1000
    );
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

  postRender(renderer: Renderer): void {
    this.skyRenderer.postRender(renderer);
  }
}
