import { toFloat16, fromFloat16 } from '../../utils/float16';
import { LAKE, MAX_WATER_TYPES, OCEAN } from '../terrain/Water';
import type { WaterMap } from '../terrain/WaterMap';
import {
  WATER_LEVEL_TEXEL,
  WATER_LEVEL_TEXELS,
  WaterLevelField,
  fillWaterLevels,
} from './WaterLevelField';

// Chunks span 4 texels, so a map is 5 texels a side and chunk (cx, cy) holds
// world texels i in [4cx - 2, 4cx + 2], j likewise, row 0 at the highest j.
const CHUNK_TEXELS = 4;
const MAP = CHUNK_TEXELS + 1;

function lakeMap(baseLevel: number): WaterMap {
  const texels = MAP * MAP;
  const map: WaterMap = {
    size: MAP,
    step: 4,
    baseLevel,
    maxLevel: baseLevel + 2,
    shows: true,
    level: new Uint16Array(texels),
    heights: new Uint16Array(texels),
    coverage: new Uint8Array(texels),
    typeWeights: new Uint8Array(texels * 4),
    bodyIds: new Uint32Array(texels),
    flow: new Int8Array(texels * 2),
    bodies: [],
  };
  // World texel (1, 1) of chunk (0, 0): column 3, row 1.
  const t = 8;
  map.level[t] = toFloat16(2);
  map.coverage[t] = 255;
  map.typeWeights[t * 4 + 1] = 255;
  return map;
}

describe('fillWaterLevels', () => {
  const size = 6;
  const fill = (maps: Map<string, WaterMap>) => {
    const levels = new Float32Array(size * size * 2);
    const optics = new Uint16Array(size * size * 4);
    fillWaterLevels(
      (cx, cy) => maps.get(`${cx},${cy}`) ?? null,
      CHUNK_TEXELS,
      [OCEAN, LAKE],
      -2,
      -2,
      size,
      0,
      size,
      levels,
      optics,
      new Float64Array(MAX_WATER_TYPES),
      new Float64Array(3),
      new Float64Array(3)
    );
    return { levels, optics };
  };
  // World texel (i, j) in the grid whose texel (0, 0) is world (-2, -2).
  const at = (i: number, j: number) => i + 2 + (j + 2) * size;

  it('takes each texel’s level and coverage from its chunk’s map', () => {
    const { levels } = fill(new Map([['0,0', lakeMap(100)]]));
    expect(levels[at(1, 1) * 2]).toBe(102);
    expect(levels[at(1, 1) * 2 + 1]).toBe(1);
    expect(levels[at(0, 0) * 2 + 1]).toBe(0);
  });

  it('gives a covered texel its water type’s extinction', () => {
    const { optics } = fill(new Map([['0,0', lakeMap(100)]]));
    const g = at(1, 1) * 4;
    for (let c = 0; c < 3; c++)
      expect(fromFloat16(optics[g + c])).toBeCloseTo(
        LAKE.absorption[c] + LAKE.turbidity,
        2
      );
  });

  it('leaves texels with no water map dry', () => {
    const { levels } = fill(new Map());
    expect(levels.every((v) => v === 0)).toBe(true);
  });
});

// Node has no WebGPU: textures are created and written into nothing.
(globalThis as Record<string, unknown>).GPUTextureUsage ??= {
  COPY_DST: 2,
  TEXTURE_BINDING: 4,
};
const device = {
  createTexture: () => ({ destroy() {}, createView: () => ({}) }),
  queue: { writeTexture() {} },
} as unknown as GPUDevice;

describe('WaterLevelField.invalidate', () => {
  const update = (field: WaterLevelField, seconds: number) =>
    field.update(device, seconds, 0, 0, CHUNK_TEXELS, () => null, []);

  function built(): WaterLevelField {
    const field = new WaterLevelField();
    for (let i = 0; i < 100 && !field.built; i++) update(field, 0);
    return field;
  }

  it('rebuilds for water it covers', () => {
    const field = built();
    field.invalidate(0, 0, 10, 10);
    update(field, 2);
    expect(field['row']).toBeGreaterThan(0);
  });

  it('ignores water beyond it', () => {
    const field = built();
    const far = WATER_LEVEL_TEXELS * WATER_LEVEL_TEXEL;
    field.invalidate(far, far, far + 10, far + 10);
    update(field, 2);
    expect(field['row']).toBe(-1);
  });
});
