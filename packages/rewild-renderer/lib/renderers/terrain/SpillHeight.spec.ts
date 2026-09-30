import {
  WaterRuleChunk,
  WaterRuleSource,
  drainBody,
  fillSeaChannels,
  findBodies,
  findSpillHeight,
  lockedLevels,
  setBodyLevel,
  texelId,
} from './SpillHeight';
import {
  WATER_EDIT_AUTHORITY,
  WATER_EDIT_COVERAGE,
  WATER_EDIT_STEP,
  WATER_EDIT_TYPES,
  WaterEdit,
  createWaterEdit,
} from './WaterEdit';
import { ResolvedWater } from './WaterMap';

// A small world: 65-sample chunks, texels every 4 samples, lake cells of 128
// samples. A lake of body 7 at level 8 sits at the origin: a bed at 2 inside
// r = 30, a rim at 10 out to r = 50, and ground at 5 beyond.
const CHUNK = 65;
const SPAN = CHUNK - 1;
const HALF = SPAN / 2;
const STEP = WATER_EDIT_STEP;
const SIZE = SPAN / STEP + 1;
const BODY = 7;
const LEVEL = 8;
const LAKE_TYPE = 1;
const OCEAN_TYPE = 0;

interface World {
  height(wx: number, wz: number): number;
  /** Ocean from this x eastward, at ground −3. */
  seaFrom?: number;
  missing?: Set<string>;
}

// A cut through the rim toward +x, `height` deep, reaching the ground past it.
function notched(height: number, ground = 5, bed = 2) {
  return (wx: number, wz: number) => {
    const r = Math.hypot(wx, wz);
    const natural = r < 30 ? bed : r < 50 ? 10 : ground;
    if (wx > 0 && Math.abs(wz) <= 6 && r >= 28)
      return Math.min(natural, height);
    return natural;
  };
}

function bowl(wx: number, wz: number): number {
  const r = Math.hypot(wx, wz);
  return r < 30 ? 2 : r < 50 ? 10 : 5;
}

function makeSource(world: World, seaLevel = 0): WaterRuleSource {
  const chunks = new Map<string, WaterRuleChunk>();
  const height = (wx: number, wz: number) =>
    world.seaFrom !== undefined && wx >= world.seaFrom
      ? -3
      : world.height(wx, wz);
  return {
    chunkSize: CHUNK,
    seaLevel,
    cellSize: 128,
    getChunk(cx, cy) {
      const key = `${cx},${cy}`;
      if (world.missing?.has(key)) return null;
      let chunk = chunks.get(key);
      if (chunk) return chunk;
      const heights = new Float32Array(CHUNK * CHUNK);
      for (let sy = 0; sy < CHUNK; sy++)
        for (let sx = 0; sx < CHUNK; sx++)
          heights[sy * CHUNK + sx] = height(
            cx * SPAN + sx - HALF,
            cy * SPAN + HALF - sy
          );
      const texels = SIZE * SIZE;
      const water: ResolvedWater = {
        size: SIZE,
        step: STEP,
        coverage: new Uint8Array(texels),
        levels: new Float64Array(texels).fill(seaLevel),
        typeWeights: new Uint8Array(texels * 4),
        bodyIds: new Uint32Array(texels),
        lakes: [],
        covered: true,
      };
      for (let my = 0; my < SIZE; my++)
        for (let mx = 0; mx < SIZE; mx++) {
          const t = mx + my * SIZE;
          const wx = cx * SPAN + mx * STEP - HALF;
          const wz = cy * SPAN + HALF - my * STEP;
          const r = Math.hypot(wx, wz);
          if (world.seaFrom !== undefined && wx >= world.seaFrom) {
            water.coverage[t] = 255;
            water.typeWeights[t * 4 + OCEAN_TYPE] = 255;
          } else if (r < 50) {
            water.bodyIds[t] = BODY;
            water.levels[t] = LEVEL;
            const coverage = r < 30 ? 255 : r < 40 ? 128 : 0;
            water.coverage[t] = coverage;
            if (coverage > 0) water.typeWeights[t * 4 + LAKE_TYPE] = 255;
          }
        }
      chunk = { heights, water };
      chunks.set(key, chunk);
      return chunk;
    },
  };
}

// The texel at world sample (wx, wz), both multiples of the step.
const at = (wx: number, wz: number) => texelId(wx / STEP, wz / STEP);

const START = [at(0, 0)];

