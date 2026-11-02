import { BehaviourState } from 'rewild-routing';
import { WanderSettings } from '../CreaturePresets';
import { IMovementMode, MovementSystem } from '../MovementSystem';

/** Points tried before Wander gives up and waits. */
export const PICK_ATTEMPTS = 8;
/** Metres a new point must be from where the creature stands. */
export const MIN_WANDER_STEP = 1;

type Phase = 'pick' | 'walk' | 'wait';

/** Walks to points near home, waits at each, and plays an action while it waits. */
export class Wander implements IMovementMode {
  readonly name = 'wander';
  phase: Phase = 'pick';
  targetX = 0;
  targetZ = 0;
  timer = 0;
  /** The action playing in this wait. */
  action: string | null = null;

  private readonly settings: WanderSettings;
  private readonly radius: number;

  constructor(settings: WanderSettings, radius = settings.radius) {
    this.settings = settings;
    this.radius = radius;
  }

  score(): number {
    return 1;
  }

  enter(): void {
    this.phase = 'pick';
  }

  exit(system: MovementSystem): void {
    this.stopAction(system);
  }

  update(dt: number, system: MovementSystem): void {
    if (this.phase === 'walk') {
      if (system.blocked) this.phase = 'pick';
      else if (system.arrived) this.startWait(system);
      else
        system.steerTo(this.targetX, this.targetZ, system.settings.walkSpeed);
    }

    if (this.phase === 'pick') {
      if (this.pickTarget(system)) {
        this.phase = 'walk';
        system.steerTo(this.targetX, this.targetZ, system.settings.walkSpeed);
      } else this.startWait(system, false);
    }

    if (this.phase === 'wait') {
      system.halt();
      this.timer -= dt;
      if (this.timer <= 0) {
        this.stopAction(system);
        this.phase = 'pick';
      }
    }
  }

  serialize(): BehaviourState {
    return {
      phase: this.phase,
      targetX: this.targetX,
      targetZ: this.targetZ,
      timer: this.timer,
    };
  }

  restore(state: BehaviourState): void {
    if (
      state.phase === 'pick' ||
      state.phase === 'walk' ||
      state.phase === 'wait'
    )
      this.phase = state.phase;
    if (typeof state.targetX === 'number') this.targetX = state.targetX;
    if (typeof state.targetZ === 'number') this.targetZ = state.targetZ;
    if (typeof state.timer === 'number') this.timer = state.timer;
  }

  private pickTarget(system: MovementSystem): boolean {
    const { random } = system;
    for (let i = 0; i < PICK_ATTEMPTS; i++) {
      const angle = random() * Math.PI * 2;
      const distance = this.radius * Math.sqrt(random());
      const x = system.homeX + Math.sin(angle) * distance;
      const z = system.homeZ + Math.cos(angle) * distance;
      if (Math.hypot(x - system.x, z - system.z) < MIN_WANDER_STEP) continue;
      if (!system.habitat.canBe(x, z)) continue;
      this.targetX = x;
      this.targetZ = z;
      return true;
    }
    return false;
  }

  private startWait(system: MovementSystem, mayAct = true): void {
    const [min, max] = this.settings.wait;
    this.phase = 'wait';
    this.timer = min + system.random() * (max - min);
    if (!mayAct) return;
    const meaning = this.pickAction(system.random());
    if (meaning && system.animator?.play(meaning, true)) this.action = meaning;
  }

  private pickAction(roll: number): string | null {
    const { actions } = this.settings;
    let total = 0;
    for (let i = 0; i < actions.length; i++) total += actions[i].weight;
    let left = roll * total;
    for (let i = 0; i < actions.length; i++) {
      left -= actions[i].weight;
      if (left < 0) return actions[i].meaning;
    }
    return null;
  }

  private stopAction(system: MovementSystem): void {
    if (this.action) system.animator?.stop(this.action);
    this.action = null;
  }
}
