import {
  DEFAULT_RENDER_QUALITY,
  isQualityAspect,
  isRenderQuality,
  QUALITY_ASPECTS,
  QualityAspect,
  QualityOverrides,
  RenderQuality,
} from './RenderQuality';

/** localStorage key holding the chosen tier. */
const STORAGE_KEY = 'rewild.render.quality';

/** localStorage key holding the per-aspect overrides, as a JSON object. */
const OVERRIDES_STORAGE_KEY = 'rewild.render.quality.overrides';

/**
 * The app-wide render-quality setting.
 *
 * One authority for "how expensive should the renderer be", owned by the
 * Renderer as `renderer.quality`. Every subsystem that scales with quality —
 * all sub systems reads the level from here rather
 * than holding its own copy.
 *
 * A subsystem asks for its own tier with `aspect()` rather than reading `level`
 * directly, so a user who has pinned one of them (clouds on a weak GPU, say)
 * gets that tier while everything else follows the app-wide level.
 *
 * Level and overrides persist to localStorage on every change and are restored
 * on construction, so a reload keeps the chosen settings.
 */
export class QualitySettings {
  private _level: RenderQuality;
  private _overrides: QualityOverrides;
  private _revision: number;

  constructor(fallback: RenderQuality = DEFAULT_RENDER_QUALITY) {
    this._level = readStoredQuality() ?? fallback;
    this._overrides = readStoredOverrides();
    this._revision = 0;
  }

  /**
   * The app-wide tier. Subsystems map this onto their own knobs, unless they
   * carry an override.
   */
  get level(): RenderQuality {
    return this._level;
  }

  set level(value: RenderQuality) {
    this.apply(value);
  }

  /** The per-aspect pins currently in force. Absent entry = follows `level`. */
  get overrides(): Readonly<QualityOverrides> {
    return this._overrides;
  }

  /** Tier one subsystem should build against — its override, else `level`. */
  aspect(aspect: QualityAspect): RenderQuality {
    return this._overrides[aspect] ?? this._level;
  }

  /**
   * Pins one subsystem to its own tier. Passing the app-wide level unpins it
   * rather than recording a redundant override, so an override always means
   * "deliberately different from the level".
   */
  setAspect(aspect: QualityAspect, value: RenderQuality): void {
    if (this.aspect(aspect) === value) return;

    if (value === this._level) delete this._overrides[aspect];
    else this._overrides[aspect] = value;

    this._revision++;
    writeStoredOverrides(this._overrides);
  }

  /**
   * Sets the level and the full set of overrides together, bumping the revision
   * once. What a settings form's Apply should call: writing the fields one at a
   * time would bump the revision per field and rebuild the pipelines several
   * times over for a single click.
   *
   * Overrides not listed are dropped — the argument is the complete new set, not
   * a patch.
   */
  apply(level: RenderQuality, overrides: QualityOverrides = {}): void {
    const next: QualityOverrides = {};
    for (const aspect of QUALITY_ASPECTS) {
      const value = overrides[aspect];
      // An override equal to the level is not an override; keeping it would
      // survive a later level change as a pin the user never asked for.
      if (value && value !== level) next[aspect] = value;
    }

    if (level === this._level && sameOverrides(this._overrides, next)) return;

    this._level = level;
    this._overrides = next;
    this._revision++;
    writeStoredQuality(level);
    writeStoredOverrides(next);
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

function sameOverrides(a: QualityOverrides, b: QualityOverrides): boolean {
  return QUALITY_ASPECTS.every((aspect) => a[aspect] === b[aspect]);
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

/**
 * Stored overrides, keeping only entries that are still a known aspect and a
 * known tier. Anything else — a renamed aspect, hand-edited storage, a value
 * from a build that has since dropped a tier — is dropped rather than handed to
 * a tier table that has no row for it.
 */
function readStoredOverrides(): QualityOverrides {
  const overrides: QualityOverrides = {};

  try {
    const stored = localStorage.getItem(OVERRIDES_STORAGE_KEY);
    if (!stored) return overrides;

    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== 'object') return overrides;

    for (const [key, value] of Object.entries(parsed)) {
      if (isQualityAspect(key) && isRenderQuality(value)) {
        overrides[key] = value;
      }
    }
  } catch {
    // Blocked storage, or JSON that is not JSON — no overrides.
  }

  return overrides;
}

function writeStoredOverrides(overrides: QualityOverrides): void {
  try {
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage full or blocked — the overrides still apply for this session.
  }
}
