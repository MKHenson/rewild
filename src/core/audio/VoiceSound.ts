import { OPEN_CUTOFF_HZ, RuleSet, RuleSignals } from 'rewild-audio';
import type { AudioScope, Bed, PlayOptions, RuleSetDef } from 'rewild-audio';
import { UNDER_WATER_CUTOFF, UNDER_WATER_LEVEL } from './UnderWaterSound';

/** `templates/voice.json`: the breathing and body sounds, and the rules that pick them. */
export interface VoiceDef extends RuleSetDef {
  /** Layers that play now and then as one-shots, not as loops: seconds between, [min, max]. */
  every?: Readonly<Record<string, readonly [number, number]>>;
  /** Loops that come and go in bouts: seconds each bout lasts, and seconds between, [min, max]. */
  bouts?: Readonly<Record<string, VoiceBoutDef>>;
}

export interface VoiceBoutDef {
  on: readonly [number, number];
  off: readonly [number, number];
}

/** Seconds by e a bout takes to swell in and to fade away. */
export const BOUT_FADE = 1.2;

export const VOICE_SIGNALS = {
  numbers: [
    'effort',
    'breathHeld',
    'heat',
    'cold',
    'health',
    'hurt',
    'hunger',
    'swimming',
    'under',
  ],
} as const;

/** The tag of layers the mouth makes. They fall silent while the voice says something. */
export const MOUTH_TAG = 'mouth';

/** What the mouth is saying, highest first. A higher sound cuts in over a lower one. */
export const VoicePriority = {
  Death: 4,
  Gasp: 3,
  Pain: 2,
  Strain: 1,
  Breath: 0,
} as const;

/** Seconds by e effort takes to rise toward the stamina spent, and to settle back. */
export const EFFORT_RISE = 0.5;
export const EFFORT_FALL = 4;

/** Seconds by e `hurt` takes to fade, and the damage that fills it. */
const HURT_FADE = 3;
const HURT_FULL = 50;

/** Damage, gathered over `PAIN_GATHER` seconds by e, from which the player grunts. */
export const PAIN_FROM = 4;
const PAIN_GATHER = 0.3;
/** Damage from which a grunt is a medium one, and a cry. */
export const PAIN_MEDIUM_AT = 15;
export const PAIN_BIG_AT = 40;
/** Seconds after a grunt before the next. */
export const PAIN_GAP = 1.2;

/** Share of the breath used from which coming up gasps, a medium gasp, and a big one. */
export const GASP_FROM = 0.03;
export const GASP_MEDIUM_AT = 0.35;
export const GASP_BIG_AT = 0.7;
/** Windiness above which every gasp is a big one: a rough sea leaves no easy breath. */
export const GASP_ROUGH_SEA = 0.7;
/** Share of the breath left below which the player strains under water. */
export const STRAIN_BELOW = 0.33;
/** Seconds between strains under water. */
export const STRAIN_EVERY = 6;

/** Seconds after a stroke the swimmer breathes, between pulls rather than on the splash. */
export const SWIM_BREATH_DELAY = 0.35;
/** Gain of a swim breath at rest; it rises to 1 as the player tires. */
const SWIM_BREATH_GAIN = 0.7;

/** Seconds a sound cut by a higher one fades over. */
const MOUTH_CUT = 0.08;

/** Gain below which a now-and-then sound does not play. */
const QUIETEST = 0.05;

export type PainSoundName = 'pain-small' | 'pain-medium' | 'pain-big';
export type GaspSoundName = 'gasp-small' | 'gasp-medium' | 'gasp-big';

/** The most each bout of effort bends its curve either way, as a power, so the breath changes at a different point each time. */
export const EFFORT_BEND = 1.6;
/** Effort below which the player has recovered, and the next bout bends its own way. */
const RECOVERED = 0.05;

/**
 * The effort `spent` 0..1 of the stamina gives, bent by `bend`: above 1 the
 * breath holds calm for longer, below 1 it gives sooner. Empty is always 1.
 */
export function staminaEffort(spent: number, bend: number): number {
  return Math.pow(Math.min(1, Math.max(0, spent)), bend);
}

