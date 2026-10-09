import { WaterMap } from '../terrain/WaterMap';
import { toFloat16 } from '../../utils/float16';
import {
  NO_BODY,
  PROBE_POINTS,
  PROBE_POINT_FLOATS,
  PROBE_RESULT_FLOATS,
  WaterQuery,
  WaterQuerySource,
  createWaterQuerySample,
  sampleWaterMap,
} from './WaterQuery';

// A 3 × 3 map over a chunk 16 m across: texels 8 m apart, +x across, +y
// toward −z.
const SPAN = 16;

function makeMap(): WaterMap {
  const size = 3;
  const texels = size * size;
  const level = new Uint16Array(texels);
  const heights = new Uint16Array(texels);
  const coverage = new Uint8Array(texels);
  const typeWeights = new Uint8Array(texels * 4);
  const bodyIds = new Uint32Array(texels);
  const flow = new Int8Array(texels * 2);
  for (let my = 0; my < size; my++)
    for (let mx = 0; mx < size; mx++) {
      const t = mx + my * size;
      level[t] = toFloat16(mx);
      heights[t] = toFloat16(-2);
      coverage[t] = 255;
      typeWeights[t * 4] = mx === 0 ? 255 : 0;
      typeWeights[t * 4 + 1] = mx === 0 ? 0 : 255;
      bodyIds[t] = mx;
      flow[t * 2] = 127;
    }
  return {
    size,
    step: 4,
    baseLevel: 10,
    maxLevel: 12,
    shows: true,
    level,
    heights,
    coverage,
    typeWeights,
    bodyIds,
    flow,
    bodies: [],
  };
}

function makeSource(
  water: WaterMap | null,
  ground: number | null
): WaterQuerySource {
  return {
    chunkSize: SPAN,
    sampleHeight: () => ground,
    waterMapAt: (cx, cy) => (cx === 0 && cy === 0 ? water : null),
  };
}

describe('sampleWaterMap', () => {
  it('filters the level bilinearly and adds the base level', () => {
    const out = createWaterQuerySample();
    sampleWaterMap(makeMap(), 0.5, 1, out);
    expect(out.level).toBeCloseTo(10.5);
    expect(out.mapDepth).toBeCloseTo(2.5);
  });

  it('normalises the type weights after filtering them', () => {
    const out = createWaterQuerySample();
    sampleWaterMap(makeMap(), 0.25, 0, out);
    expect(out.typeWeights[0]).toBeCloseTo(0.75);
    expect(out.typeWeights[1]).toBeCloseTo(0.25);
  });

  it('reads a texel with no weights as the first type', () => {
    const water = makeMap();
    water.typeWeights.fill(0);
    const out = createWaterQuerySample();
    sampleWaterMap(water, 1, 1, out);
    expect(Array.from(out.typeWeights)).toEqual([1, 0, 0, 0]);
  });

  it('takes the body from the nearest texel', () => {
    const out = createWaterQuerySample();
    sampleWaterMap(makeMap(), 1.4, 1, out);
    expect(out.bodyId).toBe(1);
    sampleWaterMap(makeMap(), 1.6, 1, out);
    expect(out.bodyId).toBe(2);
  });

  it('decodes the flow and clamps past the edge', () => {
    const out = createWaterQuerySample();
    sampleWaterMap(makeMap(), 5, -3, out);
    expect(out.flowX).toBeCloseTo(1);
    expect(out.flowZ).toBe(0);
    expect(out.level).toBeCloseTo(12);
  });
});

