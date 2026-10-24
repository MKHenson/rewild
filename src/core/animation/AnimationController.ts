import { ICreatureAnimation, LocomotionMeaning } from 'models';

/** What the controller drives: one skinned instance's clips. */
export interface AnimationTarget {
  readonly clipNames: string[];
  clipDuration(clip: string): number;
  fadeTo(clip: string, weight: number, fade?: number, loop?: boolean): boolean;
  stop(clip: string, fade?: number): void;
  setClipRate(clip: string, rate: number): void;
  setClipTime(clip: string, seconds: number): void;
  clipTime(clip: string): number;
}

export const DEFAULT_SET = 'normal';
/** Seconds a locomotion set or an action takes to fade in or out. */
export const DEFAULT_FADE = 0.25;
/** The most the playback rate moves from 1 to stop foot slide. */
export const RATE_CORRECTION = 0.15;
/** Below this ground speed in m/s the creature counts as standing still. */
export const STILL_SPEED = 0.05;
export const DEFAULT_CLIP_SPEEDS: { [meaning in LocomotionMeaning]: number } = {
  idle: 0,
  walk: 1,
  run: 3,
};
/** Seconds between idle actions, picked at random in this range. */
export const IDLE_ACTION_INTERVAL: [number, number] = [4, 10];

const MEANINGS: LocomotionMeaning[] = ['idle', 'walk', 'run'];
const MAX_LOCOMOTION_CLIPS = 6;

/** A locomotion set's clips, sorted by natural speed. */
interface ResolvedSet {
  name: string;
  clips: string[];
  speeds: number[];
  /** Cycling clips share the locomotion phase. Idle keeps its own time. */
  synced: boolean[];
}

class ActionSlot {
  meaning: string | null = null;
  clip: string | null = null;
  weight = 0;
  target = 0;
  fadeSpeed = 0;
  fade = DEFAULT_FADE;
  loop = false;
  /** Started by idle variety, so moving stops it. */
  idle = false;

  clear(): void {
    this.meaning = null;
    this.clip = null;
    this.weight = 0;
    this.target = 0;
    this.idle = false;
  }

  fadeTo(target: number, seconds: number): void {
    this.target = target;
    if (seconds > 0) {
      this.fadeSpeed = Math.abs(target - this.weight) / seconds;
    } else {
      this.weight = target;
      this.fadeSpeed = 0;
    }
  }
}

/**
 * Makes every animation decision for one creature. Locomotion blends the
 * active set's idle, walk and run by `speed`, with walk and run on one shared
 * phase so the feet stay in step. Actions fade in over locomotion by meaning.
 * Behaviours set `speed`, the locomotion set and actions, and never play
 * locomotion clips.
 */
export class AnimationController {
  /** Ground speed in m/s. */
  speed = 0;

  private readonly target: AnimationTarget;
  private readonly config: ICreatureAnimation;
  private readonly random: () => number;
  private readonly clipByLowerName = new Map<string, string>();
  private readonly sets = new Map<string, ResolvedSet>();

  private current: ResolvedSet;
  private previous: ResolvedSet | null = null;
  /** Weight of `current` while it crossfades from `previous`. */
  private setBlend = 1;
  private setFade = DEFAULT_FADE;
  /** Locomotion cycle position, 0 to 1. */
  private phase = 0;

  private readonly action = new ActionSlot();
  private readonly fadingAction = new ActionSlot();
  private idleTimer: number;

  private names: (string | null)[] = new Array(MAX_LOCOMOTION_CLIPS).fill(null);
  private weights = new Float32Array(MAX_LOCOMOTION_CLIPS);
  private syncs = new Uint8Array(MAX_LOCOMOTION_CLIPS);
  private count = 0;
  private lastNames: (string | null)[] = new Array(MAX_LOCOMOTION_CLIPS).fill(
    null
  );
  private lastCount = 0;

  constructor(
    target: AnimationTarget,
    config: ICreatureAnimation = {},
    random: () => number = Math.random
  ) {
    this.target = target;
    this.config = config;
    this.random = random;
    for (const name of target.clipNames)
      this.clipByLowerName.set(name.toLowerCase(), name);
    this.current = this.resolveSet(DEFAULT_SET);
    this.idleTimer = this.nextIdleDelay();
  }

  get locomotionSet(): string {
    return this.current.name;
  }

  /**
   * The clip a meaning plays: the `clips` entry, else the clip of the same
   * name, matched without case if no exact one exists. Null if there is none.
   */
  resolveClip(meaning: string): string | null {
    const name = this.config.clips?.[meaning] ?? meaning;
    if (this.target.clipDuration(name) >= 0) return name;
    return this.clipByLowerName.get(name.toLowerCase()) ?? null;
  }

  /** Snaps to the current set at rest, idle at a random point in its loop. */
  start(): void {
    this.update(0);
    const idle = this.resolveClip(this.meaningIn(this.current.name, 'idle'));
    if (idle)
      this.target.setClipTime(
        idle,
        this.random() * Math.max(this.target.clipDuration(idle), 0)
      );
  }

