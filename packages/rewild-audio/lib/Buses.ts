export const BUS_NAMES = [
  'master',
  'music',
  'world',
  'ambience',
  'weather',
  'effects',
  'player',
  'ui',
] as const;

export type BusName = typeof BUS_NAMES[number];

/** The world's buses, which a loud world sound can duck under it. */
export const DUCKABLE_BUSES = ['ambience', 'weather', 'effects'] as const;

export type DuckableBus = typeof DUCKABLE_BUSES[number];

export const BUS_PARENT: Readonly<Record<BusName, BusName | null>> = {
  master: null,
  music: 'master',
  world: 'master',
  ambience: 'world',
  weather: 'world',
  effects: 'world',
  player: 'master',
  ui: 'master',
};

export function isBusName(value: unknown): value is BusName {
  return (
    typeof value === 'string' &&
    (BUS_NAMES as readonly string[]).includes(value)
  );
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function isBusAncestor(ancestor: BusName, bus: BusName): boolean {
  for (let b = BUS_PARENT[bus]; b !== null; b = BUS_PARENT[b])
    if (b === ancestor) return true;
  return false;
}

/** A soloed bus keeps its ancestors, which carry it to the output, and its descendants. */
export function isAudibleUnderSolo(
  bus: BusName,
  solo: BusName | null
): boolean {
  if (solo === null) return true;
  return bus === solo || isBusAncestor(bus, solo) || isBusAncestor(solo, bus);
}

/** Volume, mute and solo for each bus, reduced to the gain each bus node should hold. */
export class BusMix {
  private readonly _volumes = {} as Record<BusName, number>;
  private readonly _muted = {} as Record<BusName, boolean>;
  private _solo: BusName | null = null;

  constructor() {
    for (const bus of BUS_NAMES) {
      this._volumes[bus] = 1;
      this._muted[bus] = false;
    }
  }

  get solo(): BusName | null {
    return this._solo;
  }

  set solo(bus: BusName | null) {
    this._solo = bus;
  }

  volume(bus: BusName): number {
    return this._volumes[bus];
  }

  setVolume(bus: BusName, volume: number): void {
    this._volumes[bus] = Math.min(1, Math.max(0, volume));
  }

  muted(bus: BusName): boolean {
    return this._muted[bus];
  }

  setMuted(bus: BusName, muted: boolean): void {
    this._muted[bus] = muted;
  }

  gain(bus: BusName): number {
    if (this._muted[bus] || !isAudibleUnderSolo(bus, this._solo)) return 0;
    return this._volumes[bus];
  }

  /** The product of the gains from this bus to the output. */
  effectiveGain(bus: BusName): number {
    let gain = 1;
    for (let b: BusName | null = bus; b !== null; b = BUS_PARENT[b])
      gain *= this.gain(b);
    return gain;
  }
}
