import {
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

function biome(name: string, layers: { material: string }[]) {
  return {
    name,
    heightScale: 10,
    noiseScale: 100,
    octaves: 1,
    persistence: 0.5,
    lacunarity: 2,
    heightCurveExp: 1,
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

  it('rejects a macroNormalUrl without a macroUvScale', () => {
    TERRAIN_MATERIALS['broken'] = {
      name: 'broken',
      albedoUrl: 'terrain/x/albedo.png',
      normalUrl: 'terrain/x/normal.png',
      roughnessUrl: 'terrain/x/rough.png',
      uvScale: 25,
      normalConvention: 'opengl' as const,
      macroNormalUrl: 'terrain/x/normal.png',
      specular: 0.1,
    };
    expect(() => validateTerrainMaterials()).toThrow(/together/);
  });

  it('rejects a macro normal that is not coarser than the detail normal', () => {
    TERRAIN_MATERIALS['broken'] = {
      name: 'broken',
      albedoUrl: 'terrain/x/albedo.png',
      normalUrl: 'terrain/x/normal.png',
      roughnessUrl: 'terrain/x/rough.png',
      uvScale: 25,
      normalConvention: 'opengl' as const,
      macroNormalUrl: 'terrain/x/normal.png',
      macroUvScale: 25,
      specular: 0.1,
    };
    expect(() => validateTerrainMaterials()).toThrow(/coarser/);
  });

  // There is no separate macro-normal array, so the macro normal is the
  // material's own normal layer sampled at a coarser scale. A distinct macro
  // map would silently render as the detail map instead.
  it('rejects a macroNormalUrl that is a different texture to the normal', () => {
    TERRAIN_MATERIALS['broken'] = {
      name: 'broken',
      albedoUrl: 'terrain/x/albedo.png',
      normalUrl: 'terrain/x/normal.png',
      roughnessUrl: 'terrain/x/rough.png',
      uvScale: 25,
      normalConvention: 'opengl' as const,
      macroNormalUrl: 'terrain/x/some-other-normal.png',
      macroUvScale: 2,
      specular: 0.1,
    };
    expect(() => validateTerrainMaterials()).toThrow(/third texture array/);
  });
});

describe('getClimatePalette', () => {
  it('lists the default climate materials, base-first per biome', () => {
    expect(getClimatePalette(DEFAULT_CLIMATE)).toEqual([
      'forest-ground-01',
      'aerial_rocks_01',
      'rocks-ground-01',
      'snow-02',
    ]);
  });

  it('fills the splat map exactly, with no room to spare', () => {
    expect(getClimatePalette(DEFAULT_CLIMATE)).toHaveLength(MAX_SPLAT_LAYERS);
  });

  it('gives a material shared by two biomes a single palette entry', () => {
    const palette = getClimatePalette(
      climateOf([
        biome('a', [{ material: 'snow-02' }]),
        biome('b', [{ material: 'snow-02' }, { material: 'rocks-ground-01' }]),
      ])
    );
    expect(palette).toEqual(['snow-02', 'rocks-ground-01']);
  });
});

describe('validateClimateLayers', () => {
  it('accepts the shipped default climate', () => {
    expect(() => validateClimateLayers(DEFAULT_CLIMATE)).not.toThrow();
  });

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
        { material: 'rocks-ground-01' },
      ]),
    ]);
    expect(() => validateClimateLayers(climate)).toThrow(/base layer/);
  });

  // The library holds exactly MAX_SPLAT_LAYERS materials, so overflowing the
  // palette needs one more distinct material than the splat map holds. Built
  // from the whole library plus an extra registered material, so it overflows
  // whatever the library size is — the message just has to name a count over
  // MAX_SPLAT_LAYERS, not a hardcoded number the table can drift past.
  it('rejects a climate needing more materials than the splat map holds', () => {
    TERRAIN_MATERIALS['test-extra'] = {
      name: 'test-extra',
      albedoUrl: 'terrain/test-extra/albedo.png',
      normalUrl: 'terrain/test-extra/normal.png',
      roughnessUrl: 'terrain/test-extra/rough.png',
      uvScale: 25,
      normalConvention: 'opengl' as const,
      specular: 0.1,
    };

    try {
      const climate = climateOf([
        biome(
          'a',
          Object.keys(TERRAIN_MATERIALS).map((material) => ({ material }))
        ),
      ]);
      expect(() => validateClimateLayers(climate)).toThrow(
        /but the splat map holds 4/
      );
    } finally {
      delete TERRAIN_MATERIALS['test-extra'];
    }
  });
});
