import { Vector2 } from 'rewild-common';
import { ClimateConfig, DEFAULT_CLIMATE, DEFAULT_CONTINENT } from './Biomes';
import { OCEAN_BODY_ID } from './Lakes';
import { MAX_WATER_TYPES } from './Water';
import {
  WATER_EDIT_AUTHORITY,
  WATER_EDIT_COVERAGE,
  WATER_EDIT_STEP,
  WATER_EDIT_TYPES,
  WaterEdit,
  WaterStamp,
  applyWaterEdit,
  applyWaterStamp,
  createWaterEdit,
  createWaterEditSample,
  deserializeWaterEdit,
  editedBodyId,
  isWaterEditEmpty,
  isWaterEditValid,
  serializeWaterEdit,
} from './WaterEdit';
import { ResolvedWater, buildWaterMap } from './WaterMap';
import { fromFloat16 } from '../../utils/float16';

const CHUNK_SIZE = 65;
const SIZE = (CHUNK_SIZE - 1) / WATER_EDIT_STEP + 1;
const METERS_PER_SAMPLE = 2;
const SPAN = (CHUNK_SIZE - 1) * METERS_PER_SAMPLE;
const LAKE_TYPE = [0, 1, 0, 0];

const OPEN_OCEAN: ClimateConfig = {
  ...DEFAULT_CLIMATE,
  continent: { ...DEFAULT_CONTINENT, coast: 2 },
};
const INLAND: ClimateConfig = {
  ...DEFAULT_CLIMATE,
  continent: { ...DEFAULT_CONTINENT, coast: -1 },
};

function plane(edit: WaterEdit, channel: number): Uint8Array {
  const texels = edit.mask.size * edit.mask.size;
  return edit.mask.weights.subarray(channel * texels, (channel + 1) * texels);
}

// Every texel of `edit` owned outright, holding `coverage` at `level`.
function ownAll(edit: WaterEdit, coverage: number, level: number, bodyId = 7) {
  plane(edit, WATER_EDIT_AUTHORITY).fill(255);
  plane(edit, WATER_EDIT_COVERAGE).fill(Math.round(coverage * 255));
  plane(edit, WATER_EDIT_TYPES + 1).fill(255);
  edit.level.fill(level);
  edit.bodyIds.fill(bodyId);
}

function stamp(overrides: Partial<WaterStamp> = {}): WaterStamp {
  return {
    type: 'add',
    centerX: 0,
    centerZ: 0,
    radius: 30,
    amount: 1,
    level: 4,
    bodyId: 9,
    typeWeights: LAKE_TYPE,
    ...overrides,
  };
}

describe('water edit format', () => {
  it('round-trips through its blob', () => {
    const edit = createWaterEdit(CHUNK_SIZE);
    for (let i = 0; i < edit.mask.weights.length; i++)
      edit.mask.weights[i] = (i * 37) & 255;
    for (let t = 0; t < edit.level.length; t++) {
      edit.level[t] = t * 0.25 - 3;
      edit.bodyIds[t] = t * 101;
    }

    const read = deserializeWaterEdit(serializeWaterEdit(edit));
    expect(read.mask.size).toBe(SIZE);
    expect(Array.from(read.mask.weights)).toEqual(
      Array.from(edit.mask.weights)
    );
    expect(Array.from(read.level)).toEqual(Array.from(edit.level));
    expect(Array.from(read.bodyIds)).toEqual(Array.from(edit.bodyIds));
    expect(isWaterEditValid(read, CHUNK_SIZE)).toBe(true);
    expect(isWaterEditValid(read, 129)).toBe(false);
  });

  it('rejects a blob of the wrong version or length', () => {
    const blob = serializeWaterEdit(createWaterEdit(CHUNK_SIZE));
    const versioned = blob.slice(0);
    new DataView(versioned).setUint32(0, 99, true);
    expect(() => deserializeWaterEdit(versioned)).toThrow();
    expect(() =>
      deserializeWaterEdit(blob.slice(0, blob.byteLength - 4))
    ).toThrow();
  });

  it('is empty until it owns a texel', () => {
    const edit = createWaterEdit(CHUNK_SIZE);
    expect(isWaterEditEmpty(edit)).toBe(true);
    plane(edit, WATER_EDIT_AUTHORITY)[5] = 1;
    expect(isWaterEditEmpty(edit)).toBe(false);
  });

  it('makes body ids clear of the ocean and generated lakes', () => {
    for (let seed = -50; seed < 50; seed++) {
      const id = editedBodyId(seed);
      expect(id).toBeGreaterThan(OCEAN_BODY_ID);
      expect(id & 0x80000000).toBe(0);
    }
  });
});