describe('findSpillHeight', () => {
  it('finds the rim of a closed bowl', () => {
    const search = findSpillHeight(
      makeSource({ height: bowl }),
      BODY,
      LEVEL,
      START
    );
    expect(search.status).toBe('found');
    expect(search.spillHeight).toBe(10);
    expect(search.sea).toBe(false);
    expect(search.edge).toBe(false);
  });

  it('finds the floor of a cut through the rim', () => {
    const search = findSpillHeight(
      makeSource({ height: notched(6) }),
      BODY,
      LEVEL,
      START
    );
    expect(search.spillHeight).toBe(6);
  });

  it('fills the basin below the spill height', () => {
    const search = findSpillHeight(
      makeSource({ height: notched(6) }),
      BODY,
      LEVEL,
      START
    );
    expect(search.basin.has(at(0, 0))).toBe(true);
    expect(search.basin.has(at(20, -20))).toBe(true);
    expect(search.basin.has(at(40, 0))).toBe(false);
    expect(search.basin.has(at(60, 0))).toBe(false);
  });

  it('leaves out a hollow cut off at the spill height', () => {
    const height = (wx: number, wz: number) => {
      const ground = notched(6)(wx, wz);
      return Math.hypot(wx, wz) < 30 && wx >= -12 && wx <= -8 ? 7 : ground;
    };
    const search = findSpillHeight(makeSource({ height }), BODY, LEVEL, START);
    expect(search.spillHeight).toBe(6);
    expect(search.basin.has(at(8, 0))).toBe(true);
    expect(search.basin.has(at(-20, 0))).toBe(false);
  });

  it('joins the sea through a cut below sea level', () => {
    const search = findSpillHeight(
      makeSource({ height: notched(-1, 5, -2), seaFrom: 68 }),
      BODY,
      LEVEL,
      START
    );
    expect(search.spillHeight).toBe(0);
    expect(search.sea).toBe(true);
    expect(search.basin.has(at(0, 0))).toBe(true);
  });

  it('spills above the sea through a cut that stops short of it', () => {
    const search = findSpillHeight(
      makeSource({ height: notched(3), seaFrom: 68 }),
      BODY,
      LEVEL,
      START
    );
    expect(search.spillHeight).toBe(3);
    expect(search.sea).toBe(false);
  });

  it('stops at the edge of the lake cell and its neighbours', () => {
    const height = (wx: number, wz: number) => {
      const r = Math.hypot(wx, wz);
      return r < 30 ? 2 : r * 0.1;
    };
    const search = findSpillHeight(makeSource({ height }), BODY, LEVEL, START);
    expect(search.edge).toBe(true);
    expect(search.spillHeight).toBeCloseTo(12.8, 5);
  });

  it('asks for a chunk it needs and cannot read', () => {
    const search = findSpillHeight(
      makeSource({ height: bowl, missing: new Set(['1,0']) }),
      BODY,
      LEVEL,
      START
    );
    expect(search.status).toBe('missing');
    expect([search.missingX, search.missingY]).toEqual([1, 0]);
  });

  it('is dry when no water lies below the level', () => {
    const search = findSpillHeight(
      makeSource({ height: () => 20 }),
      BODY,
      LEVEL,
      START
    );
    expect(search.status).toBe('dry');
  });
});

describe('findBodies', () => {
  it('lists the bodies other than the ocean in a box, with their texels', () => {
    const scan = findBodies(
      makeSource({ height: bowl, seaFrom: 68 }),
      10,
      -1,
      18,
      1
    );
    expect(scan.bodies.map((b) => b.id)).toEqual([BODY]);
    expect(scan.bodies[0].level).toBe(LEVEL);
    expect(scan.bodies[0].starts).toContain(at(40, 0));
    expect(scan.bodies[0].starts).not.toContain(at(72, 0));
  });
});

