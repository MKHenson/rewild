import {
  DEFAULT_RENDER_QUALITY,
  isRenderQuality,
  RenderQuality,
} from './RenderQuality';

/** localStorage key holding the chosen tier. */
const STORAGE_KEY = 'rewild.render.quality';

/**
 * The app-wide render-quality setting.
 *
 * One authority for "how expensive should the renderer be", owned by the
 * Renderer as `renderer.quality`. Every subsystem that scales with quality —
 * all sub systems reads the level from here rather
 * than holding its own copy.
 *
 * The level persists to localStorage on every change and is restored on
 * construction, so a reload keeps the chosen tier.
 */
export class QualitySettings {
  private _level: RenderQuality;
  private _revision: number;

  constructor(fallback: RenderQuality = DEFAULT_RENDER_QUALITY) {
    this._level = readStoredQuality() ?? fallback;
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
    writeStoredQuality(value);
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

/** Stored tier, or null when absent, unreadable or no longer a valid tier. */
function readStoredQuality(): RenderQuality | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // isRenderQuality also rejects a tier written by an older build that has
    // since been renamed or removed, which would otherwise index a tier table
    // with a key it has no row for.
    return isRenderQuality(stored) ? stored : null;
  } catch {
    // Storage blocked (private mode) or unavailable — fall back to the default.
    return null;
  }
}

function writeStoredQuality(level: RenderQuality): void {
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Storage full or blocked — the level still applies for this session.
  }
}