/** `effort` after `seconds` easing toward `target`: quicker to rise than to settle. */
export function easeEffort(
  effort: number,
  target: number,
  seconds: number
): number {
  const tau = target > effort ? EFFORT_RISE : EFFORT_FALL;
  return target + (effort - target) * Math.exp(-seconds / tau);
}

/** The grunt for `damage` taken at once, or null for none. */
export function painSound(damage: number): PainSoundName | null {
  if (damage < PAIN_FROM) return null;
  if (damage < PAIN_MEDIUM_AT) return 'pain-small';
  return damage < PAIN_BIG_AT ? 'pain-medium' : 'pain-big';
}

/** The gasp on coming up with `used` 0..1 of the breath gone, or null for none. */
export function gaspSound(used: number): GaspSoundName | null {
  if (used < GASP_FROM) return null;
  if (used < GASP_MEDIUM_AT) return 'gasp-small';
  return used < GASP_BIG_AT ? 'gasp-medium' : 'gasp-big';
}

/** The effort a gasp with `used` 0..1 of the breath gone leaves, so hard breaths follow a long dive. */
export function recoveryEffort(used: number): number {
  return Math.min(1, Math.max(0, used));
}

/** What the voice reads each frame. */
export interface VoiceInput {
  swimming: boolean;
  cameraUnderWater: boolean;
  /** 0..1: the share of the breath left. */
  oxygen: number;
  /** 0..1: the sky's windiness. */
  windiness: number;
  /** 0..1: the share of the stamina left. */
  stamina: number;
  /** How hot or cold the body is: 0 normal, 1 really hot, -1 really cold. */
  bodyTemperature: number;
  health: number;
  hunger: number;
}

/**
 * The player's breath and voice: how the body is doing. It keeps the body
 * values (`breathHeld`, `hurt`), takes `effort` from the stamina spent, bent
 * a new way each bout so the breath changes at a different point, and
 * `heat` and `cold` from the body's temperature, and feeds them to
 * the rules in `voice.json`, which pick the breathing loops and the
 * now-and-then sounds. The mouth says one thing at a time, by
 * `VoicePriority`: a gasp on surfacing, a pain grunt, a strain under water,
 * or a breath. A higher one cuts in over a lower one, and the breathing
 * loops fall silent while it speaks. With the head under water it is
 * muffled as the world is. On the player bus, in 2D.
 */
export class VoiceSound {
  /** The player's voice in the running game, for the console. */
  static current: VoiceSound | null = null;

  random: () => number = Math.random;

  readonly signals = new RuleSignals(VOICE_SIGNALS);
  readonly rules: RuleSet;
  effort = 0;
  /** This bout's bend on the effort curve. See `staminaEffort`. */
  effortBend = 1;
  breathHeld = 0;
  heat = 0;
  cold = 0;
  hurt = 0;

  private readonly _beds: (Bed | null)[];
  private readonly _mouthSlots: Uint8Array;
  private readonly _everyMin: Float32Array;
  private readonly _everyMax: Float32Array;
  private readonly _next: Float32Array;
  private readonly _bouts: (VoiceBoutDef | null)[];
  private readonly _boutOn: Uint8Array;
  private readonly _boutLeft: Float32Array;
  private readonly _boutLevel: Float32Array;
  private readonly _mouth: AudioScope;
  private readonly _options: PlayOptions = {
    bus: 'player',
    gain: 1,
    cutoff: OPEN_CUTOFF_HZ,
    delay: 0,
  };
  private readonly _bubbles: PlayOptions = { bus: 'effects', gain: 1 };
  private _speaking = -1;
  private _speakFor = 0;
  private _wasUnder = false;
  private _under = false;
  private _health = NaN;
  private _damage = 0;
  private _painWait = 0;
  private _strainIn = 0;

