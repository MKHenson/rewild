import type { WaterBody } from './Lakes';
import { MAX_WATER_TYPES } from './Water';

// The records of the water bodies a level has changed: drained, added, or
// with a spill height found after a sculpt. A body with no record here is
// rebuilt from the seed or its water edit. Saved as one blob per level.

export const WATER_BODIES_VERSION = 1;

/**
 * Async lookup for a level's saved body records, injected by the host app.
 * Resolves an empty list when none were saved.
 */
export type WaterBodyProvider = () => Promise<WaterBody[]>;

export function serializeWaterBodies(bodies: Iterable<WaterBody>): ArrayBuffer {
  const records = [...bodies].map((b) => ({
    id: b.id,
    level: b.level,
    spillHeight: b.spillHeight,
    typeWeights: b.typeWeights,
  }));
  const json = JSON.stringify({
    version: WATER_BODIES_VERSION,
    bodies: records,
  });
  return new TextEncoder().encode(json).buffer as ArrayBuffer;
}

/** Throws on anything malformed; callers treat a throw as no records. */
export function deserializeWaterBodies(buffer: ArrayBuffer): WaterBody[] {
  const data = JSON.parse(new TextDecoder().decode(buffer));
  if (data?.version !== WATER_BODIES_VERSION)
    throw new Error(`Unsupported water bodies version ${data?.version}.`);
  if (!Array.isArray(data.bodies))
    throw new Error('Water bodies blob has no body list.');
  return data.bodies.map((b: any): WaterBody => {
    if (
      !Number.isInteger(b?.id) ||
      b.id < 0 ||
      typeof b.level !== 'number' ||
      typeof b.spillHeight !== 'number' ||
      !Array.isArray(b.typeWeights)
    )
      throw new Error('Malformed water body record.');
    const typeWeights = new Array<number>(MAX_WATER_TYPES).fill(0);
    for (let c = 0; c < MAX_WATER_TYPES; c++)
      typeWeights[c] = Number(b.typeWeights[c]) || 0;
    return {
      id: b.id,
      level: b.level,
      spillHeight: b.spillHeight,
      typeWeights,
    };
  });
}
