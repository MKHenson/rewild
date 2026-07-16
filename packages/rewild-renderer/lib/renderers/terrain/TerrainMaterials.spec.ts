import {
  ClimateConfig,
  DEFAULT_CLIMATE,
  MAX_SPLAT_LAYERS,
  getClimatePalette,
  validateClimateLayers,
} from './Biomes';
import { TERRAIN_MATERIALS, getTerrainMaterial } from './TerrainMaterials';

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

  it('pairs every macroNormal with a macroUvScale', () => {
    for (const material of Object.values(TERRAIN_MATERIALS)) {
      expect(!!material.macroNormal).toBe(material.macroUvScale !== undefined);
    }
  });

  // The macro normal only earns its samples if it is materially coarser than
  // the detail normal — at the same scale it would just double the detail.
  it('samples macro normals at a coarser scale than detail', () => {
    for (const material of Object.values(TERRAIN_MATERIALS)) {
      if (material.macroUvScale === undefined) continue;
      expect(material.macroUvScale).toBeLessThan(material.uvScale);
    }
  });
});

describe('getClimatePalette', () => {
  it('lists the default climate materials, base-first per biome', () => {
    expect(getClimatePalette(DEFAULT_CLIMATE)).toEqual([
      'forest-ground-01',
      'ground-coastal-1',
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
  // palette needs a fifth registered for the duration of the test — otherwise
  // this would throw on the unknown material and pass for the wrong reason.
  it('rejects a climate needing more materials than the splat map holds', () => {
    TERRAIN_MATERIALS['test-fifth'] = {
      name: 'test-fifth',
      albedo: 'crate',
      normal: 'crate-normal',
      uvScale: 25,
      specular: 0.1,
    };

    try {
      const climate = climateOf([
        biome('a', [
          { material: 'snow-02' },
          { material: 'rocks-ground-01' },
          { material: 'ground-coastal-1' },
          { material: 'forest-ground-01' },
        ]),
        biome('b', [{ material: 'test-fifth' }]),
      ]);
      expect(() => validateClimateLayers(climate)).toThrow(
        /needs 5 materials .* but the splat map holds 4/
      );
    } finally {
      delete TERRAIN_MATERIALS['test-fifth'];
    }
  });
});
