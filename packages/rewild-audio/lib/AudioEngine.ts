import { Matrix4, Vector3 } from 'rewild-common';
import { AudioScope } from './AudioScope';
import { Bed, BedSpec } from './Bed';
import { Emitter, EmitterSpec } from './Emitter';
import { BUS_NAMES, BUS_PARENT, BusMix, BusName, dbToGain } from './Buses';
import { MENU_DUCK_DB, OPEN_CUTOFF_HZ } from './constants';
import {
  FileLoader,
  SoundBank,
  SoundManifest,
  createSoundPick,
} from './SoundBank';
import {
  REF_DISTANCE,
  VoiceInfo,
  VoicePool,
  VoiceStart,
  inverseDistanceGain,
} from './VoicePool';

export { MENU_DUCK_DB, OPEN_CUTOFF_HZ };

const PARAM_TIME_CONSTANT = 0.02;
const LISTENER_TIME_CONSTANT = 0.02;
const SILENCE_TIME_CONSTANT = 0.05;

/** Events that count as a user gesture for the browser's autoplay policy. */
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'keydown'] as const;

export type AudioEngineState = AudioContextState | 'idle';

interface OneShot {
  source: AudioBufferSourceNode;
  amp: GainNode;
  owner: number;
}

export interface PlayOptions {
  /** World position. Without it the sound plays in 2D. */
  at?: Vector3;
  bus?: BusName;
  gain?: number;
  /** Seconds from now, on the audio clock. */
  delay?: number;
  /** Low-pass cutoff in Hz. 3D only. */
  cutoff?: number;
  /** How fast a 3D sound fades with distance. 0 leaves the distance curve to the caller. */
  rolloff?: number;
  /** Where to start, as a share of the sound's length from 0 to 1. 3D only. */
  offset?: number;
  /** Seconds to fade in. 3D only. */
  fadeIn?: number;
  /** Multiplies its loudness when voices are ranked, so it is stolen last. 3D only. */
  priority?: number;
}

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
  private readonly _silencers = new Set<string>();
  private readonly _pick = createSoundPick();
  private readonly _beds = new Set<Bed>();
  private _voices: VoicePool | null = null;
  private readonly _listenerPosition = new Vector3(0, 0, 0);
  private readonly _listenerForward = new Vector3(0, 0, -1);
  private readonly _listenerUp = new Vector3(0, 1, 0);
  private readonly _listenerVectors = [
    this._listenerPosition,
    this._listenerForward,
    this._listenerUp,
  ];
  private _listenerParams: AudioParam[] = [];
  private readonly _voiceStart: VoiceStart = {
    pick: this._pick,
    bus: null as unknown as AudioNode,
    x: 0,
    y: 0,
    z: 0,
    gain: 1,
    cutoff: OPEN_CUTOFF_HZ,
    rolloff: 1,
    delay: 0,
    loop: false,
    offset: 0,
    fadeIn: 0,
    priority: 1,
    owner: 0,
  };
  private readonly _oneShots = new Set<OneShot>();
  private _nextScope = 1;
  private readonly _emitters: Emitter[] = [];

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

  /**
   * Plays a sound once: in 3D on a pooled voice when `at` is given, else in 2D.
   * False if the context or the sound is not ready, or every voice is louder.
   */
  play(name: string, options?: PlayOptions, owner: number = 0): boolean {
    if (options?.at) return this._start3d(name, options, false, owner) !== 0;

    const ctx = this._ctx;
    if (!ctx || !this._buses || !this.bank.pick(name, this._pick)) return false;

    const source = ctx.createBufferSource();
    source.buffer = this._pick.buffer;
    source.playbackRate.value = this._pick.pitch;
    const amp = ctx.createGain();
    amp.gain.value = this._pick.gain * (options?.gain ?? 1);
    source.connect(amp).connect(this._buses[options?.bus ?? 'effects']);
    const shot: OneShot = { source, amp, owner };
    this._oneShots.add(shot);
    source.onended = () => {
      amp.disconnect();
      this._oneShots.delete(shot);
    };
    source.start(ctx.currentTime + Math.max(0, options?.delay ?? 0));
    return true;
  }

  /** Loops a sound at a world position until `stop`. Returns its id, or 0 if it did not start. */
  loop(
    name: string,
    options: PlayOptions & { at: Vector3 },
    owner: number = 0
  ): number {
    return this._start3d(name, options, true, owner);
  }

  /** A group of sounds that stop together. See `AudioScope`. */
  createScope(): AudioScope {
    return new AudioScope(this, this._nextScope++);
  }

  /** Fades out every sound started with this owner. Used by `AudioScope.dispose`. */
  stopOwner(owner: number, fade: number): void {
    this._voices?.stopOwner(owner, fade);
    const ctx = this._ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const shot of this._oneShots) {
      if (shot.owner !== owner) continue;
      shot.amp.gain.setTargetAtTime(0, now, Math.max(fade, 0.005) / 3);
      shot.source.stop(now + fade);
    }
  }

  get oneShotsPlaying(): number {
    return this._oneShots.size;
  }

  /** Moves a 3D sound. False once it has ended or lost its voice. */
  move(id: number, at: Vector3): boolean {
    return !!this._voices?.move(id, at.x, at.y, at.z);
  }

  /** Moves a 3D sound's gain and cutoff over `timeConstant` seconds. */
  setVoiceLevel(
    id: number,
    gain: number,
    cutoff: number,
    timeConstant: number
  ): boolean {
    return !!this._voices?.setLevel(id, gain, cutoff, timeConstant);
  }

  /** A 3D sound that belongs to a place. See `Emitter`. */
  createEmitter(spec: EmitterSpec): Emitter {
    const emitter = new Emitter(this, spec);
    this._emitters.push(emitter);
    return emitter;
  }

  get emitters(): readonly Emitter[] {
    return this._emitters;
  }

  /** Called by `Emitter.dispose`. */
  forgetEmitter(emitter: Emitter): void {
    const i = this._emitters.indexOf(emitter);
    if (i >= 0) this._emitters.splice(i, 1);
  }

  /** Call once a frame, after the listener moves. Lets emitters take and give back voices. */
  update(): void {
    const emitters = this._emitters;
    for (let i = 0; i < emitters.length; i++) emitters[i].update();
  }

  /** The distance curve at the listener for a 3D sound at this point. */
  distanceGain(at: Vector3, rolloff: number): number {
    const d = this._listenerPosition.distanceTo(at);
    return inverseDistanceGain(d, REF_DISTANCE, rolloff);
  }

  /** Fades a 3D sound out over `fade` seconds. */
  stop(id: number, fade: number = 0.05): boolean {
    return !!this._voices?.stop(id, fade);
  }

  isPlaying(id: number): boolean {
    return !!this._voices?.isPlaying(id);
  }

  get voiceCount(): number {
    return this._voices?.size ?? 0;
  }

  get voicesInUse(): number {
    return this._voices?.inUse ?? 0;
  }

  /** 'equalpower' pans by level only: a sound to the side plays in one speaker. */
  setPanningModel(model: PanningModelType): void {
    this._voices?.setPanningModel(model);
  }

  get panningModel(): PanningModelType {
    return this._voices?.panningModel ?? 'HRTF';
  }

  voices(): VoiceInfo[] {
    return this._voices?.voices() ?? [];
  }

  /** Listener position, forward and up, in world space. */
  setListener(position: Vector3, forward: Vector3, up: Vector3): void {
    this._listenerPosition.copy(position);
    this._listenerForward.copy(forward);
    this._listenerUp.copy(up);
    this._listenerMoved();
  }

  /** Sets the listener from a world matrix, such as a camera's `matrixWorld`. */
  setListenerFromMatrix(m: Matrix4): void {
    const e = m.elements;
    this._listenerPosition.setFromMatrixPosition(m);
    this._listenerForward.set(-e[8], -e[9], -e[10]);
    this._listenerUp.set(e[4], e[5], e[6]);
    this._listenerMoved();
  }

  get listenerPosition(): Readonly<Vector3> {
    return this._listenerPosition;
  }

  get listenerForward(): Readonly<Vector3> {
    return this._listenerForward;
  }

  get listenerUp(): Readonly<Vector3> {
    return this._listenerUp;
  }

  private _start3d(
    name: string,
    options: PlayOptions,
    loop: boolean,
    owner: number
  ): number {
    if (!this._voices || !this._buses || !this.bank.pick(name, this._pick))
      return 0;
    const at = options.at!;
    const s = this._voiceStart;
    s.bus = this._buses[options.bus ?? 'effects'];
    s.x = at.x;
    s.y = at.y;
    s.z = at.z;
    s.gain = options.gain ?? 1;
    s.cutoff = options.cutoff ?? OPEN_CUTOFF_HZ;
    s.rolloff = options.rolloff ?? 1;
    s.delay = options.delay ?? 0;
    s.loop = loop;
    s.offset = options.offset ?? 0;
    s.fadeIn = options.fadeIn ?? 0;
    s.priority = options.priority ?? 1;
    s.owner = owner;
    return this._voices.start(name, s);
  }

  private _listenerMoved(): void {
    const p = this._listenerPosition;
    this._voices?.setListenerPosition(p.x, p.y, p.z);
    if (this._ctx) this._applyListener(false);
  }

  /** Writes position, forward and up to the context's listener, in that order. */
  private _applyListener(jump: boolean): void {
    const now = this._ctx!.currentTime;
    const params = this._listenerParams;
    for (let i = 0; i < 3; i++) {
      const v = this._listenerVectors[i];
      this._setListenerParam(params[i * 3], v.x, now, jump);
      this._setListenerParam(params[i * 3 + 1], v.y, now, jump);
      this._setListenerParam(params[i * 3 + 2], v.z, now, jump);
    }
  }

  private _setListenerParam(
    param: AudioParam,
    value: number,
    now: number,
    jump: boolean
  ): void {
    if (jump) param.value = value;
    else param.setTargetAtTime(value, now, LISTENER_TIME_CONSTANT);
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

  /**
   * Suspends the context while `doc` is hidden, such as in a background tab,
   * if `when` allows it at that moment. Showing the document always resumes.
   */
  suspendWhenHidden(
    doc: Document,
    when: () => boolean = () => true
  ): () => void {
    const onChange = () => {
      if (doc.visibilityState !== 'hidden') this.resume();
      else if (when()) this.suspend();
    };
    doc.addEventListener('visibilitychange', onChange);
    return () => doc.removeEventListener('visibilitychange', onChange);
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
    this._voices = null;
    this._listenerParams = [];
    this._oneShots.clear();
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

  /**
   * Silences the master for a named reason, such as 'background' or 'editor',
   * apart from the mixer's volume and mute so neither undoes the other. The
   * master is silent while any reason holds.
   */
  setSilenced(reason: string, silenced: boolean): void {
    if (silenced === this._silencers.has(reason)) return;
    if (silenced) this._silencers.add(reason);
    else this._silencers.delete(reason);
    this._applyBusGains(SILENCE_TIME_CONSTANT);
  }

  /** Whether `reason` silences the master, or with no reason, whether any does. */
  isSilenced(reason?: string): boolean {
    return reason === undefined
      ? this._silencers.size > 0
      : this._silencers.has(reason);
  }

  get silencedBy(): string[] {
    return [...this._silencers];
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
      buses[name].gain.value = this._busGain(name);
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

    const listener = ctx.listener;
    this._listenerParams = [
      listener.positionX,
      listener.positionY,
      listener.positionZ,
      listener.forwardX,
      listener.forwardY,
      listener.forwardZ,
      listener.upX,
      listener.upY,
      listener.upZ,
    ];
    this._applyListener(true);
    this._voices = new VoicePool(ctx);
    const p = this._listenerPosition;
    this._voices.setListenerPosition(p.x, p.y, p.z);

    this.bank.decode(ctx);
  }

  private _applyBusGains(timeConstant: number = PARAM_TIME_CONSTANT): void {
    if (!this._ctx || !this._buses) return;
    const t = this._ctx.currentTime;
    for (const name of BUS_NAMES)
      this._buses[name].gain.setTargetAtTime(
        this._busGain(name),
        t,
        timeConstant
      );
  }

  private _busGain(name: BusName): number {
    if (name === 'master' && this._silencers.size > 0) return 0;
    return this.mix.gain(name);
  }
}
