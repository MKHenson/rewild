import { smoothstep } from 'rewild-common';
import type { AudioScope, PlayOptions } from 'rewild-audio';

// Landing speeds are in Player.verticalVelocity's units, down: a jump on flat
// ground lands at about 10.5, and a fall hurts from 15.

/** Speed below which touching down makes no landing, as off a small bump. */
export const LAND_FROM = 3;
/** Speed at which a landing is at full gain. */
const LAND_FULL_AT = 15;
/** A landing's gain at `LAND_FROM`. */
const LAND_SOFTEST = 0.3;

export type LandingSoundName = 'land' | 'land-hard';

/** The landing for touching down at `speed`, or null for none. A landing that hurts is a hard one. */
export function landingSound(
  speed: number,
  hurt: boolean
): LandingSoundName | null {
  if (hurt) return 'land-hard';
  return speed >= LAND_FROM ? 'land' : null;
}

/** A landing's gain: soft off a ledge, full from a fall that nearly hurts. */
export function landingGain(speed: number): number {
  return (
    LAND_SOFTEST +
    (1 - LAND_SOFTEST) * smoothstep(speed, LAND_FROM, LAND_FULL_AT)
  );
}

/**
 * The player's body: the push off of a jump, the thud of a landing, sized by
 * the fall, and the flashlight's click. All on the player bus, in 2D. A
 * landing returns whether it played, so the caller can add a footstep for the
 * ground landed on.
 */
export class BodySound {
  private readonly _options: PlayOptions = { bus: 'player', gain: 1 };

  constructor(private readonly _sink: Pick<AudioScope, 'play'>) {}

  jump(): void {
    this._play('jump', 1);
  }

  /**
   * @param speed Player.verticalVelocity, downward, as the feet touch down.
   * @param hurt  Whether the fall did damage.
   * @returns Whether a landing played.
   */
  land(speed: number, hurt: boolean): boolean {
    const sound = landingSound(speed, hurt);
    if (!sound) return false;
    this._play(sound, hurt ? 1 : landingGain(speed));
    return true;
  }

  /** The body slamming into an obstacle. */
  impact(): void {
    this._play('land-hard', 1);
  }

  flashlight(): void {
    this._play('flashlight', 1);
  }

  private _play(name: string, gain: number): void {
    this._options.gain = gain;
    this._sink.play(name, this._options);
  }
}
