import type { AudioEngine, AudioScope } from 'rewild-audio';
import type { Renderer } from 'rewild-renderer';
import { WindSound } from './WindSound';

/**
 * The sound of the world around the listener: the weather now, and the water
 * and the land as they arrive. The game and the editor each own one in their
 * scene scope and update it once a frame, before `audio.update()`.
 */
export class WorldSound {
  private readonly _wind: WindSound;

  constructor(engine: AudioEngine, scope: AudioScope) {
    this._wind = new WindSound(engine, scope);
  }

  get wind(): WindSound {
    return this._wind;
  }

  update(renderer: Renderer, seconds: number): void {
    const wind = renderer.sky?.skyRenderer?.wind;
    if (wind) this._wind.update(wind, seconds);
  }
}
