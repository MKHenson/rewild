import { Vector3 } from 'rewild-common';
import { OPEN_CUTOFF_HZ } from './constants';
import { SoundPick } from './SoundBank';

export const VOICE_COUNT = 24;
export const REF_DISTANCE = 2;
export const MAX_DISTANCE = 10000;
const MOVE_TIME_CONSTANT = 0.02;

/**
 * The gain an inverse-distance panner gives at `distance`, the same curve as
 * PannerNode's 'inverse' model. Used to rank voices by how loud they are heard.
 */
export function inverseDistanceGain(
  distance: number,
  refDistance: number,
  rolloff: number
): number {
  const d = Math.max(distance, refDistance);
  return refDistance / (refDistance + rolloff * (d - refDistance));
}

export interface VoiceStart {
  pick: SoundPick;
  bus: AudioNode;
  x: number;
  y: number;
  z: number;
  gain: number;
  cutoff: number;
  rolloff: number;
  delay: number;
  loop: boolean;
  /** Where to start, as a share of the sound's length from 0 to 1. */
  offset: number;
  /** Seconds to fade in. 0 starts at full gain. */
  fadeIn: number;
  /** Multiplies the loudness used to rank voices, so a high priority is stolen last. */
  priority: number;
  /** The scope that started it, or 0. See `stopOwner`. */
  owner: number;
  /** The panning model, or null for the pool's default. */
  panning: PanningModelType | null;
}

interface Voice {
  id: number;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
  bus: AudioNode | null;
  source: AudioBufferSourceNode | null;
  name: string;
  level: number;
  /** The gain picked from the manifest's range when it started. */
  picked: number;
  rolloff: number;
  priority: number;
  owner: number;
  panning: PanningModelType | null;
  x: number;
  y: number;
  z: number;
}

export interface VoiceInfo {
  id: number;
  name: string;
  at: Vector3;
  /** The voice's gain times its distance curve at the listener. */
  loudness: number;
  priority: number;
}

/**
 * A fixed set of 3D voices. Each has its own low-pass, gain and panner, built
 * once per context, so a play allocates only its buffer source. A voice pans
 * with its sound's model, or the pool's default, HRTF. When
 * every voice is busy, a new sound takes the one heard quietest, or does not
 * play if it would be quieter still.
 */
export class VoicePool {
  private readonly _voices: Voice[] = [];
  private _nextId = 1;
  private _lx = 0;
  private _ly = 0;
  private _lz = 0;
  private _defaultPanning: PanningModelType = 'HRTF';

  constructor(
    private readonly _ctx: AudioContext,
    count: number = VOICE_COUNT
  ) {
    for (let i = 0; i < count; i++) {
      const filter = _ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = OPEN_CUTOFF_HZ;
      const gain = _ctx.createGain();
      const panner = _ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = REF_DISTANCE;
      panner.maxDistance = MAX_DISTANCE;
      filter.connect(gain).connect(panner);
      this._voices.push({
        id: 0,
        filter,
        gain,
        panner,
        bus: null,
        source: null,
        name: '',
        level: 0,
        picked: 1,
        rolloff: 1,
        priority: 1,
        owner: 0,
        panning: null,
        x: 0,
        y: 0,
        z: 0,
      });
    }
  }

  get size(): number {
    return this._voices.length;
  }

  get inUse(): number {
    let n = 0;
    for (const v of this._voices) if (v.id) n++;
    return n;
  }

  /** The model for sounds that name none. Voices playing such a sound change
   *  at once. */
  setPanningModel(model: PanningModelType): void {
    this._defaultPanning = model;
    for (const v of this._voices) if (!v.panning) v.panner.panningModel = model;
  }

  get panningModel(): PanningModelType {
    return this._defaultPanning;
  }

  /** The listener position, used to rank voices by loudness. */
  setListenerPosition(x: number, y: number, z: number): void {
    this._lx = x;
    this._ly = y;
    this._lz = z;
  }

  /** Starts a sound on a voice. Returns its id, or 0 when every voice is louder. */
  start(name: string, s: VoiceStart): number {
    const level = s.gain * s.pick.gain;
    const voice = this._choose(
      level * this._distanceGain(s.x, s.y, s.z, s.rolloff) * s.priority
    );
    if (!voice) return 0;
    this._release(voice);

    const ctx = this._ctx;
    const now = ctx.currentTime;
    voice.id = this._nextId++;
    voice.name = name;
    voice.level = level;
    voice.picked = s.pick.gain;
    voice.rolloff = s.rolloff;
    voice.priority = s.priority;
    voice.owner = s.owner;
    voice.panning = s.panning;
    const model = s.panning ?? this._defaultPanning;
    if (voice.panner.panningModel !== model) voice.panner.panningModel = model;

    voice.filter.frequency.cancelScheduledValues(now);
    voice.filter.frequency.value = s.cutoff;
    const start = now + Math.max(0, s.delay);
    voice.gain.gain.cancelScheduledValues(now);
    if (s.fadeIn > 0) {
      voice.gain.gain.value = 0;
      voice.gain.gain.setTargetAtTime(level, start, s.fadeIn / 3);
    } else {
      voice.gain.gain.value = level;
    }
    voice.panner.rolloffFactor = s.rolloff;
    this._place(voice, s.x, s.y, s.z, true);

    if (voice.bus !== s.bus) {
      if (voice.bus) voice.panner.disconnect();
      voice.panner.connect(s.bus);
      voice.bus = s.bus;
    }

    const source = ctx.createBufferSource();
    source.buffer = s.pick.buffer;
    source.loop = s.loop;
    source.playbackRate.value = s.pick.pitch;
    source.connect(voice.filter);
    source.onended = () => {
      if (voice.source === source) this._release(voice);
    };
    const buffer = s.pick.buffer!;
    source.start(start, Math.min(Math.max(s.offset, 0), 1) * buffer.duration);
    voice.source = source;
    return voice.id;
  }