describe('applyWaterEdit', () => {
  const types = new Float64Array(MAX_WATER_TYPES);
  const scratch = createWaterEditSample();

  it('leaves the generated water where the edit owns nothing', () => {
    const edit = createWaterEdit(CHUNK_SIZE);
    types.set([1, 0, 0, 0]);
    const water = { level: 12, bodyId: OCEAN_BODY_ID };
    expect(applyWaterEdit(edit, 8, 8, water, 1, types, scratch)).toBe(1);
    expect(water).toEqual({ level: 12, bodyId: OCEAN_BODY_ID });
    expect(Array.from(types)).toEqual([1, 0, 0, 0]);
  });

  it('adds water on dry ground at its own level and type', () => {
    const edit = createWaterEdit(CHUNK_SIZE);
    ownAll(edit, 1, 30);
    types.fill(0);
    const water = { level: 0, bodyId: OCEAN_BODY_ID };
    expect(applyWaterEdit(edit, 9.5, 20, water, 0, types, scratch)).toBe(1);
    expect(water.level).toBeCloseTo(30);
    expect(water.bodyId).toBe(7);
    expect(Array.from(types)).toEqual([0, 1, 0, 0]);
  });

  it('removes generated water and keeps its level', () => {
    const edit = createWaterEdit(CHUNK_SIZE);
    ownAll(edit, 0, 30);
    types.set([1, 0, 0, 0]);
    const water = { level: 12, bodyId: OCEAN_BODY_ID };
    expect(applyWaterEdit(edit, 8, 8, water, 1, types, scratch)).toBe(0);
    expect(water.level).toBe(12);
  });

  it('shares a texel by its authority', () => {
    const edit = createWaterEdit(CHUNK_SIZE);
    ownAll(edit, 0, 30);
    plane(edit, WATER_EDIT_AUTHORITY).fill(Math.round(255 * 0.25));
    types.set([1, 0, 0, 0]);
    const water = { level: 12, bodyId: OCEAN_BODY_ID };
    expect(applyWaterEdit(edit, 8, 8, water, 1, types, scratch)).toBeCloseTo(
      0.75,
      2
    );
  });
});

