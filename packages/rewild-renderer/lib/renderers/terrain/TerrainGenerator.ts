import { TerrainGenerator } from '../../../../rewild-wasm/pkg/rewild_wasm';
import { TERRAIN_METERS_PER_SAMPLE } from './MeshGenerator';
import {
  ClimateConfig,
  getClimatePalette,
  getCoastMaterials,
  validateLakes,
} from './Biomes';
import { getScatterLayer, getScatterLayerOrder } from './ScatterLayers';

// Terrain is generated in Rust (packages/rewild-wasm/crates/terrain). The WASM
// module must be loaded first (see RewildWasm).

// One generator per world. Climates are keyed by identity: presets are shared
// objects, and an ad hoc climate is collected along with its generators.
const generators = new WeakMap<ClimateConfig, Map<string, TerrainGenerator>>();

/** The Rust generator for a world, built on first use. */
export function terrainGenerator(
  seed: number,
  climate: ClimateConfig,
  seaLevel: number
): TerrainGenerator {
  let worlds = generators.get(climate);
  if (!worlds) {
    worlds = new Map();
    generators.set(climate, worlds);
  }
  const key = `${seed}:${seaLevel}`;
  let generator = worlds.get(key);
  if (!generator) {
    validateLakes(climate);
    generator = new TerrainGenerator(
      climate,
      {
        palette: getClimatePalette(climate),
        coastMaterials: getCoastMaterials(climate.coast),
      },
      getScatterLayerOrder().map(getScatterLayer),
      seed,
      seaLevel,
      TERRAIN_METERS_PER_SAMPLE
    );
    worlds.set(key, generator);
  }
  return generator;
}
