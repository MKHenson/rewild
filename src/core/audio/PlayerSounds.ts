import type { AudioEngine, AudioScope } from 'rewild-audio';
import { BodySound } from './BodySound';
import { DripSound } from './DripSound';
import { FootstepGround, Footsteps, FootstepsDef } from './Footsteps';
import { SwimSound } from './SwimSound';
import { UnderWaterSound } from './UnderWaterSound';

/** Slide speed, in the slide's units of half a metre a second, above which the feet slide rather than step. */
export const SLIDE_STOPS_STEPS = 0.5;

/** What the player sounds read each frame. The player fills it in, then calls `update`. */
export interface PlayerSoundState {
  /** Where the feet are. */
  x: number;
  z: number;
  /** Metres moved across the ground this frame. */
  moved: number;
  /** Whether the capsule rests on any ground, however steep. */
  onGround: boolean;
  /** Whether the ground is gentle enough to walk on. */
  grounded: boolean;
  /** Speed of the slide down steep ground, in the slide's units. */
  slideSpeed: number;
  /** Player.verticalVelocity, downward, as the feet touched down. */
  fallSpeed: number;
  /** Whether touching down did fall damage. */
  hurt: boolean;
  /** Player.verticalVelocity at the start of the frame, before the water slows it. */
  entryVelocity: number;
  swimming: boolean;
  /** Metres of water over the feet. */
  immersion: number;
  /** Metres of water from the bed to the surface. */
  waterDepth: number;
  cameraUnderWater: boolean;
  crouching: boolean;
  sprinting: boolean;
  /** Whether a movement key is held. */
  pushing: boolean;
  diving: boolean;
  rising: boolean;
  /** 0..1: how wet the rain has left the ground. */
  wetness: number;
  ground: FootstepGround | null;
}

function createState(): PlayerSoundState {
  return {
    x: 0,
    z: 0,
    moved: 0,
    onGround: false,
    grounded: false,
    slideSpeed: 0,
    fallSpeed: 0,
    hurt: false,
    entryVelocity: 0,
    swimming: false,
    immersion: 0,
    waterDepth: 0,
    cameraUnderWater: false,
    crouching: false,
    sprinting: false,
    pushing: false,
    diving: false,
    rising: false,
    wetness: 0,
    ground: null,
  };
}

/**
 * Every sound the player makes: footsteps, the jump and landings, swimming,
 * dripping, the under-water mix and the flashlight. The player fills in
 * `state` each frame and calls `update`; events such as a jump are calls of
 * their own. Everything plays in the player's scope.
 */
export class PlayerSounds {
  readonly state = createState();

  private readonly _underWater: UnderWaterSound;
  private readonly _footsteps: Footsteps | null;
  private readonly _body: BodySound;
  private readonly _swim: SwimSound;
  private readonly _drips: DripSound;
  private _wasOnGround = false;

  /** A bad footsteps table logs an error and leaves the player without steps. */
  constructor(
    engine: AudioEngine,
    scope: AudioScope,
    footsteps: FootstepsDef | null
  ) {
    this._underWater = new UnderWaterSound(engine, scope);
    this._footsteps = footsteps ? createFootsteps(footsteps, scope) : null;
    Footsteps.current = this._footsteps;
    this._body = new BodySound(scope);
    this._swim = new SwimSound(scope);
    this._drips = new DripSound(scope);
  }

  jump(): void {
    this._body.jump();
  }

  flashlight(): void {
    this._body.flashlight();
  }

  update(seconds: number): void {
    const s = this.state;
    this._step(seconds);
    if (!this._wasOnGround && s.onGround && s.immersion <= 0) this._land();
    this._wasOnGround = s.onGround;

    this._underWater.update(
      s.immersion,
      s.waterDepth,
      s.cameraUnderWater,
      s.entryVelocity,
      seconds
    );
    this._swim.update(
      s.swimming,
      s.cameraUnderWater,
      s.pushing || s.diving || (s.rising && s.cameraUnderWater),
      s.sprinting,
      seconds
    );
    this._drips.update(s.swimming, s.immersion, seconds);
  }

  /** Lifts the under-water muffle and stops the beds. */
  dispose(): void {
    if (Footsteps.current === this._footsteps) Footsteps.current = null;
    this._underWater.dispose();
    this._drips.dispose();
  }

  /** Steps as the player walks, from the ground under the feet. */
  private _step(seconds: number): void {
    const footsteps = this._footsteps;
    if (!footsteps) return;
    const s = this.state;
    footsteps.ground = s.ground;
    const signals = footsteps.signals;
    signals.set('wetness', s.wetness);
    signals.set('immersion', s.immersion);
    signals.set('crouching', s.crouching ? 1 : 0);
    const sliding = s.onGround && s.slideSpeed > SLIDE_STOPS_STEPS;
    footsteps.update(
      s.moved,
      seconds,
      s.grounded && !sliding && !s.swimming,
      s.x,
      s.z
    );
  }

  /** A thud as the feet touch down, and a step on the ground landed on. */
  private _land(): void {
    const s = this.state;
    if (!this._body.land(s.fallSpeed, s.hurt)) return;
    this._footsteps?.step(s.x, s.z);
    this._footsteps?.reset();
  }
}

function createFootsteps(
  def: FootstepsDef,
  scope: AudioScope
): Footsteps | null {
  try {
    return new Footsteps(def, scope);
  } catch (e) {
    console.error('templates/footsteps.json:', e);
    return null;
  }
}
