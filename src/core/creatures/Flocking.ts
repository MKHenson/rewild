/** How members of a group steer by each other. Weights scale each pull. */
export interface FlockSettings {
  /** m/s a calm member swims at. Alignment is measured against it. */
  cruiseSpeed: number;
  /** Metres within which members see each other. */
  neighbourRadius: number;
  /** Metres members keep between them. */
  spacing: number;
  separation: number;
  alignment: number;
  cohesion: number;
  /** Pull toward the home, growing with distance. */
  home: number;
  /** Metres from home inside which the home pulls gently. */
  homeRadius: number;
}

/** Neighbours a member aligns and gathers with, at most. */
export const MAX_NEIGHBOURS = 10;

/**
 * The pull on one member of a group, built up neighbour by neighbour. Call
 * `begin`, `neighbour` for each member near it, then `gather` and the other
 * pulls; read `x`, `y` and `z`. Pulls are unitless: about 1 at full weight,
 * so a caller scales them by an acceleration.
 */
export class FlockPull {
  x = 0;
  y = 0;
  z = 0;
  /** Neighbours aligned and gathered with since `begin`. */
  seen = 0;

  private sepX = 0;
  private sepY = 0;
  private sepZ = 0;
  private aliX = 0;
  private aliY = 0;
  private aliZ = 0;
  private cohX = 0;
  private cohY = 0;
  private cohZ = 0;

  constructor(readonly settings: FlockSettings) {}

  begin(): void {
    this.x = this.y = this.z = 0;
    this.seen = 0;
    this.sepX = this.sepY = this.sepZ = 0;
    this.aliX = this.aliY = this.aliZ = 0;
    this.cohX = this.cohY = this.cohZ = 0;
  }

  /**
   * A neighbour at offset (ox, oy, oz) from the member, moving at (vx, vy,
   * vz). One past the neighbour radius counts for nothing. Spacing counts
   * every neighbour; alignment and cohesion only the first MAX_NEIGHBOURS.
   */
  neighbour(
    ox: number,
    oy: number,
    oz: number,
    vx: number,
    vy: number,
    vz: number
  ): void {
    const { neighbourRadius, spacing } = this.settings;
    const dSq = ox * ox + oy * oy + oz * oz;
    if (dSq >= neighbourRadius * neighbourRadius) return;
    const d = Math.sqrt(dSq);
    if (d < spacing && d > 1e-6) {
      const push = (spacing - d) / (spacing * d);
      this.sepX -= ox * push;
      this.sepY -= oy * push;
      this.sepZ -= oz * push;
    }
    if (this.seen >= MAX_NEIGHBOURS) return;
    this.seen++;
    this.aliX += vx;
    this.aliY += vy;
    this.aliZ += vz;
    this.cohX += ox;
    this.cohY += oy;
    this.cohZ += oz;
  }

  /** Adds separation, alignment and cohesion, for a member moving at (vx, vy, vz). */
  gather(vx: number, vy: number, vz: number): void {
    const s = this.settings;
    this.x += this.sepX * s.separation;
    this.y += this.sepY * s.separation;
    this.z += this.sepZ * s.separation;
    const seen = this.seen;
    if (seen === 0) return;
    const a = s.alignment / s.cruiseSpeed;
    this.x += (this.aliX / seen - vx) * a;
    this.y += (this.aliY / seen - vy) * a;
    this.z += (this.aliZ / seen - vz) * a;
    const k = s.cohesion / (seen * s.neighbourRadius);
    this.x += this.cohX * k;
    this.y += this.cohY * k;
    this.z += this.cohZ * k;
  }

  /** Adds the pull toward a home at offset (hx, hy, hz) from the member. */
  home(hx: number, hy: number, hz: number): void {
    const pull = this.settings.home / this.settings.homeRadius;
    this.x += hx * pull;
    this.y += hy * pull;
    this.z += hz * pull;
  }

  /**
   * Adds a push of `weight` away from a threat at offset (ox, oy, oz) from
   * the member, fading out at `reach` metres. Returns the fear, 0 to 1.
   */
  flee(
    ox: number,
    oy: number,
    oz: number,
    reach: number,
    weight: number
  ): number {
    const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (d >= reach || d <= 1e-6) return 0;
    const fear = 1 - d / reach;
    const push = (weight * fear) / d;
    this.x -= ox * push;
    this.y -= oy * push * 0.5;
    this.z -= oz * push;
    return fear;
  }
}