describe('applyWaterStamp', () => {
  // A 2 × 2 block of chunks around the origin, so the stamp crosses both seams.
  function source() {
    const edits = new Map<string, WaterEdit>();
    for (const cx of [-1, 0])
      for (const cy of [-1, 0])
        edits.set(`${cx},${cy}`, createWaterEdit(CHUNK_SIZE));
    return {
      edits,
      source: {
        chunkSize: CHUNK_SIZE,
        metersPerSample: METERS_PER_SAMPLE,
        getEdit: (cx: number, cy: number) => edits.get(`${cx},${cy}`) ?? null,
      },
    };
  }

  // The world corner the four chunks share, with every copy of it.
  const corner = { x: -SPAN / 2, z: -SPAN / 2 };

  it('writes a shared edge texel identically in every chunk', () => {
    const { edits, source: s } = source();
    const touched = applyWaterStamp(
      s,
      stamp({ centerX: corner.x, centerZ: corner.z })
    );
    expect(touched.length).toBe(4);

    const last = SIZE - 1;
    const copies = [
      { key: '0,0', texel: last * SIZE + 0 },
      { key: '-1,0', texel: last * SIZE + last },
      { key: '0,-1', texel: 0 },
      { key: '-1,-1', texel: last },
    ];
    for (const { key, texel } of copies) {
      const edit = edits.get(key)!;
      expect(plane(edit, WATER_EDIT_AUTHORITY)[texel]).toBe(255);
      expect(plane(edit, WATER_EDIT_COVERAGE)[texel]).toBe(255);
      expect(edit.level[texel]).toBe(4);
      expect(edit.bodyIds[texel]).toBe(9);
    }
  });

  it('skips a texel one of its owners cannot edit', () => {
    const { edits, source: s } = source();
    edits.delete('-1,-1');
    applyWaterStamp(s, stamp({ centerX: corner.x, centerZ: corner.z }));
    expect(
      plane(edits.get('0,0')!, WATER_EDIT_AUTHORITY)[(SIZE - 1) * SIZE]
    ).toBe(0);
  });

  it('hands texels back to the generator as a reset is held', () => {
    const { edits, source: s } = source();
    applyWaterStamp(s, stamp({ centerX: corner.x, centerZ: corner.z }));
    for (let i = 0; i < 64; i++)
      applyWaterStamp(
        s,
        stamp({ type: 'reset', centerX: corner.x, centerZ: corner.z })
      );
    for (const edit of edits.values())
      expect(isWaterEditEmpty(edit)).toBe(true);
  });

  it('leaves texels its guard blocks', () => {
    const { edits, source: s } = source();
    const i0 = corner.x / (METERS_PER_SAMPLE * WATER_EDIT_STEP) - 4;
    const blocked = new Uint8Array(81);
    blocked[4 * 9 + 4] = 1;
    applyWaterStamp(
      s,
      stamp({
        centerX: corner.x,
        centerZ: corner.z,
        guard: { i0, j0: i0, width: 9, height: 9, blocked },
      })
    );
    const edit = edits.get('0,0')!;
    expect(plane(edit, WATER_EDIT_AUTHORITY)[(SIZE - 1) * SIZE]).toBe(0);
    expect(
      plane(edit, WATER_EDIT_AUTHORITY)[(SIZE - 1) * SIZE + 1]
    ).toBeGreaterThan(0);
  });

  it('fills to the radius with a hard stamp', () => {
    const { edits, source: s } = source();
    applyWaterStamp(
      s,
      stamp({ centerX: corner.x, centerZ: corner.z, hard: true })
    );
    const edit = edits.get('0,0')!;
    const texel = (SIZE - 1) * SIZE + 3;
    expect(plane(edit, WATER_EDIT_COVERAGE)[texel]).toBe(255);
    expect(plane(edit, WATER_EDIT_TYPES + 1)[texel]).toBe(255);
  });

  it('removes water by owning it with none', () => {
    const { edits, source: s } = source();
    applyWaterStamp(s, stamp({ type: 'remove' }));
    const centre = edits.get('0,0')!;
    const texel = ((SIZE - 1) / 2) * (SIZE + 1);
    expect(plane(centre, WATER_EDIT_AUTHORITY)[texel]).toBe(255);
    expect(plane(centre, WATER_EDIT_COVERAGE)[texel]).toBe(0);
  });
});