  /** Throws on a bad rule, and on an `every` or a bout that names no layer. */
  constructor(def: VoiceDef, private readonly _scope: AudioScope) {
    const rules = new RuleSet(this.signals, def);
    this.rules = rules;
    const count = rules.slotIds.length;
    this._everyMin = new Float32Array(count);
    this._everyMax = new Float32Array(count);
    this._next = new Float32Array(count).fill(NaN);
    for (const [id, [min, max]] of Object.entries(def.every ?? {})) {
      let found = false;
      rules.slotIds.forEach((slot, i) => {
        if (slot !== id) return;
        found = true;
        this._everyMin[i] = min;
        this._everyMax[i] = max;
        this._next[i] = min + (max - min) * this.random();
      });
      if (!found) throw new Error(`voice: every names no layer "${id}"`);
    }
    this._bouts = rules.slotIds.map(() => null);
    this._boutOn = new Uint8Array(count);
    this._boutLeft = new Float32Array(count);
    this._boutLevel = new Float32Array(count);
    for (const [id, bout] of Object.entries(def.bouts ?? {})) {
      let found = false;
      rules.slotIds.forEach((slot, i) => {
        if (slot !== id || !Number.isNaN(this._next[i])) return;
        found = true;
        this._bouts[i] = bout;
        this._boutLeft[i] = this._pick(bout.off);
      });
      if (!found) throw new Error(`voice: bouts names no loop "${id}"`);
    }
    this._mouthSlots = new Uint8Array(
      rules.slotTags.map((tags) => (tags.includes(MOUTH_TAG) ? 1 : 0))
    );
    this._beds = rules.slotSounds.map((sound, i) =>
      Number.isNaN(this._next[i])
        ? _scope.createBed({
            sounds: [sound],
            bus: 'player',
            filter: 'lowpass',
            attack: 0.4,
            release: 0.6,
          })
        : null
    );
    this._mouth = _scope.createScope();
  }

  /** The priority of what the mouth is saying, or -1 when it is free. */
  get speaking(): number {
    return this._speaking;
  }

  /**
   * @param stroked Whether a swim stroke at the surface played this frame.
   */
  update(s: VoiceInput, stroked: boolean, seconds: number): void {
    this._speakFor -= seconds;
    if (this._speakFor <= 0) this._speaking = -1;
    this._under = s.cameraUnderWater;

    const spent = 1 - s.stamina;
    if (spent <= 0 && this.effort < RECOVERED)
      this.effortBend = Math.pow(EFFORT_BEND, 2 * this.random() - 1);
    this.effort = easeEffort(
      this.effort,
      staminaEffort(spent, this.effortBend),
      seconds
    );
    this._pain(s.health, seconds);
    this._breath(s.cameraUnderWater, s.oxygen, s.windiness, seconds);
    if (stroked)
      this._speak(
        VoicePriority.Breath,
        'breath-swim',
        SWIM_BREATH_GAIN + (1 - SWIM_BREATH_GAIN) * this.effort,
        SWIM_BREATH_DELAY
      );

    this.heat = s.bodyTemperature > 0 ? s.bodyTemperature : 0;
    this.cold = s.bodyTemperature < 0 ? -s.bodyTemperature : 0;

    const signals = this.signals;
    signals.set('effort', this.effort);
    signals.set('breathHeld', this.breathHeld);
    signals.set('heat', this.heat);
    signals.set('cold', this.cold);
    signals.set('health', s.health);
    signals.set('hurt', this.hurt);
    signals.set('hunger', s.hunger);
    signals.set('swimming', s.swimming ? 1 : 0);
    signals.set('under', s.cameraUnderWater ? 1 : 0);
    this.rules.evaluate();
    this._play(seconds);
  }

  /**
   * The player died: the breathing and the body loops fade out over `fade`
   * seconds, and the death sound cuts in over whatever the mouth is saying,
   * `delay` seconds from now.
   */
  die(fade: number, delay: number): void {
    for (const bed of this._beds) bed?.dispose(fade);
    this._speak(VoicePriority.Death, 'death', 1, delay);
  }

  dispose(): void {
    if (VoiceSound.current === this) VoiceSound.current = null;
    for (const bed of this._beds) bed?.dispose(0.3);
    this._mouth.dispose(0.3);
  }

  /** Gathers the damage taken and grunts when it is enough. */
  private _pain(health: number, seconds: number): void {
    this._damage *= Math.exp(-seconds / PAIN_GATHER);
    this.hurt *= Math.exp(-seconds / HURT_FADE);
    this._painWait -= seconds;
    if (health < this._health) {
      const damage = this._health - health;
      this._damage += damage;
      this.hurt = Math.min(1, this.hurt + damage / HURT_FULL);
    }
    this._health = health;
    if (this._painWait > 0) return;
    const sound = painSound(this._damage);
    if (!sound) return;
    this._speak(VoicePriority.Pain, sound, 1);
    this._painWait = PAIN_GAP;
    this._damage = 0;
  }

