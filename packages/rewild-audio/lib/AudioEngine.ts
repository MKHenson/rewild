import { Bed, BedSpec } from './Bed';
import { BUS_NAMES, BUS_PARENT, BusMix, BusName, dbToGain } from './Buses';
import {
  FileLoader,
  SoundBank,
  SoundManifest,
  createSoundPick,
} from './SoundBank';

export const MENU_DUCK_DB = -12;
export const OPEN_CUTOFF_HZ = 20000;
const PARAM_TIME_CONSTANT = 0.02;

/** Events that count as a user gesture for the browser's autoplay policy. */
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'keydown'] as const;

export type AudioEngineState = AudioContextState | 'idle';

/**
 * Owns the AudioContext and the bus graph:
 *
 * ambience, weather, effects → world → muffle → menu duck ─┐
 * player, music, ui ───────────────────────────────────────┼→ master → compressor → out
 *
 * Construct it freely; the context is only created by `start()`, which must run
 * inside a user gesture. `startOnGesture` does that on the first one.
 */
export class AudioEngine {
  readonly mix = new BusMix();
  readonly bank: SoundBank;

  private _ctx: AudioContext | null = null;
  private _buses: Record<BusName, GainNode> | null = null;
  private _muffleFilter: BiquadFilterNode;
  private _muffleGain: GainNode;
  private _duck: GainNode;
  private _compressor: DynamicsCompressorNode;

  private _muffleCutoff = OPEN_CUTOFF_HZ;
  private _muffleLevel = 1;
  private _ducked = false;
  private readonly _pick = createSoundPick();
  private readonly _beds = new Set<Bed>();

  /** `resolveUrl` turns a manifest file path into the URL to fetch. */
  constructor(resolveUrl?: (path: string) => string, loadFile?: FileLoader) {
    this.bank = new SoundBank(resolveUrl, loadFile);
  }

  get context(): AudioContext | null {
    return this._ctx;
  }

  get state(): AudioEngineState {
    return this._ctx ? this._ctx.state : 'idle';
  }

  get muffleCutoff(): number {
    return this._muffleCutoff;
  }

  get muffleLevel(): number {
    return this._muffleLevel;
  }

  get ducked(): boolean {
    return this._ducked;
  }

  /** Bus input node for sources to connect to. Null before `start()`. */
  bus(name: BusName): GainNode | null {
    return this._buses ? this._buses[name] : null;
  }

  /** Downloads the manifest's files now and decodes them once the context exists. */
  loadSounds(manifest: SoundManifest): Promise<void> {
    this.bank.setManifest(manifest);
    return this._ctx ? this.bank.decode(this._ctx) : Promise.resolve();
  }

  createBed(spec: BedSpec): Bed {
    const bed = new Bed(this, spec);
    this._beds.add(bed);
    return bed;
  }

  /** Every bed not yet disposed. */
  get beds(): ReadonlySet<Bed> {
    return this._beds;
  }

  /** Called by `Bed.dispose`. */
  forgetBed(bed: Bed): void {
    this._beds.delete(bed);
  }

  /** Plays a sound once, in 2D, on a bus. False if the context or the sound is not ready. */
  play(name: string, bus: BusName = 'effects', gain: number = 1): boolean {
    const ctx = this._ctx;
    if (!ctx || !this._buses || !this.bank.pick(name, this._pick)) return false;

    const source = ctx.createBufferSource();
    source.buffer = this._pick.buffer;
    source.playbackRate.value = this._pick.pitch;
    const amp = ctx.createGain();
    amp.gain.value = this._pick.gain * gain;
    source.connect(amp).connect(this._buses[bus]);
    source.onended = () => amp.disconnect();
    source.start();
    return true;
  }

  async start(): Promise<void> {
    if (!this._ctx || this._ctx.state === 'closed') this._build();
    if (this._ctx!.state === 'suspended') await this._ctx!.resume();
  }

  /**
   * Starts the engine on the first user gesture on `target`. Listens until the
   * context is running, since a gesture the browser does not accept leaves it
   * suspended.
   */
  startOnGesture(target: EventTarget): void {
    const onGesture = () => {
      this.start().then(
        () => {
          if (this.state !== 'running') return;
          for (const type of GESTURE_EVENTS)
            target.removeEventListener(type, onGesture, { capture: true });
        },
        (e) => console.error('Audio failed to start', e)
      );
    };
    for (const type of GESTURE_EVENTS)
      target.addEventListener(type, onGesture, { capture: true });
  }

  async suspend(): Promise<void> {
    if (this._ctx?.state === 'running') await this._ctx.suspend();
  }

  async resume(): Promise<void> {
    if (this._ctx?.state === 'suspended') await this._ctx.resume();
  }

  async close(): Promise<void> {
    const ctx = this._ctx;
    this._ctx = null;
    this._buses = null;
    if (ctx && ctx.state !== 'closed') await ctx.close();
  }

  setVolume(bus: BusName, volume: number): void {
    this.mix.setVolume(bus, volume);
    this._applyBusGains();
  }

  setMuted(bus: BusName, muted: boolean): void {
    this.mix.setMuted(bus, muted);
    this._applyBusGains();
  }

  setSolo(bus: BusName | null): void {
    this.mix.solo = bus;
    this._applyBusGains();
  }

  /** Low-pass and gain on the world bus, for under water and death. */
  muffleWorld(cutoffHz: number, level: number, timeConstant: number): void {
    this._muffleCutoff = cutoffHz;
    this._muffleLevel = level;
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    this._muffleFilter.frequency.setTargetAtTime(cutoffHz, t, timeConstant);
    this._muffleGain.gain.setTargetAtTime(level, t, timeConstant);
  }

  duckWorld(ducked: boolean, timeConstant: number = 0.15): void {
    this._ducked = ducked;
    if (!this._ctx) return;
    this._duck.gain.setTargetAtTime(
      ducked ? dbToGain(MENU_DUCK_DB) : 1,
      this._ctx.currentTime,
      timeConstant
    );
  }

  private _build(): void {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this._ctx = ctx;

    const buses = {} as Record<BusName, GainNode>;
    for (const name of BUS_NAMES) {
      buses[name] = ctx.createGain();
      buses[name].gain.value = this.mix.gain(name);
    }
    this._buses = buses;

    this._muffleFilter = ctx.createBiquadFilter();
    this._muffleFilter.type = 'lowpass';
    this._muffleFilter.frequency.value = this._muffleCutoff;
    this._muffleGain = ctx.createGain();
    this._muffleGain.gain.value = this._muffleLevel;
    this._duck = ctx.createGain();
    this._duck.gain.value = this._ducked ? dbToGain(MENU_DUCK_DB) : 1;

    this._compressor = ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -6;
    this._compressor.knee.value = 6;
    this._compressor.ratio.value = 12;
    this._compressor.attack.value = 0.003;
    this._compressor.release.value = 0.25;

    for (const name of BUS_NAMES) {
      const parent = BUS_PARENT[name];
      if (parent && name !== 'world') buses[name].connect(buses[parent]);
    }

    buses.world
      .connect(this._muffleFilter)
      .connect(this._muffleGain)
      .connect(this._duck)
      .connect(buses.master);

    buses.master.connect(this._compressor).connect(ctx.destination);

    this.bank.decode(ctx);
  }

  private _applyBusGains(): void {
    if (!this._ctx || !this._buses) return;
    const t = this._ctx.currentTime;
    for (const name of BUS_NAMES)
      this._buses[name].gain.setTargetAtTime(
        this.mix.gain(name),
        t,
        PARAM_TIME_CONSTANT
      );
  }
}
