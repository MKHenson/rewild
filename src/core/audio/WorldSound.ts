import type { AudioEngine, AudioScope } from 'rewild-audio';
import type { Renderer } from 'rewild-renderer';
import { RainSound } from './RainSound';
import { WindSound } from './WindSound';

/**
 * The sound of the world around the listener: the weather now, and the water
 * and the land as they arrive. The game and the editor each own one in their
 * scene scope and update it once a frame, before `audio.update()`.
 */
export class WorldSound {
  private readonly _wind: WindSound;
  private readonly _rain: RainSound;

  constructor(engine: AudioEngine, scope: AudioScope) {
    this._wind = new WindSound(engine, scope);
    this._rain = new RainSound(scope);
  }

  get wind(): WindSound {
    return this._wind;
  }

  get rain(): RainSound {
    return this._rain;
  }

  update(renderer: Renderer, seconds: number): void {
    const sky = renderer.sky?.skyRenderer;
    if (!sky) return;
    this._wind.update(sky.wind, seconds);
    this._rain.update(sky);
  }
}