describe('drainBody', () => {
  const drained = () => {
    const source = makeSource({ height: notched(6) });
    const search = findSpillHeight(source, BODY, LEVEL, START);
    const edits = new Map<string, WaterEdit>();
    const result = drainBody(
      source,
      (cx, cy) => {
        const key = `${cx},${cy}`;
        if (!edits.has(key)) edits.set(key, createWaterEdit(CHUNK));
        return edits.get(key)!;
      },
      BODY,
      search,
      search.spillHeight,
      false,
      OCEAN_TYPE
    );
    return { result, edits };
  };

  // The edit's channel and level at world (wx, wz) in chunk (cx, cy).
  const read = (
    edit: WaterEdit,
    cx: number,
    cy: number,
    wx: number,
    wz: number
  ) => {
    const plane = SIZE * SIZE;
    const t =
      ((cy * SPAN + HALF - wz) / STEP) * SIZE + (wx - cx * SPAN + HALF) / STEP;
    return {
      authority: edit.mask.weights[WATER_EDIT_AUTHORITY * plane + t],
      coverage: edit.mask.weights[WATER_EDIT_COVERAGE * plane + t],
      lake: edit.mask.weights[(WATER_EDIT_TYPES + LAKE_TYPE) * plane + t],
      level: edit.level[t],
      bodyId: edit.bodyIds[t],
    };
  };

  it('keeps the basin covered at the new level', () => {
    const { result, edits } = drained();
    expect(result.status).toBe('written');
    expect(read(edits.get('0,0')!, 0, 0, 0, 0)).toEqual({
      authority: 255,
      coverage: 255,
      lake: 255,
      level: 6,
      bodyId: BODY,
    });
  });

  it('dries the rest of the body at the new level', () => {
    const { edits } = drained();
    const bank = read(edits.get('1,0')!, 1, 0, 36, 0);
    expect(bank.authority).toBe(255);
    expect(bank.coverage).toBe(0);
    expect(bank.level).toBe(6);
  });

  it('writes a shared edge texel the same in every chunk', () => {
    const { edits } = drained();
    expect(read(edits.get('0,0')!, 0, 0, 32, 0)).toEqual(
      read(edits.get('1,0')!, 1, 0, 32, 0)
    );
  });

  it('asks for an edit it cannot write', () => {
    const source = makeSource({ height: notched(6) });
    const search = findSpillHeight(source, BODY, LEVEL, START);
    const result = drainBody(
      source,
      (cx, cy) => (cx === 1 && cy === 0 ? null : createWaterEdit(CHUNK)),
      BODY,
      search,
      search.spillHeight,
      false,
      OCEAN_TYPE
    );
    expect(result.status).toBe('missing');
    expect([result.missingX, result.missingY]).toEqual([1, 0]);
    expect(result.touched).toEqual([]);
  });

  it('blends a joined lake to sea water at its shore', () => {
    const source = makeSource({ height: notched(-1, 5, -2), seaFrom: 68 });
    const search = findSpillHeight(source, BODY, LEVEL, START);
    const edits = new Map<string, WaterEdit>();
    drainBody(
      source,
      (cx, cy) => {
        const key = `${cx},${cy}`;
        if (!edits.has(key)) edits.set(key, createWaterEdit(CHUNK));
        return edits.get(key)!;
      },
      BODY,
      search,
      0,
      true,
      OCEAN_TYPE
    );
    const plane = SIZE * SIZE;
    const texel = (wx: number, wz: number) =>
      ((HALF - wz) / STEP) * SIZE + (wx + HALF) / STEP;
    const weights = edits.get('0,0')!.mask.weights;
    const ocean = (wx: number, wz: number) =>
      weights[(WATER_EDIT_TYPES + OCEAN_TYPE) * plane + texel(wx, wz)];
    expect(ocean(0, 0)).toBe(0);
    expect(ocean(-32, 0)).toBe(255);
  });
});

describe('fillSeaChannels', () => {
  // Ground at 5, the sea east of x = 68, and trenches at −1: one from x = 20
  // to the sea along z = 120, one along z = −120 that stops at x = 60 short of
  // it, and one from x = 40 to the sea through the lake's bank along z = 0.
  const ground = (wx: number, wz: number) => {
    const lake = bowl(wx, wz);
    if (Math.abs(wz - 120) <= 4 && wx >= 20) return -1;
    if (Math.abs(wz + 120) <= 4 && wx >= 20 && wx <= 60) return -1;
    if (Math.abs(wz) <= 4 && wx >= 36) return -1;
    return Math.hypot(wx, wz) < 50 ? lake : 5;
  };

  const filled = (i0: number, j0: number, i1: number, j1: number) => {
    const source = makeSource({ height: ground, seaFrom: 68 });
    const edits = new Map<string, WaterEdit>();
    const result = fillSeaChannels(
      source,
      (cx, cy) => {
        const key = `${cx},${cy}`;
        if (!edits.has(key)) edits.set(key, createWaterEdit(CHUNK));
        return edits.get(key)!;
      },
      i0,
      j0,
      i1,
      j1,
      OCEAN_TYPE
    );
    // The edit at world (wx, wz), from the chunk that owns it.
    const read = (wx: number, wz: number) => {
      const cx = Math.floor((wx + HALF) / SPAN);
      const cy = Math.floor((wz + HALF) / SPAN);
      const edit = edits.get(`${cx},${cy}`);
      if (!edit) return null;
      const plane = SIZE * SIZE;
      const t =
        ((cy * SPAN + HALF - wz) / STEP) * SIZE +
        (wx - cx * SPAN + HALF) / STEP;
      return {
        authority: edit.mask.weights[WATER_EDIT_AUTHORITY * plane + t],
        coverage: edit.mask.weights[WATER_EDIT_COVERAGE * plane + t],
        ocean: edit.mask.weights[(WATER_EDIT_TYPES + OCEAN_TYPE) * plane + t],
        level: edit.level[t],
        bodyId: edit.bodyIds[t],
      };
    };
    return { result, read };
  };

  it('fills a trench that joins the sea with sea water', () => {
    const { result, read } = filled(5, 25, 25, 35);
    expect(result.status).toBe('written');
    expect(read(40, 120)).toEqual({
      authority: 255,
      coverage: 255,
      ocean: 255,
      level: 0,
      bodyId: 0,
    });
  });

  it('covers the dry texels beside it for the shoreline', () => {
    const { read } = filled(5, 25, 25, 35);
    expect(read(40, 128)!.coverage).toBe(255);
    expect(read(40, 136)!.authority).toBe(0);
  });

  it('stops at the edge of the box', () => {
    const { read } = filled(10, 25, 25, 35);
    expect(read(40, 120)!.coverage).toBe(255);
    expect(read(32, 120)?.authority ?? 0).toBe(0);
  });

  it('leaves the open sea to the generator', () => {
    const { read } = filled(5, 25, 25, 35);
    expect(read(80, 120)!.authority).toBe(0);
  });

  it('leaves a trench that does not reach the sea dry', () => {
    const { result } = filled(5, -35, 25, -25);
    expect(result.texels).toBe(0);
    expect(result.touched).toEqual([]);
  });

  it('stops at water another body covers', () => {
    const { read } = filled(5, -5, 25, 5);
    expect(read(44, 0)!.bodyId).toBe(0);
    expect(read(44, 0)!.coverage).toBe(255);
    expect(read(36, 0)!.authority).toBe(0);
  });
});

