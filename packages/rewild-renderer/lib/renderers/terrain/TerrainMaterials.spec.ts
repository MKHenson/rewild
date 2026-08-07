import {
  BiomeLayer,
  BiomeParams,
  CLIMATE_PRESETS,
  ClimateConfig,
  DEFAULT_CLIMATE,
  MAX_SPLAT_LAYERS,
  getClimatePalette,
  validateClimateLayers,
} from './Biomes';
import {
  TERRAIN_MATERIALS,
  getTerrainMaterial,
  getTerrainMaterialLayer,
  getTerrainMaterialOrder,
  validateTerrainMaterials,
} from './TerrainMaterials';

// A minimal climate wrapper — these tests care only about the biome layers.
function climateOf(biomes: ClimateConfig['biomes']): ClimateConfig {
  return {
    temperature: { scale: 1, seedSalt: 0, cuts: [], blendHalfWidth: 0.05 },
    moisture: { scale: 1, seedSalt: 0, cuts: [], blendHalfWidth: 0.05 },
    biomes,
    cells: [[0]],
  };
}

function biome(name: string, layers: BiomeLayer[]): BiomeParams {
  return {
    name,
    deformations: [
      {
        kind: 'fbm',
        amplitude: 10,
        noiseScale: 100,
        octaves: 1,
        persistence: 0.5,
        lacunarity: 2,
        curveExp: 1,
        seedSalt: 0,
      },
    ],
    layers,
  };
}

describe('getTerrainMaterial', () => {
  it('resolves a known material', () => {
    expect(getTerrainMaterial('snow-02')).toBe(TERRAIN_MATERIALS['snow-02']);
  });

  // Unlike a climate preset id (which a saved world can carry from a renamed
  // preset), a material name only comes from a table in this repo — a miss is
  // a typo, not a migration.
  it('throws on an unknown material rather than falling back', () => {
    expect(() => getTerrainMaterial('no-such-material')).toThrow(
      /Unknown terrain material/
    );
  });
});

describe('TERRAIN_MATERIALS', () => {
  it('keys every material by its own name', () => {
    for (const [key, material] of Object.entries(TERRAIN_MATERIALS)) {
      expect(material.name).toBe(key);
    }
  });
});

describe('texture array layer order', () => {
  it('covers the whole library, not just one climate palette', () => {
    expect(getTerrainMaterialOrder()).toEqual(Object.keys(TERRAIN_MATERIALS));
  });

  it('gives every material a distinct layer', () => {
    const order = getTerrainMaterialOrder();
    expect(new Set(order).size).toBe(order.length);
  });

  it('maps a material to its layer index', () => {
    const order = getTerrainMaterialOrder();
    for (let i = 0; i < order.length; i++) {
      expect(getTerrainMaterialLayer(order[i])).toBe(i);
    }
  });

  it('reports -1 for a material outside the library', () => {
    expect(getTerrainMaterialLayer('no-such-material')).toBe(-1);
  });
});

describe('validateTerrainMaterials', () => {
  const original = { ...TERRAIN_MATERIALS };

  afterEach(() => {
    for (const key of Object.keys(TERRAIN_MATERIALS))
      delete TERRAIN_MATERIALS[key];
    Object.assign(TERRAIN_MATERIALS, original);
  });

  it('accepts the shipped library', () => {
    expect(() => validateTerrainMaterials()).not.toThrow();
  });

  // Every field below is spread over this, so a test only states the one thing
  // it is breaking.
  const VALID = {
    name: 'broken',
    albedoUrl: 'terrain/x/albedo.png',
    normalUrl: 'terrain/x/normal.png',
    armUrl: 'terrain/x/arm.jpg',
    heightUrl: 'terrain/x/height.png',
    heightScale: 0.03,
    uvScale: 25,
    normalConvention: 'opengl' as const,
    roughness: 1,
  };

  it('rejects a macro normal that is not coarser than the detail normal', () => {
    TERRAIN_MATERIALS['broken'] = { ...VALID, macroUvScale: 25 };
    expect(() => validateTerrainMaterials()).toThrow(/coarser/);
  });

  // macroUvScale is the on-switch, so these would be settings that silently do
  // nothing rather than settings that render wrong — which is worse to debug.
  it('rejects a macroNormalFrom without a macroUvScale', () => {
    TERRAIN_MATERIALS['broken'] = {
      ...VALID,
      macroNormalFrom: 'rocks-ground-01',
    };
    expect(() => validateTerrainMaterials()).toThrow(/without macroUvScale/);
  });

  it('rejects a macroStrength without a macroUvScale', () => {
    TERRAIN_MATERIALS['broken'] = { ...VALID, macroStrength: 0.5 };
    expect(() => validateTerrainMaterials()).toThrow(/without macroUvScale/);
  });

  // There is one normal array, so a borrowed macro normal has to be a material
  // in the library — anything else resolves to layer -1.
  it('rejects a macroNormalFrom that is not in the library', () => {
    TERRAIN_MATERIALS['broken'] = {
      ...VALID,
      macroUvScale: 2,
      macroNormalFrom: 'no-such-material',
    };
    expect(() => validateTerrainMaterials()).toThrow(/not in the library/);
  });

  it('accepts a macro normal borrowed from another material', () => {
    TERRAIN_MATERIALS['broken'] = {
      ...VALID,
      macroUvScale: 2,
      macroNormalFrom: 'rocks-ground-01',
      macroStrength: 0.6,
    };
    expect(() => validateTerrainMaterials()).not.toThrow();
  });

  it('rejects a negative macroStrength', () => {
    TERRAIN_MATERIALS['broken'] = {
      ...VALID,
      macroUvScale: 2,
      macroStrength: -0.5,
    };
    expect(() => validateTerrainMaterials()).toThrow(/must not be negative/);
  });
});

