import { RenderQuality } from './RenderQuality';

/**
 * The app-wide render-quality setting.
 *
 * One authority for "how expensive should the renderer be", owned by the
 * Renderer as `renderer.quality`. Every subsystem that scales with quality —
 * all sub systems reads the level from here rather
 * than holding its own copy.
 */
export class QualitySettings {
  private _level: RenderQuality;
  private _revision: number;

  constructor(level: RenderQuality = 'high') {
    this._level = level;
    this._revision = 0;
  }

  /** The active tier. Subsystems map this onto their own knobs. */
  get level(): RenderQuality {
    return this._level;
  }

  set level(value: RenderQuality) {
    if (value === this._level) return;
    this._level = value;
    this._revision++;
  }

  /**
   * Increments whenever the level changes. Consumers cache the value they last
   * built against; see the class note.
   */
  get revision(): number {
    return this._revision;
  }

  /**
   * True when the level has changed since `builtRevision` was captured. A
   * consumer that has never built should pass -1, which is never a valid
   * revision, so its first check always reports a change.
   */
  hasChangedSince(builtRevision: number): boolean {
    return builtRevision !== this._revision;
  }
}
