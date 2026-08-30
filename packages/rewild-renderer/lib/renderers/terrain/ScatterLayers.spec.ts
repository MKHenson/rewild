import {
  SCATTER_LAYERS,
  ScatterLayer,
  getScatterLayer,
  getScatterLayerOrder,
  getScatterLayerSlot,
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

  it('accepts the shipped table against the geometries it names', () => {
    const counts = new Map(
      Object.values(SCATTER_LAYERS).map((entry) => [entry.geometryId, 0])
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