  /** Crossfades locomotion to a named set. Any set name works on any creature. */
  setLocomotion(name: string, fade = DEFAULT_FADE): void {
    if (name === this.current.name) return;

    const next = this.resolveSet(name);
    if (this.previous && this.previous.name === name) {
      this.previous = this.current;
      this.setBlend = 1 - this.setBlend;
    } else {
      this.previous = this.current;
      this.setBlend = 0;
    }
    this.current = next;
    this.setFade = fade;
    if (fade <= 0) {
      this.previous = null;
      this.setBlend = 1;
    }
  }

  /**
   * Fades an action in over locomotion. A one-shot action fades out as it
   * ends. False if the creature has no clip for the meaning.
   */
  play(meaning: string, loop = false, fade = DEFAULT_FADE): boolean {
    return this.startAction(meaning, loop, fade, false);
  }

  stop(meaning: string, fade = DEFAULT_FADE): void {
    if (this.action.meaning === meaning) this.action.fadeTo(0, fade);
    if (this.fadingAction.meaning === meaning)
      this.fadingAction.fadeTo(0, fade);
  }

  /** Whether an action is playing and not fading out. */
  isPlaying(meaning: string): boolean {
    return this.action.meaning === meaning && this.action.target > 0;
  }

  update(dt: number): void {
    if (this.previous) {
      this.setBlend =
        this.setFade > 0 ? Math.min(1, this.setBlend + dt / this.setFade) : 1;
      if (this.setBlend >= 1) this.previous = null;
    }

    const moving = this.speed > STILL_SPEED;
    if (moving && this.action.idle && this.action.target > 0)
      this.action.fadeTo(0, this.action.fade);
    this.updateIdleVariety(dt, moving);

    this.advanceAction(this.action, dt);
    this.advanceAction(this.fadingAction, dt);
    const actionWeight = Math.min(
      1,
      this.action.weight + this.fadingAction.weight
    );

    this.count = 0;
    const locomotion = 1 - actionWeight;
    const frequency = this.blendSet(
      this.current,
      locomotion * (this.previous ? this.setBlend : 1)
    );
    if (this.previous)
      this.blendSet(this.previous, locomotion * (1 - this.setBlend));

    this.phase = (this.phase + frequency * dt) % 1;
    this.applyLocomotion();
    this.applyAction(this.action);
    this.applyAction(this.fadingAction);
  }

  /** Adds a set's speed blend at `scale`. Returns its cycles per second. */
  private blendSet(set: ResolvedSet, scale: number): number {
    const { clips, speeds, synced } = set;
    const n = clips.length;
    if (n === 0) return 0;

    const speed = this.speed;
    let lower = 0;
    let upperWeight = 0;
    if (speed >= speeds[n - 1]) lower = n - 1;
    else if (speed > speeds[0]) {
      while (lower < n - 2 && speed >= speeds[lower + 1]) lower++;
      upperWeight =
        (speed - speeds[lower]) / (speeds[lower + 1] - speeds[lower]);
    }

    const lowerWeight = 1 - upperWeight;
    let blendSpeed = speeds[lower] * lowerWeight;
    if (upperWeight > 0) blendSpeed += speeds[lower + 1] * upperWeight;

    const rate =
      blendSpeed > 0
        ? Math.min(
            1 + RATE_CORRECTION,
            Math.max(1 - RATE_CORRECTION, speed / blendSpeed)
          )
        : 1;

    let frequency = 0;
    let syncedWeight = 0;
    for (let k = 0; k < 2; k++) {
      const i = lower + k;
      const w = k === 0 ? lowerWeight : upperWeight;
      if (i >= n || w <= 0) continue;
      this.addClip(clips[i], w * scale, synced[i]);
      if (!synced[i]) continue;
      const duration = this.target.clipDuration(clips[i]);
      if (duration > 0) {
        frequency += (w * rate) / duration;
        syncedWeight += w;
      }
    }

    return syncedWeight > 0 ? frequency / syncedWeight : 0;
  }

  private addClip(clip: string, weight: number, synced: boolean): void {
    for (let i = 0; i < this.count; i++)
      if (this.names[i] === clip) {
        this.weights[i] += weight;
        return;
      }
    if (this.count === MAX_LOCOMOTION_CLIPS) return;
    this.names[this.count] = clip;
    this.weights[this.count] = weight;
    this.syncs[this.count] = synced ? 1 : 0;
    this.count++;
  }

  private applyLocomotion(): void {
    const { target, names, weights, syncs, lastNames } = this;

    for (let i = 0; i < this.lastCount; i++) {
      const clip = lastNames[i];
      if (clip !== null && !this.isLive(clip)) target.stop(clip);
    }

    for (let i = 0; i < this.count; i++) {
      const clip = names[i]!;
      if (weights[i] <= 0) {
        target.stop(clip);
        continue;
      }
      target.fadeTo(clip, weights[i]);
      if (syncs[i]) {
        target.setClipRate(clip, 0);
        target.setClipTime(clip, this.phase * target.clipDuration(clip));
      }
    }

    this.lastNames = names;
    this.names = lastNames;
    this.lastCount = this.count;
  }