  move(id: number, x: number, y: number, z: number): boolean {
    const voice = this._find(id);
    if (!voice) return false;
    this._place(voice, x, y, z, false);
    return true;
  }

  /** Moves a voice's gain and cutoff, over `timeConstant` seconds. */
  setLevel(
    id: number,
    gain: number,
    cutoff: number,
    timeConstant: number
  ): boolean {
    const voice = this._find(id);
    if (!voice) return false;
    const now = this._ctx.currentTime;
    voice.level = gain * voice.picked;
    voice.gain.gain.setTargetAtTime(voice.level, now, timeConstant);
    voice.filter.frequency.setTargetAtTime(cutoff, now, timeConstant);
    return true;
  }

  /** Fades a voice out over `fade` seconds, then frees it. */
  stop(id: number, fade: number): boolean {
    const voice = this._find(id);
    if (!voice || !voice.source) return false;
    const now = this._ctx.currentTime;
    if (fade > 0) {
      voice.gain.gain.setTargetAtTime(0, now, fade / 3);
      voice.source.stop(now + fade);
    } else {
      voice.source.stop();
    }
    voice.level = 0;
    return true;
  }

  /** Fades out every voice started by `owner`. */
  stopOwner(owner: number, fade: number): void {
    for (const v of this._voices)
      if (v.id && v.owner === owner) this.stop(v.id, fade);
  }

  isPlaying(id: number): boolean {
    return !!this._find(id);
  }

  voices(): VoiceInfo[] {
    const out: VoiceInfo[] = [];
    for (const v of this._voices) {
      if (!v.id) continue;
      const { id, name, x, y, z, priority } = v;
      const loudness = v.level * this._distanceGain(x, y, z, v.rolloff);
      out.push({ id, name, at: new Vector3(x, y, z), loudness, priority });
    }
    return out;
  }

  stopAll(): void {
    for (const v of this._voices) this._release(v);
  }

  private _find(id: number): Voice | null {
    if (!id) return null;
    for (const v of this._voices) if (v.id === id) return v;
    return null;
  }

  /** A free voice, or the quietest busy one if `loudness` beats it. */
  private _choose(loudness: number): Voice | null {
    let quietest: Voice | null = null;
    let quietestLoudness = Infinity;
    for (const v of this._voices) {
      if (!v.id) return v;
      const l = this._loudness(v);
      if (l < quietestLoudness) {
        quietest = v;
        quietestLoudness = l;
      }
    }
    return loudness > quietestLoudness ? quietest : null;
  }

  /** Loudness for ranking: heard gain times priority. */
  private _loudness(v: Voice): number {
    return v.level * this._distanceGain(v.x, v.y, v.z, v.rolloff) * v.priority;
  }

  private _distanceGain(x: number, y: number, z: number, rolloff: number) {
    const d = Math.hypot(x - this._lx, y - this._ly, z - this._lz);
    return inverseDistanceGain(d, REF_DISTANCE, rolloff);
  }

  /** A new sound jumps to its place; a moving one glides, so the panner does not click. */
  private _place(voice: Voice, x: number, y: number, z: number, jump: boolean) {
    voice.x = x;
    voice.y = y;
    voice.z = z;
    const p = voice.panner;
    if (jump) {
      const now = this._ctx.currentTime;
      p.positionX.cancelScheduledValues(now);
      p.positionY.cancelScheduledValues(now);
      p.positionZ.cancelScheduledValues(now);
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
      return;
    }
    const now = this._ctx.currentTime;
    p.positionX.setTargetAtTime(x, now, MOVE_TIME_CONSTANT);
    p.positionY.setTargetAtTime(y, now, MOVE_TIME_CONSTANT);
    p.positionZ.setTargetAtTime(z, now, MOVE_TIME_CONSTANT);
  }

  private _release(voice: Voice): void {
    const source = voice.source;
    voice.source = null;
    voice.id = 0;
    voice.level = 0;
    if (!source) return;
    source.onended = null;
    source.stop();
    source.disconnect();
  }
}
