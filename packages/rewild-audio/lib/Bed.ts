import type { AudioEngine } from './AudioEngine';
import { BusName } from './Buses';
import { createSoundPick } from './SoundBank';

export interface BedSpec {
  /** One sound per layer, from the manifest. */
  sounds: string[];
  bus: BusName;
  /** A filter whose cutoff `set` moves, for example 'lowpass' to darken light rain. */
  filter?: BiquadFilterType;
  /** Seconds to reach a higher gain. */
  attack: number;
  /** Seconds to reach a lower gain. */
  release: number;
}

export type BedState = 'stopped' | 'playing';

/** Seconds at zero gain before a bed stops its sources, at least. */
export const BED_STOP_AFTER = 3;

const SILENT = 1e-4;

/**
 * Equal-power crossfade weights for `count` layers. `blend` runs from 0 (the
 * first layer alone) to `count - 1` (the last alone); between two whole numbers
 * it fades between those two layers.
 */
export function layerWeights(
  blend: number,
  count: number,
  out: Float32Array
): Float32Array {
  out.fill(0, 0, count);
  if (count <= 1) {
    out[0] = 1;
    return out;
  }
  const b = Math.min(count - 1, Math.max(0, blend));
  const low = Math.min(count - 2, Math.floor(b));
  const t = b - low;
  out[low] = Math.cos((t * Math.PI) / 2);
  out[low + 1] = Math.sin((t * Math.PI) / 2);
  return out;
}

/** setTargetAtTime approaches its target exponentially; three time constants is about 95% of the way. */
function timeConstant(seconds: number): number {
  return Math.max(0.005, seconds / 3);
}

interface Layer {
  sound: string;
  gain: GainNode;
  source: AudioBufferSourceNode | null;
}

/**
 * A looping sound whose gain, tone and layer mix follow a game value. Call `set`
 * as often as needed, every frame if the value moves; each change ramps with
 * setTargetAtTime, so it never clicks. Nodes are built on the first `set` after
 * the engine starts, and again if the engine's context changes.
 */
export class Bed {
  readonly spec: BedSpec;

  private _ctx: AudioContext | null = null;
  private _out: GainNode | null = null;
  private _filter: BiquadFilterNode | null = null;
  private _layers: Layer[];
  private _weights: Float32Array;

  private _gain = 0;
  private _cutoff = 20000;
  private _blend = 0;
  private _state: BedState = 'stopped';
  private _waiting = 0;
  private _disposed = false;
  private _stopTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _pick = createSoundPick();

  constructor(private readonly _engine: AudioEngine, spec: BedSpec) {
    this.spec = spec;
    this._layers = spec.sounds.map((sound) => ({
      sound,
      gain: null as unknown as GainNode,
      source: null,
    }));
    this._weights = new Float32Array(spec.sounds.length);
    layerWeights(0, spec.sounds.length, this._weights);
  }

  get gain(): number {
    return this._gain;
  }

  get cutoff(): number {
    return this._cutoff;
  }

  get blend(): number {
    return this._blend;
  }

  get disposed(): boolean {
    return this._disposed;
  }

  get state(): BedState {
    return this._state;
  }

  set(gain: number, cutoff?: number): void {
    if (this._disposed) return;
    if (!this._ensureNodes()) {
      this._gain = gain;
      if (cutoff !== undefined) this._cutoff = cutoff;
      return;
    }
    const ctx = this._ctx!;
    const now = ctx.currentTime;

    if (gain !== this._gain) {
      const rising = gain > this._gain;
      this._gain = gain;
      this._out!.gain.setTargetAtTime(
        gain,
        now,
        timeConstant(rising ? this.spec.attack : this.spec.release)
      );
    }

    if (cutoff !== undefined && cutoff !== this._cutoff) {
      this._cutoff = cutoff;
      this._filter?.frequency.setTargetAtTime(
        cutoff,
        now,
        timeConstant(this.spec.attack)
      );
    }

    if (gain > SILENT) {
      this._cancelStop();
      if (this._waiting > 0) this._startSources();
    } else if (this._state === 'playing' && !this._stopTimer) {
      const delay = Math.max(BED_STOP_AFTER, this.spec.release * 3);
      this._stopTimer = setTimeout(() => {
        this._stopTimer = null;
        this._stopSources();
      }, delay * 1000);
    }
  }

  /** Moves the crossfade across the layers. See `layerWeights`. */
  setBlend(blend: number): void {
    if (this._disposed) return;
    if (blend === this._blend) return;
    this._blend = blend;
    layerWeights(blend, this._layers.length, this._weights);
    if (!this._ctx) return;
    const now = this._ctx.currentTime;
    const tc = timeConstant(this.spec.attack);
    for (let i = 0; i < this._layers.length; i++)
      this._layers[i].gain.gain.setTargetAtTime(this._weights[i], now, tc);
  }

  /** Stops the bed for good, fading out over `fade` seconds. */
  dispose(fade: number = 0): void {
    if (this._disposed) return;
    this._disposed = true;
    this._cancelStop();
    this._engine.forgetBed(this);

    const ctx = this._ctx;
    const out = this._out;
    if (ctx && out && fade > 0 && this._state === 'playing') {
      const now = ctx.currentTime;
      out.gain.setTargetAtTime(0, now, fade / 3);
      for (const layer of this._layers) {
        layer.source?.stop(now + fade);
        layer.source = null;
      }
      setTimeout(() => out.disconnect(), fade * 1000);
    } else {
      this._stopSources();
      out?.disconnect();
    }
    this._state = 'stopped';
    this._ctx = null;
    this._out = null;
    this._filter = null;
  }

  private _ensureNodes(): boolean {
    const ctx = this._engine.context;
    if (!ctx) return false;
    if (ctx === this._ctx) return true;

    const bus = this._engine.bus(this.spec.bus);
    if (!bus) return false;

    this._cancelStop();
    this._state = 'stopped';
    this._waiting = this._layers.length;
    this._ctx = ctx;

    this._out = ctx.createGain();
    this._out.gain.value = 0;
    this._gain = 0;

    let target: AudioNode = this._out;
    if (this.spec.filter) {
      this._filter = ctx.createBiquadFilter();
      this._filter.type = this.spec.filter;
      this._filter.frequency.value = this._cutoff;
      this._out.connect(this._filter);
      target = this._filter;
    } else {
      this._filter = null;
    }
    target.connect(bus);

    for (let i = 0; i < this._layers.length; i++) {
      const layer = this._layers[i];
      layer.source = null;
      layer.gain = ctx.createGain();
      layer.gain.gain.value = this._weights[i];
      layer.gain.connect(this._out);
    }
    return true;
  }

  /** Starts each idle layer whose sound has loaded, at a random point in its loop. */
  private _startSources(): void {
    const ctx = this._ctx!;
    for (const layer of this._layers) {
      if (layer.source || !this._engine.bank.pick(layer.sound, this._pick))
        continue;
      const buffer = this._pick.buffer!;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = this._pick.pitch;
      source.connect(layer.gain);
      source.start(0, Math.random() * buffer.duration);
      layer.source = source;
      this._waiting--;
      this._state = 'playing';
    }
  }

  private _stopSources(): void {
    for (const layer of this._layers) {
      if (!layer.source) continue;
      layer.source.stop();
      layer.source.disconnect();
      layer.source = null;
    }
    this._waiting = this._layers.length;
    this._state = 'stopped';
  }

  private _cancelStop(): void {
    if (!this._stopTimer) return;
    clearTimeout(this._stopTimer);
    this._stopTimer = null;
  }
}