describe('WaterQuery.sample', () => {
  it('maps world xz onto the texels as the water grid does', () => {
    const query = new WaterQuery(makeSource(makeMap(), 9));
    const out = createWaterQuerySample();
    // x = −8 is the chunk's west edge, texel column 0.
    expect(query.sample(-8, 0, out)).toBe(true);
    expect(out.level).toBeCloseTo(10);
    expect(out.bodyId).toBe(0);
    expect(query.sample(4, 0, out)).toBe(true);
    expect(out.level).toBeCloseTo(11.5);
    expect(query.sample(0, -4, out)).toBe(true);
    expect(out.level).toBeCloseTo(11);
  });

  it('measures the depth from the full-resolution ground', () => {
    const query = new WaterQuery(makeSource(makeMap(), 9));
    const out = createWaterQuerySample();
    query.sample(0, 0, out);
    expect(out.level).toBeCloseTo(11);
    expect(out.ground).toBe(9);
    expect(out.depth).toBeCloseTo(2);
    expect(out.wet).toBe(true);
    expect(out.surface).toBeCloseTo(11);
  });

  it('is dry over ground above the level', () => {
    const query = new WaterQuery(makeSource(makeMap(), 20));
    const out = createWaterQuerySample();
    query.sample(0, 0, out);
    expect(out.depth).toBe(0);
    expect(out.wet).toBe(false);
  });

  it('is dry with no water map, and false where the ground is not loaded', () => {
    const out = createWaterQuerySample();
    expect(new WaterQuery(makeSource(null, 5)).sample(0, 0, out)).toBe(true);
    expect(out.wet).toBe(false);
    expect(out.level).toBe(-Infinity);
    expect(out.bodyId).toBe(NO_BODY);
    expect(new WaterQuery(makeSource(makeMap(), null)).sample(0, 0, out)).toBe(
      false
    );
  });
});

describe('WaterQuery probes', () => {
  const points = new Float32Array(PROBE_POINTS * PROBE_POINT_FLOATS);
  const generations = new Uint32Array(PROBE_POINTS);
  const results = new Float32Array(PROBE_POINTS * PROBE_RESULT_FLOATS);

  it('stages a probed point from the origin, and hands its height back', () => {
    const query = new WaterQuery(makeSource(makeMap(), 9));
    const out = createWaterQuerySample();
    const probe = query.acquireProbe();
    query.sample(0, 0, out, probe);
    expect(out.waveHeight).toBe(0);

    expect(query.stage(-1024, 1024, points, generations)).toBe(true);
    const o = probe * PROBE_POINT_FLOATS;
    expect(points[o]).toBe(1024);
    expect(points[o + 1]).toBe(-1024);
    expect(points[o + 2]).toBeCloseTo(3);
    expect(points[o + 3]).toBeCloseTo(11);
    expect(points[o + 4] + points[o + 5]).toBeCloseTo(1);

    results[probe * PROBE_RESULT_FLOATS] = 0.75;
    query.receive(results, generations);
    query.sample(0, 0, out, probe);
    expect(out.waveHeight).toBeCloseTo(0.75);
    expect(out.surface).toBeCloseTo(11.75);
  });

  it('marks a probe that reads the water at rest', () => {
    const query = new WaterQuery(makeSource(makeMap(), 9));
    const over = query.acquireProbe();
    const atRest = query.acquireProbe(true);
    query.sample(0, 0, createWaterQuerySample(), over);
    query.sample(0, 0, createWaterQuerySample(), atRest);
    query.stage(0, 0, points, generations);
    expect(points[over * PROBE_POINT_FLOATS + 8]).toBe(0);
    expect(points[atRest * PROBE_POINT_FLOATS + 8]).toBe(1);
  });

  it('stages nothing when no probe asked since the last stage', () => {
    const query = new WaterQuery(makeSource(makeMap(), 9));
    const probe = query.acquireProbe();
    query.sample(0, 0, createWaterQuerySample(), probe);
    expect(query.stage(0, 0, points, generations)).toBe(true);
    expect(query.stage(0, 0, points, generations)).toBe(false);
  });

  it('does not probe a point with no water', () => {
    const query = new WaterQuery(makeSource(null, 9));
    const probe = query.acquireProbe();
    query.sample(0, 0, createWaterQuerySample(), probe);
    expect(query.stage(0, 0, points, generations)).toBe(false);
  });

  it('drops a result meant for a probe since released and taken again', () => {
    const query = new WaterQuery(makeSource(makeMap(), 9));
    const out = createWaterQuerySample();
    const probe = query.acquireProbe();
    query.sample(0, 0, out, probe);
    query.stage(0, 0, points, generations);
    query.releaseProbe(probe);
    expect(query.acquireProbe()).toBe(probe);

    results[probe * PROBE_RESULT_FLOATS] = 2;
    query.receive(results, generations);
    query.sample(0, 0, out, probe);
    expect(out.waveHeight).toBe(0);
  });

  it('runs out of probes', () => {
    const query = new WaterQuery(makeSource(makeMap(), 9));
    for (let i = 0; i < PROBE_POINTS; i++) expect(query.acquireProbe()).toBe(i);
    expect(query.acquireProbe()).toBe(-1);
  });
});
