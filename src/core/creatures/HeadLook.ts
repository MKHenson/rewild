import { Matrix4, Vector3 } from 'rewild-common';
import { Transform } from 'rewild-renderer';
import { LookAtSettings } from './CreaturePresets';
import { CreatureWorld } from './Habitat';

/** Below this the layer is off, so it costs nothing. */
const MIN_WEIGHT = 0.001;

const _player = new Vector3();
const _inverse = new Matrix4();

/** What HeadLook turns. SkinnedInstance is one. */
export interface LookTarget {
  /** The head in the rest pose, in model space. */
  readonly lookOrigin: Vector3;
  setLook(yaw: number, pitch: number, weight: number): void;
}

/**
 * Turns a creature's head to the player while they are near and inside its
 * limits. Outside them it eases back to the clip's forward.
 */
export class HeadLook {
  yaw = 0;
  pitch = 0;
  weight = 0;

  private readonly settings: LookAtSettings;
  private readonly target: LookTarget;
  private readonly transform: Transform;
  private readonly world: CreatureWorld;
  private aimYaw = 0;
  private aimPitch = 0;

  constructor(
    settings: LookAtSettings,
    target: LookTarget,
    transform: Transform,
    world: CreatureWorld
  ) {
    this.settings = settings;
    this.target = target;
    this.transform = transform;
    this.world = world;
  }

  /** Call after the creature's world matrix is up to date. */
  update(dt: number): void {
    const t = 1 - Math.exp(-dt / this.settings.smoothing);

    if (this.aim()) {
      if (this.weight === 0) {
        this.yaw = this.aimYaw;
        this.pitch = this.aimPitch;
      } else {
        this.yaw += (this.aimYaw - this.yaw) * t;
        this.pitch += (this.aimPitch - this.pitch) * t;
      }
      this.weight += (1 - this.weight) * t;
    } else {
      this.weight -= this.weight * t;
      if (this.weight < MIN_WEIGHT) this.weight = 0;
    }

    this.target.setLook(this.yaw, this.pitch, this.weight);
  }

  /** Reads the angles to the player. False when the head should not follow. */
  private aim(): boolean {
    if (!this.world.playerPosition(_player)) return false;

    const { radius, yawLimit, pitchLimit } = this.settings;
    const matrix = this.transform.matrixWorld;
    const m = matrix.elements;
    const dx = _player.x - m[12];
    const dy = _player.y - m[13];
    const dz = _player.z - m[14];
    if (dx * dx + dy * dy + dz * dz > radius * radius) return false;

    _player.applyMatrix4(_inverse.copy(matrix).invert());
    const { lookOrigin } = this.target;
    const x = _player.x - lookOrigin.x;
    const y = _player.y - lookOrigin.y;
    const z = _player.z - lookOrigin.z;

    this.aimYaw = Math.atan2(x, z);
    this.aimPitch = Math.atan2(y, Math.hypot(x, z));
    return (
      Math.abs(this.aimYaw) <= yawLimit && Math.abs(this.aimPitch) <= pitchLimit
    );
  }
}
