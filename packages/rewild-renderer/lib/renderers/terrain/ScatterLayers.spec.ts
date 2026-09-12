import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SCATTER_LAYERS,
  ScatterLayer,
  getScatterLayer,
  getScatterLayerOrder,
  getScatterLayerSlot,
  getMaxScatterCullDistance,
  getScatterGenerationDistance,
  lodTierCount,
  lodTierFar,
  lodTierNear,
  validateScatterLayers,
} from './ScatterLayers';

// The validator reads the module table, so a case swaps one row in.
function withLayers(
  layers: Record<string, ScatterLayer>,
  run: () => void
): void {
  const original = { ...SCATTER_LAYERS };
  for (const key in SCATTER_LAYERS) delete SCATTER_LAYERS[key];
  Object.assign(SCATTER_LAYERS, layers);

  try {
    run();
  } finally {
    for (const key in SCATTER_LAYERS) delete SCATTER_LAYERS[key];
    Object.assign(SCATTER_LAYERS, original);
  }
}

function layer(overrides: Partial<ScatterLayer> = {}): ScatterLayer {
  return {
    name: 'test',
    geometryId: 'granite-rock',
    cullDistance: 200,
    jitter: { scale: { from: 1, to: 1 } },
    footprint: 1,
    ...overrides,
  };
}

function expectInvalid(
  overrides: Partial<ScatterLayer>,
  message: RegExp
): void {
  withLayers({ test: layer(overrides) }, () => {
    expect(() => validateScatterLayers()).toThrow(message);
  });
}

describe('getScatterLayer', () => {
  it('resolves a known layer', () => {
    expect(getScatterLayer('granite_boulder')).toBe(
      SCATTER_LAYERS['granite_boulder']
    );
  });

  it('throws on an unknown layer rather than falling back', () => {
    expect(() => getScatterLayer('no-such-layer')).toThrow(
      /Unknown scatter layer/
    );
  });
});

describe('getScatterLayerSlot', () => {
  it('gives declaration order, which is what a paint channel is written against', () => {
    const order = getScatterLayerOrder();
    for (let i = 0; i < order.length; i++)
      expect(getScatterLayerSlot(order[i])).toBe(i);
  });

  it('reports -1 for a layer outside the library', () => {
    expect(getScatterLayerSlot('no-such-layer')).toBe(-1);
  });
});

