/**
 * 0..1: how hard rain falls. `precipitation` is the sky's 0..1; `temperature`
 * turns snow to rain between 0 and 0.5, as the rain does (rainCompute.wgsl).
 */
export function rainShare(precipitation: number, temperature: number): number {
  return Math.max(0, precipitation) * Math.min(1, Math.max(0, temperature * 2));
}

/** How the world wets in rain and dries after it. */
export interface RainWetnessSettings {
  /** Seconds by e for the ground to soak up rain, and to dry once it stops. */
  soakIn: number;
  soakOut: number;
  /** Seconds by e for the film on top to form, and to run off. */
  filmIn: number;
  filmOut: number;
  /** Scale on both; 0 leaves every surface dry. */
  strength: number;
}

export const DEFAULT_RAIN_WETNESS: RainWetnessSettings = {
  soakIn: 20,
  soakOut: 60,
  filmIn: 4,
  filmOut: 25,
  strength: 1,
};

/** `value` after `seconds` easing toward `target`, by e every `rise` seconds
 *  going up and every `fall` going down. */
export function easeWetness(
  value: number,
  target: number,
  seconds: number,
  rise: number,
  fall: number
): number {
  const time = target > value ? rise : fall;
  if (time <= 0) return target;
  return value + (target - value) * (1 - Math.exp(-seconds / time));
}

/**
 * How wet the rain has left the world, for every lit surface (rain-wet.wgsl):
 * the soak, which darkens porous surfaces and lingers long after the rain,
 * and the film on top, which glosses level surfaces and runs off soon after.
 * Both follow the rain's strength, so a drizzle leaves the world damp and a
 * downpour leaves it soaked and shining.
 */
export class RainWetness {
  settings: RainWetnessSettings = { ...DEFAULT_RAIN_WETNESS };
  /** Holds the wetness at a value 0..1 in place of the weather's, for
   *  tuning; null follows the weather. */
  override: number | null = null;
  /** 0..1, as the shaders read them. */
  soak = 0;
  film = 0;
  /** 0..1: how hard rain falls now, for the drops landing on surfaces. */
  falling = 0;
  private soakState = 0;
  private filmState = 0;

  /** Advances by `seconds` under rain falling at `rain` 0..1 (rainShare). */
  update(rain: number, seconds: number): void {
    const s = this.settings;
    const target = Math.min(1, Math.max(0, rain));
    this.soakState = easeWetness(
      this.soakState,
      target,
      seconds,
      s.soakIn,
      s.soakOut
    );
    this.filmState = easeWetness(
      this.filmState,
      target,
      seconds,
      s.filmIn,
      s.filmOut
    );
    const strength = Math.max(0, s.strength);
    const held = this.override;
    this.soak = Math.min(1, (held ?? this.soakState) * strength);
    this.film = Math.min(1, (held ?? this.filmState) * strength);
    this.falling = Math.min(1, (held ?? target) * strength);
  }
}
