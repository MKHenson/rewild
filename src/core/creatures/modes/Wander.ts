import { BehaviourState } from 'rewild-routing';
import { WanderSettings } from '../CreaturePresets';
import { IMovementMode, MovementSystem } from '../MovementSystem';

/** Points tried before Wander gives up and waits. */
export const PICK_ATTEMPTS = 8;
/** Metres a new point must be from where the creature stands. */
export const MIN_WANDER_STEP = 1;
/** Seconds of moving without getting `STALL_PROGRESS` closer before a point is given up. */
export const STALL_TIME = 3;
/** Metres closer to its point a creature must get to count as making progress. */
const STALL_PROGRESS = 0.5;
/** Radians round home between circling points, at the least. */
const CIRCLE_STEP = Math.PI / 4;
/** Nearest a circling point is to home, as a share of the radius. */
const CIRCLE_INNER = 0.7;

type Phase = 'pick' | 'walk' | 'wait';

/** Walks to points near home, waits at each, and plays an action while it waits. */
export class Wander implements IMovementMode {
  readonly name = 'wander';
  phase: Phase = 'pick';
  targetX = 0;
  targetZ = 0;
  /** Where in its height range it aims. Only some habitats have a range. */
  targetLevel = 0.5;
  timer = 0;
  /** The action playing in this wait. */
  action: string | null = null;

  private readonly settings: WanderSettings;
  private readonly radius: number;
  /** The way round home it circles. Picked on the first point. */
  private circleSign = 0;
  /** Nearest it has been to the point, and seconds moving since it got nearer. */
  private closest = Infinity;
  private stalled = 0;

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
      if (system.arrived) this.startWait(system);
      else if (system.blocked || this.stall(dt, system))
        this.startWait(system, false);
      else this.steer(system);
    }

    if (this.phase === 'pick') {
      if (this.pickTarget(system)) {
        this.phase = 'walk';
        this.steer(system);
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
      targetLevel: this.targetLevel,
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
    if (typeof state.targetLevel === 'number')
      this.targetLevel = state.targetLevel;
    if (typeof state.timer === 'number') this.timer = state.timer;
  }

  /** Whether the point has been out of reach for too long. Turning on the spot does not count. */
  private stall(dt: number, system: MovementSystem): boolean {
    const distance = Math.hypot(
      this.targetX - system.x,
      this.targetZ - system.z
    );
    if (distance < this.closest - STALL_PROGRESS) {
      this.closest = distance;
      this.stalled = 0;
    } else if (system.speed > 0) this.stalled += dt;
    return this.stalled > STALL_TIME;
  }

  private steer(system: MovementSystem): void {
    system.goalLevel = this.targetLevel;
    system.steerTo(this.targetX, this.targetZ, system.settings.walkSpeed);
  }

  private pickTarget(system: MovementSystem): boolean {
    const { random } = system;
    const circle = this.settings.circle;
    if (circle && this.circleSign === 0)
      this.circleSign = random() < 0.5 ? -1 : 1;

    for (let i = 0; i < PICK_ATTEMPTS; i++) {
      const angle = circle
        ? Math.atan2(system.x - system.homeX, system.z - system.homeZ) +
          this.circleSign * CIRCLE_STEP * (1 + random())
        : random() * Math.PI * 2;
      const distance = circle
        ? this.radius * (CIRCLE_INNER + (1 - CIRCLE_INNER) * random())
        : this.radius * Math.sqrt(random());
      const x = system.homeX + Math.sin(angle) * distance;
      const z = system.homeZ + Math.cos(angle) * distance;
      if (Math.hypot(x - system.x, z - system.z) < MIN_WANDER_STEP) continue;
      if (!system.habitat.canBe(x, z)) continue;
      this.targetX = x;
      this.targetZ = z;
      this.targetLevel = random();
      this.closest = Infinity;
      this.stalled = 0;
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