  /**
   * The breath held under water: the strain as it runs low, and on coming up
   * a gasp sized by how much of it was used, and always big in a rough sea.
   * @param oxygen 0..1: the share of the breath left.
   */
  private _breath(
    under: boolean,
    oxygen: number,
    windiness: number,
    seconds: number
  ): void {
    if (under) {
      this.breathHeld += seconds;
      this._strainIn -= seconds;
      if (
        oxygen <= STRAIN_BELOW &&
        this._strainIn <= 0 &&
        this._speak(VoicePriority.Strain, 'breath-strain', 1)
      ) {
        this._strainIn = STRAIN_EVERY;
        this._bubbles.gain = 1;
        this._scope.play('swim-bubbles', this._bubbles);
      }
    } else if (this._wasUnder) {
      const used = 1 - oxygen;
      const sound = gaspSound(used);
      if (sound) {
        this._speak(
          VoicePriority.Gasp,
          windiness > GASP_ROUGH_SEA ? 'gasp-big' : sound,
          1
        );
        this.effort = Math.max(this.effort, recoveryEffort(used));
      }
      this.breathHeld = 0;
      this._strainIn = 0;
    }
    this._wasUnder = under;
  }

  /** Sets the loops from the rules and their bouts, and plays the now-and-then sounds that are due. */
  private _play(seconds: number): void {
    const rules = this.rules;
    const gains = rules.gains;
    const busy = this._speaking >= 0;
    for (let i = 0; i < gains.length; i++) {
      const bed = this._beds[i];
      if (bed) {
        const gain = this._bouts[i]
          ? gains[i] * this._bout(i, seconds)
          : gains[i];
        bed.set(busy && this._mouthSlots[i] ? 0 : gain, rules.cutoffs[i]);
        continue;
      }
      this._next[i] -= seconds;
      if (this._next[i] > 0) continue;
      const min = this._everyMin[i];
      this._next[i] = min + (this._everyMax[i] - min) * this.random();
      const gain = gains[i];
      if (gain < QUIETEST) continue;
      const sound = rules.slotSounds[i];
      if (this._mouthSlots[i]) this._speak(VoicePriority.Breath, sound, gain);
      else {
        this._options.gain = gain;
        this._options.cutoff = OPEN_CUTOFF_HZ;
        this._options.delay = 0;
        this._scope.play(sound, this._options);
      }
    }
  }

  /** Moves slot `i`'s bout on, and returns how far it has swelled in, 0..1. */
  private _bout(i: number, seconds: number): number {
    this._boutLeft[i] -= seconds;
    if (this._boutLeft[i] <= 0) {
      const on = this._boutOn[i] ? 0 : 1;
      this._boutOn[i] = on;
      const bout = this._bouts[i]!;
      this._boutLeft[i] = this._pick(on ? bout.on : bout.off);
    }
    const level = this._boutLevel[i];
    this._boutLevel[i] =
      level + (this._boutOn[i] - level) * (1 - Math.exp(-seconds / BOUT_FADE));
    return this._boutLevel[i];
  }

  /** A random number of seconds in `range`. */
  private _pick(range: readonly [number, number]): number {
    return range[0] + (range[1] - range[0]) * this.random();
  }

  /**
   * Says `name` if nothing higher is being said, cutting off anything lower.
   * The mouth stays busy for the length of the file played. Under water it
   * is muffled and quieter, as the world is.
   */
  private _speak(
    priority: number,
    name: string,
    gain: number,
    delay: number = 0
  ): boolean {
    if (this._speaking > priority) return false;
    if (this._speaking >= 0) this._mouth.stopSounds(MOUTH_CUT);
    const under = this._under;
    this._options.gain = under ? gain * UNDER_WATER_LEVEL : gain;
    this._options.cutoff = under ? UNDER_WATER_CUTOFF : OPEN_CUTOFF_HZ;
    this._options.delay = delay;
    if (!this._mouth.play(name, this._options)) {
      this._speaking = -1;
      return false;
    }
    this._speaking = priority;
    this._speakFor = delay + this._mouth.lastLength;
    return true;
  }
}
