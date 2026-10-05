import { Renderer } from '..';
import { AtmosphereSystem } from '../atmosphere/AtmosphereSystem';
import { SkyRenderer } from '../renderers/sky/SkyRenderer';
import { Camera } from './Camera';
import { Transform } from './Transform';

export class Sky {
  transform: Transform;
  skyRenderer: SkyRenderer;
  /** The day/night cycle and the weather. While running it writes the sky's
   *  knobs at the top of every frame. */
  readonly atmosphere = new AtmosphereSystem();
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
    const deltaSeconds = renderer.delta / 1000;

    if (this.atmosphere.running) {
      const sample = this.atmosphere.update(deltaSeconds);
      // Jumps in time of day leave the phase where it is.
      const sunDegrees = sample.elevation - sky.elevation;
      if (sunDegrees > 0 && sunDegrees < 90) sky.moon.advance(sunDegrees);
      sky.elevation = sample.elevation;
      sky.cloudiness = sample.cloudiness;
      sky.windiness = sample.windiness;
      sky.windBearing = sample.windBearing;
      sky.precipitation = sample.precipitation;
      sky.foginess = sample.fog;
      sky.temperature = sample.temperature;
    }

    sky.wind.update(
      sky.windDirection.x,
      sky.windDirection.y,
      sky.windiness,
      sky.cloudiness,
      deltaSeconds
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