  /** Whether this frame's locomotion or an action still plays the clip. */
  private isLive(clip: string): boolean {
    if (clip === this.action.clip || clip === this.fadingAction.clip)
      return true;
    for (let i = 0; i < this.count; i++)
      if (this.names[i] === clip && this.weights[i] > 0) return true;
    return false;
  }

  private startAction(
    meaning: string,
    loop: boolean,
    fade: number,
    idle: boolean
  ): boolean {
    const clip = this.resolveClip(meaning);
    if (!clip) return false;

    const { action, fadingAction } = this;
    if (action.clip !== clip) {
      if (fadingAction.clip && fadingAction.clip !== clip)
        this.target.stop(fadingAction.clip);

      const resumed = fadingAction.clip === clip;
      const weight = resumed ? fadingAction.weight : 0;
      copySlot(action, fadingAction);
      fadingAction.fadeTo(0, fade);

      action.clear();
      action.clip = clip;
      action.weight = weight;
      if (!resumed) {
        this.target.fadeTo(clip, 0, 0, loop);
        this.target.setClipTime(clip, 0);
      }
    }

    action.meaning = meaning;
    action.loop = loop;
    action.fade = fade;
    action.idle = idle;
    action.fadeTo(1, fade);
    return true;
  }

  private advanceAction(slot: ActionSlot, dt: number): void {
    if (!slot.clip) return;

    if (!slot.loop && slot.target > 0) {
      const duration = this.target.clipDuration(slot.clip);
      if (this.target.clipTime(slot.clip) >= duration - slot.fade)
        slot.fadeTo(0, Math.max(duration - this.target.clipTime(slot.clip), 0));
    }

    const step = slot.fadeSpeed * dt;
    slot.weight =
      slot.weight < slot.target
        ? Math.min(slot.target, slot.weight + step)
        : Math.max(slot.target, slot.weight - step);

    if (slot.weight <= 0 && slot.target <= 0) {
      this.target.stop(slot.clip);
      slot.clear();
    }
  }

  private applyAction(slot: ActionSlot): void {
    if (slot.clip) this.target.fadeTo(slot.clip, slot.weight, 0, slot.loop);
  }

  private updateIdleVariety(dt: number, moving: boolean): void {
    const actions = this.config.idleActions;
    if (!actions?.length || moving || this.action.clip) {
      this.idleTimer = this.nextIdleDelay();
      return;
    }

    this.idleTimer -= dt;
    if (this.idleTimer > 0) return;
    this.idleTimer = this.nextIdleDelay();
    const meaning = actions[Math.floor(this.random() * actions.length)];
    this.startAction(meaning, false, DEFAULT_FADE, true);
  }

  private nextIdleDelay(): number {
    const [min, max] = IDLE_ACTION_INTERVAL;
    return min + this.random() * (max - min);
  }

  /** The meaning a set plays for a locomotion slot, falling back to `normal`. */
  private meaningIn(set: string, slot: LocomotionMeaning): string {
    const sets = this.config.locomotion;
    return sets?.[set]?.[slot] ?? sets?.[DEFAULT_SET]?.[slot] ?? slot;
  }

  private resolveSet(name: string): ResolvedSet {
    const cached = this.sets.get(name);
    if (cached) return cached;

    const entries: { clip: string; speed: number; synced: boolean }[] = [];
    for (const slot of MEANINGS) {
      const meaning = this.meaningIn(name, slot);
      const clip = this.resolveClip(meaning);
      if (!clip || entries.some((e) => e.clip === clip)) continue;
      entries.push({
        clip,
        speed: slot === 'idle' ? 0 : this.clipSpeed(meaning, slot),
        synced: slot !== 'idle',
      });
    }
    entries.sort((a, b) => a.speed - b.speed);

    const set: ResolvedSet = {
      name,
      clips: entries.map((e) => e.clip),
      speeds: entries.map((e) => e.speed),
      synced: entries.map((e) => e.synced),
    };
    this.sets.set(name, set);
    return set;
  }

  private clipSpeed(meaning: string, slot: LocomotionMeaning): number {
    const speeds = this.config.clipSpeeds;
    return speeds?.[meaning] ?? speeds?.[slot] ?? DEFAULT_CLIP_SPEEDS[slot];
  }
}

function copySlot(from: ActionSlot, to: ActionSlot): void {
  to.meaning = from.meaning;
  to.clip = from.clip;
  to.weight = from.weight;
  to.target = from.target;
  to.fadeSpeed = from.fadeSpeed;
  to.fade = from.fade;
  to.loop = from.loop;
  to.idle = from.idle;
}
