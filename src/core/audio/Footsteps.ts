import { RuleSet, RuleSignals } from 'rewild-audio';
import type {
  AudioScope,
  PlayOptions,
  RuleDef,
  RuleLayerDef,
} from 'rewild-audio';
import { MAX_SPLAT_LAYERS } from 'rewild-renderer/lib/renderers/terrain/Biomes';

export interface FootstepSurfaceDef {
  sound: string;
  /** The loop a slide on this surface plays. */
  slide?: string;
  tags?: readonly string[];
}

/** `templates/footsteps.json`: what each ground material sounds like underfoot. */
export interface FootstepsDef {
  /** Terrain material name to surface name. */
  materials: Readonly<Record<string, string>>;
  surfaces: Readonly<Record<string, FootstepSurfaceDef>>;
  /** The surface of a material missing from `materials`, and of ground with no splat. */
  fallback: string;
  rules?: readonly RuleDef[];
}

/** The terrain under the feet. */
export interface FootstepGround {
  readonly splatPalette: readonly string[];
  sampleSplat(x: number, z: number, out: Float32Array): boolean;
}

export const FOOTSTEP_SIGNALS = {
  numbers: ['wetness', 'immersion', 'speed', 'crouching'],
} as const;

/** The tag every surface layer carries, so a rule can act on whatever the ground is. */
export const GROUND_TAG = 'ground';

/** Weight from which a second surface plays along with the strongest. */
export const SECOND_SURFACE_FROM = 0.3;

/** Metres between steps at `STRIDE_SLOW_AT` m/s and at `STRIDE_FAST_AT`, and between them by speed. */
export const STRIDE_SLOW = 2.1;
export const STRIDE_FAST = 4.7;
const STRIDE_SLOW_AT = 3;
const STRIDE_FAST_AT = 15;

/** Share of a stride a player starting from rest walks before the first step. */
export const FIRST_STEP = 0.5;

/** The slide loop of a surface that names none. */
export const DEFAULT_SLIDE = 'slide-crumble';

/** Gain below which a step's sound is not played. */
const QUIETEST = 0.01;

/** Metres between steps at `speed` m/s: longer strides as the player speeds up. */
export function strideLength(speed: number): number {
  const t = (speed - STRIDE_SLOW_AT) / (STRIDE_FAST_AT - STRIDE_SLOW_AT);
  return (
    STRIDE_SLOW + (STRIDE_FAST - STRIDE_SLOW) * Math.min(1, Math.max(0, t))
  );
}

/**
 * The player's footsteps: a step each stride moved on foot, sounding like the
 * ground under it. The terrain's materials there choose the surfaces; the
 * rules change them for what holds everywhere, such as wet ground, wading,
 * speed and crouching. Set `signals` before each `update`; `speed` is set here.
 */
export class Footsteps {
  /** The player's footsteps in the running game, for the console. */
  static current: Footsteps | null = null;

  readonly signals = new RuleSignals(FOOTSTEP_SIGNALS);
  readonly rules: RuleSet;
  readonly surfaceNames: readonly string[];
  /** The slide loop of each surface. */
  readonly slideSounds: readonly string[];
  /** The surface weights under the last step. */
  readonly surfaceWeights: Float32Array;
  ground: FootstepGround | null = null;

  private readonly _fallback: number;
  private readonly _layerGains: Float32Array;
  private readonly _splat = new Float32Array(MAX_SPLAT_LAYERS);
  private readonly _channelSurface = new Int32Array(MAX_SPLAT_LAYERS);
  private readonly _options: PlayOptions = { bus: 'player', gain: 1 };
  private _palette: readonly string[] | null = null;
  private _travelled = 0;

  /** Throws on a fallback, or a material, that names no surface, and on a bad rule. */
  constructor(
    private readonly _def: FootstepsDef,
    private readonly _sink: Pick<AudioScope, 'play'>
  ) {
    const names = Object.keys(_def.surfaces);
    const layers: RuleLayerDef[] = names.map((id) => ({
      id,
      sound: _def.surfaces[id].sound,
      tags: [...(_def.surfaces[id].tags ?? []), GROUND_TAG],
    }));
    this.surfaceNames = names;
    this.slideSounds = names.map(
      (id) => _def.surfaces[id].slide ?? DEFAULT_SLIDE
    );
    this._fallback = names.indexOf(_def.fallback);
    if (this._fallback < 0)
      throw new Error(`footsteps: no surface "${_def.fallback}" for fallback`);
    for (const [material, surface] of Object.entries(_def.materials))
      if (!_def.surfaces[surface])
        throw new Error(`footsteps: no surface "${surface}" for ${material}`);
    this.rules = new RuleSet(this.signals, { layers, rules: _def.rules });
    this.surfaceWeights = new Float32Array(names.length);
    this._layerGains = new Float32Array(names.length);
    this.reset();
  }

  /** Makes the next step come after `FIRST_STEP` of a stride, as from rest. */
  reset(): void {
    this._travelled = STRIDE_SLOW * (1 - FIRST_STEP);
  }

  /**
   * @param distance Metres moved across the ground this frame.
   * @param onFoot   Whether the player walks: on walkable ground, not sliding and not swimming.
   * @param x        Where the feet are.
   * @param z        Where the feet are.
   */
  update(
    distance: number,
    seconds: number,
    onFoot: boolean,
    x: number,
    z: number
  ): void {
    const speed = seconds > 0 ? distance / seconds : 0;
    this.signals.set('speed', speed);
    if (!onFoot || distance <= 0) {
      this.reset();
      return;
    }
    this._travelled += distance;
    const stride = strideLength(speed);
    if (this._travelled < stride) return;
    this._travelled = Math.min(this._travelled - stride, stride);
    this.step(x, z);
  }

  /** Plays one step at (x, z) now. */
  step(x: number, z: number): void {
    const weights = this.surfaceWeights;
    this.weigh(x, z, weights);
    const gains = this._layerGains;
    gains.fill(0);
    let first = this._fallback;
    let second = -1;
    for (let s = 0; s < weights.length; s++) {
      if (weights[s] > weights[first]) {
        second = first;
        first = s;
      } else if (s !== first && (second < 0 || weights[s] > weights[second]))
        second = s;
    }
    gains[first] = 1;
    if (second >= 0 && weights[second] >= SECOND_SURFACE_FROM)
      gains[second] = weights[second] / weights[first];

    const rules = this.rules;
    rules.evaluate(gains);
    for (let s = 0; s < rules.gains.length; s++) {
      const gain = rules.gains[s];
      if (gain < QUIETEST) continue;
      this._options.gain = gain;
      this._sink.play(rules.slotSounds[s], this._options);
    }
  }

  /** Fills `weights`, one per surface, from the splat at (x, z), or the fallback where there is none. */
  weigh(x: number, z: number, weights: Float32Array): void {
    weights.fill(0);
    const ground = this.ground;
    if (!ground || !ground.sampleSplat(x, z, this._splat)) {
      weights[this._fallback] = 1;
      return;
    }
    const palette = ground.splatPalette;
    if (palette !== this._palette) this._mapPalette(palette);
    for (let c = 0; c < MAX_SPLAT_LAYERS; c++)
      weights[this._channelSurface[c]] += this._splat[c];
  }

  private _mapPalette(palette: readonly string[]): void {
    this._palette = palette;
    for (let c = 0; c < MAX_SPLAT_LAYERS; c++) {
      const surface = this._def.materials[palette[c]];
      this._channelSurface[c] =
        surface === undefined
          ? this._fallback
          : this.surfaceNames.indexOf(surface);
    }
  }
}
