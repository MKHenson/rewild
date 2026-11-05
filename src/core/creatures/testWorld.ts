import { LocomotionSetName } from 'models';
import { Vector3 } from 'rewild-common';
import { WaterQuerySample } from 'rewild-renderer';
import { CreatureWorld } from './Habitat';
import { ICreatureAnimator } from './MovementSystem';

/** A stub world for specs: heights and water depth as functions of (x, z). */
export class TestWorld implements CreatureWorld {
  height: (x: number, z: number) => number | null = () => 0;
  depth: (x: number, z: number) => number = () => 0;
  /** Water type names by palette index. All the water is the first type. */
  palette: string[] = ['lake'];
  player: Vector3 | null = null;

  sampleHeight(x: number, z: number): number | null {
    return this.height(x, z);
  }

  sampleWater(x: number, z: number, out: WaterQuerySample): boolean {
    const ground = this.height(x, z);
    if (ground === null) return false;
    const depth = this.depth(x, z);
    out.wet = depth > 0;
    out.ground = ground;
    out.depth = depth;
    out.level = depth > 0 ? ground + depth : -Infinity;
    out.typeWeights.fill(0);
    out.typeWeights[0] = 1;
    return true;
  }

  waterTypeIndex(name: string): number {
    return this.palette.indexOf(name);
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