describe('validateScatterLayers', () => {
  it('accepts the shipped table', () => {
    expect(() => validateScatterLayers()).not.toThrow();
  });

  // The registry the engine actually loads, so a layer naming a model or a
  // LOD tier the registry does not carry fails here rather than at startup.
  it('accepts the shipped table against the shipped geometry registry', () => {
    const registry = JSON.parse(
      readFileSync(
        join(__dirname, '../../../../../templates/geometries.json'),
        'utf8'
      )
    ) as Record<string, { lods?: string[] }>;
    const counts = new Map(
      Object.entries(registry).map(([id, entry]) => [
        id,
        entry.lods?.length ?? 0,
      ])
    );
    expect(() => validateScatterLayers(counts)).not.toThrow();
  });

  it('rejects a geometry id the loader does not carry', () => {
    expect(() => validateScatterLayers(new Map([['box', 0]]))).toThrow(
      /references unknown geometry/
    );
  });

  it('rejects more LOD distances than the geometry has LOD meshes', () => {
    withLayers({ test: layer({ lodDistances: [40, 90] }) }, () => {
      expect(() =>
        validateScatterLayers(new Map([['granite-rock', 1]]))
      ).toThrow(/gives 2 LOD distances but geometry 'granite-rock' carries 1/);
    });
  });

  it('accepts a chain shorter than the geometry carries', () => {
    withLayers({ test: layer({ lodDistances: [40] }) }, () => {
      expect(() =>
        validateScatterLayers(new Map([['granite-rock', 3]]))
      ).not.toThrow();
    });
  });

  it('skips the geometry check when no ids are supplied', () => {
    withLayers({ test: layer({ geometryId: 'not-loaded-anywhere' }) }, () => {
      expect(() => validateScatterLayers()).not.toThrow();
    });
  });

  it('rejects a name that disagrees with its key', () => {
    withLayers({ mismatched: layer({ name: 'test' }) }, () => {
      expect(() => validateScatterLayers()).toThrow(
        /the key and the name must match/
      );
    });
  });

  it('rejects a non-positive cull distance', () => {
    expectInvalid({ cullDistance: 0 }, /cullDistance must be positive/);
  });

  it('rejects a non-positive footprint', () => {
    expectInvalid({ footprint: 0 }, /footprint must be positive/);
  });

  it('rejects alignToNormal outside 0..1', () => {
    expectInvalid(
      { alignToNormal: 1.5 },
      /alignToNormal must be within 0\.\.1/
    );
  });

  it('rejects an inverted jitter range', () => {
    expectInvalid(
      { jitter: { scale: { from: 2, to: 1 } } },
      /scale range 2\.\.1 is inverted/
    );
    expectInvalid(
      { jitter: { scale: { from: 1, to: 1 }, yaw: { from: 90, to: 0 } } },
      /yaw range 90\.\.0 is inverted/
    );
  });

  it('rejects a scale range that collapses or mirrors the instance', () => {
    expectInvalid(
      { jitter: { scale: { from: 0, to: 1 } } },
      /scale range must be positive/
    );
  });

  it('rejects a negative tilt', () => {
    expectInvalid(
      { jitter: { scale: { from: 1, to: 1 }, tilt: -1 } },
      /tilt must not be negative/
    );
  });

  it('accepts an ascending LOD chain', () => {
    withLayers({ test: layer({ lodDistances: [40, 90] }) }, () =>
      expect(() => validateScatterLayers()).not.toThrow()
    );
  });

  it('rejects an out-of-order LOD chain', () => {
    expectInvalid({ lodDistances: [90, 40] }, /LOD distances must ascend/);
  });

  it('rejects a LOD tier beyond the cull distance', () => {
    expectInvalid({ lodDistances: [500] }, /is beyond its cullDistance/);
  });

  it('rejects an impostor that does not follow the last mesh tier', () => {
    expectInvalid(
      {
        lodDistances: [120],
        impostor: { fromDistance: 80, views: 8, tileSize: 128 },
      },
      /impostor at 80m is not beyond its last mesh LOD at 120m/
    );
  });

  it('rejects an impostor beyond the cull distance', () => {
    expectInvalid(
      { impostor: { fromDistance: 250, views: 8, tileSize: 128 } },
      /impostor at 250m is beyond its cullDistance/
    );
  });

  it('rejects an impostor with too few views', () => {
    expectInvalid(
      { impostor: { fromDistance: 100, views: 1, tileSize: 128 } },
      /at least 2 views per axis/
    );
  });

  it('rejects a fractional impostor tile size', () => {
    expectInvalid(
      { impostor: { fromDistance: 100, views: 8, tileSize: 12.5 } },
      /tileSize must be a positive integer/
    );
  });

  it('rejects a collider with a non-positive dimension', () => {
    expectInvalid(
      { collider: { type: 'box', size: [1, 0, 1] } },
      /box collider must have positive dimensions/
    );
    expectInvalid(
      { collider: { type: 'sphere', radius: -1 } },
      /sphere collider must have positive dimensions/
    );
    expectInvalid(
      { collider: { type: 'capsule', radius: 0.5, height: 0 } },
      /capsule collider must have positive dimensions/
    );
  });

  it('rejects wind that cannot move anything', () => {
    expectInvalid(
      { wind: { amplitude: 0, frequency: 1, flutter: 0 } },
      /wind amplitude must be positive/
    );
    expectInvalid(
      { wind: { amplitude: 1, frequency: 0, flutter: 0 } },
      /wind frequency must be positive/
    );
    expectInvalid(
      { wind: { amplitude: 1, frequency: 1, flutter: -0.1 } },
      /wind flutter must not be negative/
    );
  });
});

describe('getMaxScatterCullDistance', () => {
  it('is the furthest any layer draws', () => {
    expect(getMaxScatterCullDistance()).toBe(
      Math.max(
        ...Object.values(SCATTER_LAYERS).map((layer) => layer.cullDistance)
      )
    );
  });
});

