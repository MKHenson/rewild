import { Vector3, smoothstep } from 'rewild-common';
import type { AudioScope, Bed, PlayOptions } from 'rewild-audio';
import { SLIDE_MAX_SPEED } from '../routing/utils/Sliding';
import { DEFAULT_SLIDE, FootstepGround, Footsteps } from './Footsteps';

// Slide speeds are in GroundSlide's units of half a metre a second.

/** Slide speed above which the feet slide on the ground rather than step. */
export const SLIDING_FROM = 0.5;
/** Seconds without sliding before a new slide slips again. */
export const SLIP_REST = 0.5;
/** Slide speed from which leaving the ground spills dirt over the edge. */
export const SPILL_FROM = 2;
/** Metres downhill debris falls from, nearest and furthest. */
export const DEBRIS_NEAR = 3;
export const DEBRIS_FAR = 10;
/** Seconds between debris at the slowest slide and at the fastest. */
export const DEBRIS_EVERY_SLOW = 0.6;
export const DEBRIS_EVERY_FAST = 0.2;
/** Seconds from a slide starting to its first debris. */
const FIRST_DEBRIS = 0.2;
/** Seconds between scrabbles, shortest and longest. */
export const SCRABBLE_EVERY = 0.25;
const SCRABBLE_JITTER = 0.2;
/** Low-pass cutoff of the slide loop at the slowest slide and the fastest. */
const CUTOFF_SLOW = 1500;
const CUTOFF_FAST = 14000;

/** The ground the slide reads: its materials and its height. */
export interface SlideGround extends FootstepGround {
  sampleHeight(x: number, z: number): number | null;
}

/** The player values the slide reads each frame. */
export interface SlideInput {
  x: number;
  /** Height of the feet. */
  y: number;
  z: number;
  onGround: boolean;
  grounded: boolean;
  /** Horizontal slide velocity, in the slide's units. */
  slideX: number;
  slideZ: number;
  /** Whether walking input pushes up a slope too steep to climb. */
  climbing: boolean;
  ground: SlideGround | null;
}

/** 0..1: how far a slide at `speed` is from barely sliding to full speed. */
export function slideShare(speed: number): number {
  return smoothstep(speed, SLIDING_FROM, SLIDE_MAX_SPEED);
}

/** The slide loop's gain at `speed`: a soft crumble rising to a roar. */
export function slideGain(speed: number): number {
  return 0.35 + 0.65 * slideShare(speed);
}

/** The slide loop's playback rate at `speed`: higher as the slide speeds up. */
export function slideRate(speed: number): number {
  return 0.85 + 0.35 * slideShare(speed);
}

/** The slide loop's cutoff at `speed`: brighter as the slide speeds up. */
export function slideCutoff(speed: number): number {
  return CUTOFF_SLOW * Math.pow(CUTOFF_FAST / CUTOFF_SLOW, slideShare(speed));
}

/** Seconds to the next debris at `speed`, before jitter. */
export function debrisInterval(speed: number): number {
  return (
    DEBRIS_EVERY_SLOW +
    (DEBRIS_EVERY_FAST - DEBRIS_EVERY_SLOW) * slideShare(speed)
  );
}

/**
 * The ground giving way under a slide. A loop crumbles under the feet, in the
 * surface's own slide sound, louder, higher and brighter as the slide speeds
 * up; a slip breaks away as a slide starts; dirt and stones fall away
 * downhill; a slide off an edge spills a last burst from it; and feet that
 * push up ground too steep to climb scrabble. The loop, slip and scrabbles
 * are at the feet, on the player bus; the debris and spill are in the world.
 */
export class SlideSound {
  random: () => number = Math.random;

  private readonly _beds: Bed[];
  private readonly _bedOf: Int32Array;
  private readonly _bedShare: Float32Array;
  private readonly _weights: Float32Array;
  private readonly _feet: PlayOptions = { bus: 'player', gain: 1 };
  private readonly _world: PlayOptions = {
    bus: 'effects',
    gain: 1,
    at: new Vector3(),
  };
  private _wasSliding = false;
  private _still = SLIP_REST;
  private _debris = FIRST_DEBRIS;
  private _scrabble = 0;
  private _jumped = false;

