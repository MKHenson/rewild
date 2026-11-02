import { LocomotionSetName } from 'models';
import { Vector3 } from 'rewild-common';
import { WaterQuerySample } from 'rewild-renderer';
import { CreatureWorld } from './Habitat';
import { ICreatureAnimator } from './MovementSystem';

/** A stub world for specs: heights and water depth as functions of (x, z). */
export class TestWorld implements CreatureWorld {
  height: (x: number, z: number) => number | null = () => 0;
  depth: (x: number, z: number) => number = () => 0;
  player: Vector3 | null = null;

  sampleHeight(x: number, z: number): number | null {
    return this.height(x, z);
  }

  sampleWater(x: number, z: number, out: WaterQuerySample): boolean {
    const depth = this.depth(x, z);
    out.wet = depth > 0;
    out.depth = depth;
    return true;
  }

  playerPosition(out: Vector3): boolean {
    if (!this.player) return false;
    out.copy(this.player);
    return true;
  }
}

/** Records what movement modes ask the animation controller for. */
export class TestAnimator implements ICreatureAnimator {
  calls: string[] = [];
  locomotion: LocomotionSetName = 'normal';

  play(meaning: string): boolean {
    this.calls.push(`play ${meaning}`);
    return true;
  }

  stop(meaning: string): void {
    this.calls.push(`stop ${meaning}`);
  }

  setLocomotion(name: LocomotionSetName): void {
    this.locomotion = name;
    this.calls.push(`set ${name}`);
  }
}