describe('setBodyLevel', () => {
  // The lake's bank slopes from 2 at r = 30 up to 12 at r = 50.
  const sloped = (wx: number, wz: number) => {
    const r = Math.hypot(wx, wz);
    return r < 30 ? 2 : r < 50 ? 2 + (r - 30) * 0.5 : 5;
  };

  const moved = (target: number) => {
    const source = makeSource({ height: sloped });
    const edits = new Map<string, WaterEdit>();
    const result = setBodyLevel(
      source,
      (cx, cy) => {
        const key = `${cx},${cy}`;
        if (!edits.has(key)) edits.set(key, createWaterEdit(CHUNK));
        return edits.get(key)!;
      },
      BODY,
      START,
      LEVEL,
      target,
      [0, 255, 0, 0]
    );
    const read = (wx: number, wz: number) => {
      const cx = Math.floor((wx + HALF) / SPAN);
      const cy = Math.floor((wz + HALF) / SPAN);
      const edit = edits.get(`${cx},${cy}`)!;
      const plane = SIZE * SIZE;
      const t =
        ((cy * SPAN + HALF - wz) / STEP) * SIZE +
        (wx - cx * SPAN + HALF) / STEP;
      return {
        coverage: edit.mask.weights[WATER_EDIT_COVERAGE * plane + t],
        lake: edit.mask.weights[(WATER_EDIT_TYPES + LAKE_TYPE) * plane + t],
        level: edit.level[t],
      };
    };
    return { result, read };
  };

  it('spreads a rising lake over the ground below its new level', () => {
    const { result, read } = moved(9);
    expect(result.status).toBe('written');
    expect(read(40, 0)).toEqual({ coverage: 255, lake: 255, level: 9 });
  });

  it('covers the ground around the new shore', () => {
    const { read } = moved(9);
    expect(read(44, 0).coverage).toBe(255);
    expect(read(48, 0)).toEqual({ coverage: 0, lake: 0, level: 9 });
  });

  it('shrinks a falling lake, keeping its bank where it now meets it', () => {
    const { read } = moved(4);
    expect(read(0, 0)).toEqual({ coverage: 255, lake: 255, level: 4 });
    expect(read(36, 0).coverage).toBe(128);
    expect(read(40, 0).coverage).toBe(0);
  });
});

describe('lockedLevels', () => {
  const water = (): ResolvedWater => {
    const texels = SIZE * SIZE;
    const bodyIds = new Uint32Array(texels);
    bodyIds[5 + 5 * SIZE] = BODY;
    return {
      size: SIZE,
      step: STEP,
      coverage: new Uint8Array(texels),
      levels: new Float64Array(texels),
      typeWeights: new Uint8Array(texels * 4),
      bodyIds,
      lakes: [],
      covered: true,
    };
  };

  it('is null with no locked body in the chunk', () => {
    expect(lockedLevels(water(), new Map([[3, 4]]))).toBeNull();
  });

  it('covers a locked body and the texels around it', () => {
    const levels = lockedLevels(water(), new Map([[BODY, 4]]))!;
    expect(levels[5 + 5 * SIZE]).toBe(4);
    expect(levels[6 + 6 * SIZE]).toBe(4);
    expect(levels[7 + 5 * SIZE]).toBe(-Infinity);
  });
});
