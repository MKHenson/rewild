import { Vector3 } from 'rewild-common';

/** Something that frightens creatures. */
export interface Threat {
  /** Where it is into `out`; false while it is nowhere. */
  position(out: Vector3): boolean;
  /** Scales the distance creatures fear it from. 1 for the player. */
  readonly fright: number;
}

/** The threat a query found. */
export interface ThreatSample {
  x: number;
  y: number;
  z: number;
  /** Metres from the point asked about. */
  distance: number;
  fright: number;
}

export function createThreatSample(): ThreatSample {
  return { x: 0, y: 0, z: 0, distance: 0, fright: 1 };
}

const _position = new Vector3();

/** The threats creatures fear. Each registers itself while it is about. */
export class ThreatField {
  private readonly threats: Threat[] = [];

  add(threat: Threat): void {
    if (!this.threats.includes(threat)) this.threats.push(threat);
  }

  remove(threat: Threat): void {
    const index = this.threats.indexOf(threat);
    if (index > -1) this.threats.splice(index, 1);
  }

  /**
   * The threat at (x, y, z) that frightens most, into `out`: the nearest for
   * its fright, within `reach` × its fright. False when none is that near.
   */
  nearest(
    x: number,
    y: number,
    z: number,
    reach: number,
    out: ThreatSample
  ): boolean {
    let best = Infinity;
    for (let i = 0; i < this.threats.length; i++) {
      const threat = this.threats[i];
      if (threat.fright <= 0 || !threat.position(_position)) continue;
      const distance = Math.hypot(
        _position.x - x,
        _position.y - y,
        _position.z - z
      );
      const scaled = distance / threat.fright;
      if (scaled >= reach || scaled >= best) continue;
      best = scaled;
      out.x = _position.x;
      out.y = _position.y;
      out.z = _position.z;
      out.distance = distance;
      out.fright = threat.fright;
    }
    return best < Infinity;
  }
}

/** The threats of the running game. */
export const gameThreats = new ThreatField();