  constructor(
    private readonly _scope: Pick<AudioScope, 'play' | 'createBed'>,
    private readonly _footsteps: Footsteps | null
  ) {
    const slides = _footsteps?.slideSounds ?? [DEFAULT_SLIDE];
    const names = [...new Set(slides)];
    this._beds = names.map((sound) =>
      _scope.createBed({
        sounds: [sound],
        bus: 'player',
        filter: 'lowpass',
        attack: 0.15,
        release: 0.5,
      })
    );
    this._bedOf = new Int32Array(slides.map((sound) => names.indexOf(sound)));
    this._bedShare = new Float32Array(names.length);
    this._weights = new Float32Array(slides.length);
  }

  /** The player jumped this frame, so leaving the ground is no spill. */
  jumped(): void {
    this._jumped = true;
  }

  update(input: SlideInput, seconds: number): void {
    const speed = Math.hypot(input.slideX, input.slideZ);
    const sliding = input.onGround && speed > SLIDING_FROM;

    if (sliding && !this._wasSliding && this._still >= SLIP_REST)
      this._scope.play('slide-slip', this._feet);
    this._still = sliding ? 0 : this._still + seconds;

    if (
      this._wasSliding &&
      !input.onGround &&
      !this._jumped &&
      speed > SPILL_FROM
    )
      this._spill(input);
    this._wasSliding = sliding;
    this._jumped = false;

    this._loop(input, sliding, speed);

    if (sliding) {
      this._debris -= seconds;
      if (this._debris <= 0) {
        this._debris = debrisInterval(speed) * (0.75 + 0.5 * this.random());
        this._fallAway(input, speed);
      }
    } else this._debris = FIRST_DEBRIS;

    if (input.onGround && !input.grounded && input.climbing) {
      this._scrabble -= seconds;
      if (this._scrabble <= 0) {
        this._scrabble = SCRABBLE_EVERY + SCRABBLE_JITTER * this.random();
        this._scope.play('slide-scrabble', this._feet);
      }
    } else this._scrabble = 0;
  }

  dispose(): void {
    for (const bed of this._beds) bed.dispose(0.3);
  }

  /** Sets each slide loop by the share of its surfaces under the feet. */
  private _loop(input: SlideInput, sliding: boolean, speed: number): void {
    const share = this._bedShare;
    share.fill(0);
    if (sliding) {
      if (this._footsteps) {
        const weights = this._weights;
        this._footsteps.weigh(input.x, input.z, weights);
        let total = 0;
        for (let s = 0; s < weights.length; s++) total += weights[s];
        for (let s = 0; s < weights.length; s++)
          share[this._bedOf[s]] += total > 0 ? weights[s] / total : 0;
      } else share[0] = 1;
    }
    const gain = slideGain(speed);
    const rate = slideRate(speed);
    const cutoff = slideCutoff(speed);
    for (let b = 0; b < this._beds.length; b++) {
      const bed = this._beds[b];
      bed.set(share[b] * gain, cutoff);
      bed.setRate(rate);
    }
  }

  /** Dirt or stones breaking loose a few metres downhill. */
  private _fallAway(input: SlideInput, speed: number): void {
    const distance = DEBRIS_NEAR + (DEBRIS_FAR - DEBRIS_NEAR) * this.random();
    const x = input.x + (input.slideX / speed) * distance;
    const z = input.z + (input.slideZ / speed) * distance;
    const y = input.ground?.sampleHeight(x, z) ?? input.y - distance;
    this._world.at!.set(x, y, z);
    this._world.gain = 0.5 + 0.5 * slideShare(speed);
    this._scope.play(
      this.random() < 0.5 ? 'slide-debris-crumble' : 'slide-debris-stones',
      this._world
    );
  }

  /** A last burst of dirt and stones from the edge the slide went over. */
  private _spill(input: SlideInput): void {
    this._world.at!.set(input.x, input.y, input.z);
    this._world.gain = 1;
    this._scope.play('slide-debris-crumble', this._world);
    this._scope.play('slide-debris-stones', this._world);
  }
}
