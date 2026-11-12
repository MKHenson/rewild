import { Vector3 } from 'rewild-common';
import { Transform } from 'rewild-renderer';
import { FootIKSettings } from './CreaturePresets';
import { CreatureWorld } from './Habitat';

/** Below this the layer is off, so it costs nothing. */
const MIN_WEIGHT = 0.001;

/** Metres above the ground at which a creature counts as off it. */
const GROUNDED_SLACK = 0.05;

const _foot = new Vector3();

/** What FootPlant places. SkinnedInstance is one. */
export interface FootTarget {
  readonly footCount: number;
  legReach(leg: number): number;
  /** The clip's foot in model space, before IK. */
  footPosition(leg: number, out: Vector3): Vector3;
  setFootOffset(leg: number, offset: number): void;
  setFootWeight(weight: number): void;
  setBodyTilt(pitch: number, roll: number): void;
}

/**
 * Sets each foot of a standing creature to the terrain under it, measured
 * from the ground at the creature's pivot. Off the ground it eases back to
 * the clip's feet.
 */
export class FootPlant {
  weight = 0;
  /** Each foot's offset in model space, as last set. */
  readonly offsets: Float32Array;

  private readonly settings: FootIKSettings;
  private readonly target: FootTarget;
  private readonly transform: Transform;
  private readonly world: CreatureWorld;

  constructor(
    settings: FootIKSettings,
    target: FootTarget,
    transform: Transform,
    world: CreatureWorld
  ) {
    this.settings = settings;
    this.target = target;
    this.transform = transform;
    this.world = world;
    this.offsets = new Float32Array(target.footCount);
    target.setBodyTilt(settings.pitch ?? 0, settings.roll ?? 0);
  }

  /** Call after the creature's world matrix is up to date. */
  update(dt: number): void {
    const { target, offsets, world } = this;
    const { smoothing, maxStep } = this.settings;
    const t = 1 - Math.exp(-dt / smoothing);
    const matrix = this.transform.matrixWorld;
    const m = matrix.elements;
    const pivot = m[13];
    const ground = world.sampleHeight(m[12], m[14]);
    const grounded = ground !== null && pivot <= ground + GROUNDED_SLACK;
    const scale = Math.hypot(m[4], m[5], m[6]);

    for (let leg = 0; leg < offsets.length; leg++) {
      let goal = 0;
      if (grounded) {
        target.footPosition(leg, _foot).applyMatrix4(matrix);
        const under = world.sampleHeight(_foot.x, _foot.z);
        if (under !== null) {
          const limit = maxStep * target.legReach(leg);
          goal = Math.min(limit, Math.max(-limit, (under - pivot) / scale));
        }
      }
      offsets[leg] += (goal - offsets[leg]) * t;
      target.setFootOffset(leg, offsets[leg]);
    }

    this.weight += ((grounded ? 1 : 0) - this.weight) * t;
    if (!grounded && this.weight < MIN_WEIGHT) this.weight = 0;
    target.setFootWeight(this.weight);
  }
}