describe('buildWaterMap with an edit', () => {
  const offset = new Vector2(0, 0);
  const dry = () => new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(5);

  it('adds a pond on dry ground as its own body', () => {
    expect(
      buildWaterMap(CHUNK_SIZE, 4242, offset, INLAND, 0, dry())
    ).toBeNull();

    const edit = createWaterEdit(CHUNK_SIZE);
    ownAll(edit, 1, 8, 1234);
    const water = buildWaterMap(
      CHUNK_SIZE,
      4242,
      offset,
      INLAND,
      0,
      dry(),
      edit
    )!;
    expect(water.shows).toBe(true);
    expect(water.baseLevel).toBeCloseTo(8);
    expect(water.coverage[0]).toBe(255);
    expect(water.bodyIds[0]).toBe(1234);
    expect(water.typeWeights[1]).toBe(255);
    expect(water.bodies).toEqual([
      expect.objectContaining({ id: 1234, level: 8 }),
    ]);
  });

  it('removes the open sea', () => {
    const heights = new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(-10);
    const edit = createWaterEdit(CHUNK_SIZE);
    ownAll(edit, 0, 0);
    expect(
      buildWaterMap(CHUNK_SIZE, 4242, offset, OPEN_OCEAN, 0, heights, edit)
    ).toBeNull();
  });

  it('keeps the sea level where it adds sea water', () => {
    const heights = new Float32Array(CHUNK_SIZE * CHUNK_SIZE).fill(-10);
    const edit = createWaterEdit(CHUNK_SIZE);
    ownAll(edit, 1, 0, OCEAN_BODY_ID);
    const water = buildWaterMap(
      CHUNK_SIZE,
      4242,
      offset,
      OPEN_OCEAN,
      0,
      heights,
      edit
    )!;
    expect(fromFloat16(water.level[0])).toBe(0);
    expect(water.bodyIds[0]).toBe(OCEAN_BODY_ID);
  });
});

describe('applyWaterStamp paint', () => {
  // One chunk of lake water at level 3, body 5, with one dry texel east of the
  // centre.
  const CENTRE = 8 * SIZE + 8;
  const DRY = CENTRE + 1;
  function painted(authority = 0) {
    const edit = createWaterEdit(CHUNK_SIZE);
    plane(edit, WATER_EDIT_AUTHORITY).fill(authority);
    const texels = SIZE * SIZE;
    const water: ResolvedWater = {
      size: SIZE,
      step: WATER_EDIT_STEP,
      coverage: new Uint8Array(texels).fill(255),
      levels: new Float64Array(texels).fill(3),
      typeWeights: new Uint8Array(texels * 4),
      bodyIds: new Uint32Array(texels).fill(5),
      lakes: [],
      covered: true,
    };
    water.coverage[DRY] = 0;
    for (let t = 0; t < texels; t++) water.typeWeights[t * 4 + 1] = 255;
    applyWaterStamp(
      {
        chunkSize: CHUNK_SIZE,
        metersPerSample: METERS_PER_SAMPLE,
        getEdit: (cx, cy) => (cx === 0 && cy === 0 ? edit : null),
        getResolved: () => water,
      },
      stamp({ type: 'paint', typeWeights: [1, 0, 0, 0] })
    );
    return edit;
  }

  it('takes the water over as it stands', () => {
    const edit = painted();
    expect(plane(edit, WATER_EDIT_AUTHORITY)[CENTRE]).toBe(255);
    expect(plane(edit, WATER_EDIT_COVERAGE)[CENTRE]).toBe(255);
    expect(edit.level[CENTRE]).toBe(3);
    expect(edit.bodyIds[CENTRE]).toBe(5);
  });

  it('blends its types toward the painted type', () => {
    const edit = painted();
    expect(plane(edit, WATER_EDIT_TYPES)[CENTRE]).toBe(255);
    expect(plane(edit, WATER_EDIT_TYPES + 1)[CENTRE]).toBe(0);
  });

  it('leaves dry ground alone', () => {
    const edit = painted();
    expect(plane(edit, WATER_EDIT_AUTHORITY)[DRY]).toBe(0);
  });

  it('paints an owned texel from the edit itself', () => {
    const edit = painted(255);
    expect(plane(edit, WATER_EDIT_COVERAGE)[CENTRE]).toBe(0);
    expect(plane(edit, WATER_EDIT_TYPES)[CENTRE]).toBe(0);
  });
});