describe('getScatterGenerationDistance', () => {
  // Generation is a worker round trip, so it has to start before the draw
  // range — otherwise a layer appears later than it disappears.
  it('reaches beyond the furthest layer draws', () => {
    expect(getScatterGenerationDistance()).toBeGreaterThan(
      getMaxScatterCullDistance()
    );
  });
});

describe('LOD tier bands', () => {
  const chain = layer({ lodDistances: [40, 90], cullDistance: 200 });

  function band(tier: number, bias = 0): [number, number] {
    return [lodTierNear(chain, tier, bias), lodTierFar(chain, tier, bias)];
  }

  it('counts the model plus one tier per distance', () => {
    expect(lodTierCount(layer())).toBe(1);
    expect(lodTierCount(chain)).toBe(3);
  });

  // Each handover distance ends one tier and starts the next, so the bands
  // tile the draw range with no gap and no overlap.
  it('tiles the draw range from the viewer to the cull distance', () => {
    expect(band(0)).toEqual([0, 40]);
    expect(band(1)).toEqual([40, 90]);
    expect(band(2)).toEqual([90, 200]);
  });

  it('draws a chainless layer from the viewer to its cull distance', () => {
    expect(lodTierNear(layer(), 0)).toBe(0);
    expect(lodTierFar(layer(), 0)).toBe(200);
  });

  // A positive bias makes every instance coarser: the nearest band moves to
  // tier 1, the model itself draws nothing, and the last tier takes on all the
  // range the shift left uncovered.
  it('shifts every band one tier coarser under a positive bias', () => {
    expect(band(0, 1)).toEqual([0, 0]);
    expect(band(1, 1)).toEqual([0, 40]);
    expect(band(2, 1)).toEqual([40, 200]);
  });

  it('shifts every band one tier finer under a negative bias', () => {
    expect(band(0, -1)).toEqual([0, 90]);
    expect(band(1, -1)).toEqual([90, 200]);
    expect(band(2, -1)).toEqual([0, 0]);
  });

  // A bias past either end of the chain is the debug lever's whole point:
  // everything on the model, or everything on the coarsest tier.
  it('lets a bias that outruns the chain land everything on its end tier', () => {
    expect(band(0, 3)).toEqual([0, 0]);
    expect(band(1, 3)).toEqual([0, 0]);
    expect(band(2, 3)).toEqual([0, 200]);
    expect(band(0, -3)).toEqual([0, 200]);
    expect(band(1, -3)).toEqual([0, 0]);
  });

  // setScatterLayerEnabled zeroes a layer's cull distance to switch it off, and
  // that has to switch off every tier, not only the last.
  it('truncates the chain at a cull distance pulled inside it', () => {
    const cut = layer({ lodDistances: [40, 90], cullDistance: 60 });
    expect(lodTierFar(cut, 0)).toBe(40);
    expect(lodTierFar(cut, 1)).toBe(60);
    expect(lodTierNear(cut, 2)).toBeGreaterThanOrEqual(lodTierFar(cut, 2));

    const off = layer({ lodDistances: [40, 90], cullDistance: 0 });
    for (let tier = 0; tier < 3; tier++)
      expect(lodTierNear(off, tier)).toBeGreaterThanOrEqual(
        lodTierFar(off, tier)
      );
  });

  // The impostor is one more tier on the end of the chain: the last mesh
  // hands over to it at fromDistance and it runs to the cull distance.
  it('puts the impostor after the last mesh tier', () => {
    const far = layer({
      lodDistances: [40],
      impostor: { fromDistance: 90, views: 8, tileSize: 128 },
      cullDistance: 200,
    });
    expect(lodTierCount(far)).toBe(3);
    expect([lodTierNear(far, 1), lodTierFar(far, 1)]).toEqual([40, 90]);
    expect([lodTierNear(far, 2), lodTierFar(far, 2)]).toEqual([90, 200]);
    expect([lodTierNear(far, 2, 2), lodTierFar(far, 2, 2)]).toEqual([0, 200]);
  });

  it('keeps a chainless layer whole under any bias', () => {
    expect(lodTierFar(layer(), 0, -2)).toBe(200);
    expect(lodTierFar(layer(), 0, 2)).toBe(200);
    expect(lodTierNear(layer(), 0, 2)).toBe(0);
  });
});