describe('getClimatePalette', () => {
  it('lists the default climate materials, base-first per biome', () => {
    expect(getClimatePalette(DEFAULT_CLIMATE)).toEqual([
      'aerial_grass_rock',
      'grass_path_02_1k',
      'forest_leaves_02',
      'forest_leaves_03_1k',
      'aerial_rocks_01',
      'marble_cliff_05',
      'snow-02',
    ]);
  });

  // Over the registry rather than one preset: the splat map is a fixed eight
  // channels, and a preset that overflows it renders materials the shader has
  // no channel for. Every shipped preset has to fit, not just the default.
  it.each(Object.keys(CLIMATE_PRESETS))('fits the splat map (%s)', (id) => {
    expect(getClimatePalette(CLIMATE_PRESETS[id]).length).toBeLessThanOrEqual(
      MAX_SPLAT_LAYERS
    );
  });

  it('gives a material shared by two biomes a single palette entry', () => {
    const palette = getClimatePalette(
      climateOf([
        biome('a', [{ material: 'snow-02' }]),
        biome('b', [{ material: 'snow-02' }, { material: 'marble_cliff_05' }]),
      ])
    );
    expect(palette).toEqual(['snow-02', 'marble_cliff_05']);
  });
});

describe('validateClimateLayers', () => {
  // Every registered preset, not just the default — this is the only thing
  // standing between a mis-authored preset and terrain that silently renders
  // one material where its author wrote three.
  it.each(Object.keys(CLIMATE_PRESETS))(
    'accepts the shipped climate preset (%s)',
    (id) => {
      expect(() => validateClimateLayers(CLIMATE_PRESETS[id])).not.toThrow();
    }
  );

  it('rejects a biome with no layers', () => {
    expect(() => validateClimateLayers(climateOf([biome('bare', [])]))).toThrow(
      /at least one layer/
    );
  });

  it('rejects an unknown material', () => {
    expect(() =>
      validateClimateLayers(climateOf([biome('a', [{ material: 'lava' }])]))
    ).toThrow(/unknown terrain material 'lava'/i);
  });

  // A selector on the base would be silently ignored — it takes whatever the
  // layers above leave uncovered — so the author would not get what they wrote.
  it('rejects a selector on the base layer', () => {
    const climate = climateOf([
      biome('a', [
        { material: 'snow-02', slope: { from: 0, to: 10 } } as never,
        { material: 'marble_cliff_05' },
      ]),
    ]);
    expect(() => validateClimateLayers(climate)).toThrow(/base layer/);
  });

  // A selectorless layer above the base has coverage 1 everywhere, so it takes
  // the entire remainder and every layer beneath it resolves to 0 — the author
  // sees one material where they wrote two. A valid splat comes out, so nothing
  // downstream can catch it.
  it('rejects a selectorless layer above the base', () => {
    const climate = climateOf([
      biome('a', [{ material: 'snow-02' }, { material: 'marble_cliff_05' }]),
    ]);
    expect(() => validateClimateLayers(climate)).toThrow(/no selectors/);
  });

  it('accepts a layer selected by noise alone', () => {
    const climate = climateOf([
      biome('a', [
        { material: 'snow-02' },
        {
          material: 'marble_cliff_05',
          noise: { scale: 20, seedSalt: 1, band: { from: 0.4, to: 0.6 } },
        },
      ]),
    ]);
    expect(() => validateClimateLayers(climate)).not.toThrow();
  });

  // Built from the whole library plus an extra registered material, so it
  // overflows whatever the library size is — the message just has to name the
  // splat's capacity, not a material count the table can drift past.
  it('rejects a climate needing more materials than the splat map holds', () => {
    TERRAIN_MATERIALS['test-extra'] = {
      name: 'test-extra',
      albedoUrl: 'terrain/test-extra/albedo.png',
      normalUrl: 'terrain/test-extra/normal.png',
      armUrl: 'terrain/test-extra/arm.jpg',
      heightUrl: 'terrain/test-extra/height.png',
      heightScale: 0.03,
      uvScale: 25,
      normalConvention: 'opengl' as const,
      roughness: 1,
    };

    try {
      const climate = climateOf([
        biome(
          'a',
          // Every layer past the base needs a selector, or the selectorless
          // check fires first and this stops testing overflow.
          Object.keys(TERRAIN_MATERIALS).map((material, i) =>
            i === 0 ? { material } : { material, slope: { from: 0, to: 10 } }
          )
        ),
      ]);
      expect(() => validateClimateLayers(climate)).toThrow(
        new RegExp(`but the splat map holds ${MAX_SPLAT_LAYERS}`)
      );
    } finally {
      delete TERRAIN_MATERIALS['test-extra'];
    }
  });
});
