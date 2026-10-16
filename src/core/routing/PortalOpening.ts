/** A closed portal's size, as a share of its radius. */
export const CLOSED_SCALE = 0.18;
/** Distances from the portal's centre, in radii, at which it opens and closes. */
export const OPEN_RANGE = 6;
export const CLOSE_RANGE = 8;
/** Seconds to open fully and to close fully. */
const OPEN_SECONDS = 3;
const CLOSE_SECONDS = 3.5;
/** Openness at which the lightning bursts out. */
export const BURST_AT = 0.6;
/** A closed portal bobs this high either way, in radii, once every BOB_PERIOD seconds. */
const BOB_HEIGHT = 0.12;
const BOB_PERIOD = 2.6;
/** An open portal breathes in and out by this share of its size, once every BREATH_PERIOD seconds. */
export const BREATH = 0.03;
const BREATH_PERIOD = 4;

/** What changed in an update. */
export type PortalOpeningEvent = 'none' | 'opening' | 'burst' | 'closing';

/**
 * Whether a portal is open, driven by how near the player is. Closed, it is
 * small and bobs; as the player nears it opens to full size, bursting into
 * lightning part way, and it closes again as they leave. The gap between
 * OPEN_RANGE and CLOSE_RANGE keeps it from flickering at the edge.
 */
export class PortalOpening {
  private _openness: number;
  private opening: boolean;
  private time = 0;

  constructor(open: boolean) {
    this._openness = open ? 1 : 0;
    this.opening = open;
  }

  /** 0 closed to 1 open. */
  get openness(): number {
    return this._openness;
  }

  get isOpen(): boolean {
    return this._openness >= 1;
  }

  /** Whether it is part way open, opening or closing. */
  get isChanging(): boolean {
    return this._openness > 0 && this._openness < 1;
  }

  /** The portal's size now, as a share of its radius, breathing once open. */
  get scale(): number {
    const eased = this.eased;
    const breath =
      BREATH * eased * Math.sin((this.time / BREATH_PERIOD) * Math.PI * 2);
    return (CLOSED_SCALE + (1 - CLOSED_SCALE) * eased) * (1 + breath);
  }

  /** How far the portal sits above its place now, in radii. */
  get bob(): number {
    const wave = Math.sin((this.time / BOB_PERIOD) * Math.PI * 2);
    return wave * BOB_HEIGHT * (1 - this.eased);
  }

  /** Advances by `seconds` with the player `distance` metres from a portal of `radius`. */
  update(
    seconds: number,
    distance: number,
    radius: number
  ): PortalOpeningEvent {
    this.time += seconds;
    let event: PortalOpeningEvent = 'none';
    if (!this.opening && distance < radius * OPEN_RANGE) {
      this.opening = true;
      event = 'opening';
    } else if (this.opening && distance > radius * CLOSE_RANGE) {
      this.opening = false;
      event = 'closing';
    }

    const before = this._openness;
    const step = this.opening
      ? seconds / OPEN_SECONDS
      : -seconds / CLOSE_SECONDS;
    this._openness = Math.min(1, Math.max(0, before + step));
    if (event === 'none' && before < BURST_AT && this._openness >= BURST_AT)
      event = 'burst';
    return event;
  }

  private get eased(): number {
    const t = this._openness;
    return t * t * (3 - 2 * t);
  }
}
