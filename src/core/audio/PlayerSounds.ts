import { smoothstep } from 'rewild-common';
import type { AudioEngine, AudioScope } from 'rewild-audio';
import { BodySound } from './BodySound';
import { DripSound } from './DripSound';
import { Footsteps, FootstepsDef } from './Footsteps';
import { SLIDING_FROM, SlideInput, SlideSound } from './SlideSound';
import { SwimSound } from './SwimSound';
import { UnderWaterSound } from './UnderWaterSound';
import { VoiceDef, VoiceInput, VoiceSound } from './VoiceSound';

/** What the player sounds read each frame. The player fills it in, then calls `update`. */
export interface PlayerSoundState extends SlideInput, VoiceInput {
  /** Metres moved across the ground this frame. */
  moved: number;
  /** Player.verticalVelocity, downward, as the feet touched down. */
  fallSpeed: number;
  /** Whether touching down did fall damage. */
  hurt: boolean;
  /** Player.verticalVelocity at the start of the frame, before the water slows it. */
  entryVelocity: number;
  /** Metres of water over the feet. */
  immersion: number;
  /** Metres of water from the bed to the surface. */
  waterDepth: number;
  crouching: boolean;
  sprinting: boolean;
  /** Whether a movement key is held. */
  pushing: boolean;
  diving: boolean;
  rising: boolean;
  /** 0..1: how wet the rain has left the ground. */
  wetness: number;
}

/** Seconds the breathing and the heartbeat take to fade out on death. */
const DEATH_FADE = 0.5;

/** Health below which the world starts to pull away, and at which it is furthest. */
const DAZE_FROM = 25;
const DAZE_FULL_AT = 10;

/** 0..1: how far low health pulls the world away. */
export function dazeShare(health: number): number {
  return 1 - smoothstep(health, DAZE_FULL_AT, DAZE_FROM);
}

function createState(): PlayerSoundState {
  return {
    x: 0,
    y: 0,
    z: 0,
    moved: 0,
    onGround: false,
    grounded: false,
    slideX: 0,
    slideZ: 0,
    climbing: false,
    fallSpeed: 0,
    hurt: false,
    entryVelocity: 0,
    swimming: false,
    immersion: 0,
    waterDepth: 0,
    cameraUnderWater: false,
    oxygen: 1,
    crouching: false,
    sprinting: false,
    pushing: false,
    diving: false,
    rising: false,
    wetness: 0,
    ground: null,
    stamina: 1,
    bodyTemperature: 0,
    health: 100,
    hunger: 100,
  };
}

/**
 * Every sound the player makes: footsteps, the jump and landings, sliding,
 * swimming, dripping, the under-water mix, the flashlight, and the breath and
 * voice. The player fills in
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
  private readonly _slide: SlideSound;
  private readonly _voice: VoiceSound | null;
  private _wasOnGround = false;

  /** A bad footsteps or voice table logs an error and leaves the player without steps, or voice. */
  constructor(
    engine: AudioEngine,
    scope: AudioScope,
    footsteps: FootstepsDef | null,
    voice: VoiceDef | null = null
  ) {
    this._underWater = new UnderWaterSound(engine, scope);
    this._footsteps = footsteps ? createFootsteps(footsteps, scope) : null;
    Footsteps.current = this._footsteps;
    this._body = new BodySound(scope);
    this._swim = new SwimSound(scope);
    this._drips = new DripSound(scope);
    this._slide = new SlideSound(scope, this._footsteps);
    this._voice = voice ? createVoice(voice, scope) : null;
    VoiceSound.current = this._voice;
  }

  jump(): void {
    this._body.jump();
    this._slide.jumped();
  }

  /** The player slid into an obstacle hard enough to hurt. */
  impact(): void {
    this._body.impact();
  }

  flashlight(): void {
    this._body.flashlight();
  }

  update(seconds: number): void {
    const s = this.state;
    this._step(seconds);
    if (!this._wasOnGround && s.onGround && s.immersion <= 0) this._land();
    this._wasOnGround = s.onGround;
    this._slide.update(s, seconds);

    this._underWater.update(
      s.immersion,
      s.waterDepth,
      s.cameraUnderWater,
      s.entryVelocity,
      seconds
    );
    const swimMoving =
      s.pushing || s.diving || (s.rising && s.cameraUnderWater);
    this._swim.update(
      s.swimming,
      s.cameraUnderWater,
      swimMoving,
      s.sprinting,
      seconds
    );
    this._drips.update(s.swimming, s.immersion, seconds);

    this._voice?.update(s, this._swim.stroked, seconds);
    this._underWater.setDaze(dazeShare(s.health));
  }

  /** The player died: the breathing, the heartbeat, the slide and the drips fade out. */
  die(): void {
    this._voice?.stopBreathing(DEATH_FADE);
    this._slide.dispose();
    this._drips.dispose();
  }

  /** Lifts the under-water muffle and stops the beds. */
  dispose(): void {
    if (Footsteps.current === this._footsteps) Footsteps.current = null;
    this._underWater.dispose();
    this._drips.dispose();
    this._slide.dispose();
    this._voice?.dispose();
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
    const sliding = s.onGround && Math.hypot(s.slideX, s.slideZ) > SLIDING_FROM;
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

function createVoice(def: VoiceDef, scope: AudioScope): VoiceSound | null {
  try {
    return new VoiceSound(def, scope);
  } catch (e) {
    console.error('templates/voice.json:', e);
    return null;
  }
}
