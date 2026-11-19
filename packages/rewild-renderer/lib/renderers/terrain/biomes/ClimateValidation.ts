import { SCATTER_LAYERS } from '../ScatterLayers';
import { TERRAIN_MATERIALS } from '../TerrainMaterials';
import { LAKE_WATER, getWaterTypeIndex, validateWaterPalette } from '../Water';
import type { ClimateConfig } from './BiomeTypes';
import {
  MAX_SPLAT_LAYERS,
  getClimatePalette,
  getCoastMaterials,
} from './ClimateQueries';

// Run by validateClimateLayers, so a bad rule surfaces at world load rather
// than at the first scattered chunk.
export function validateBiomeScatter(climate: ClimateConfig): void {
  for (const biome of climate.biomes) {
    const seen = new Set<string>();

    for (const rule of biome.scatter ?? []) {
      if (!SCATTER_LAYERS[rule.layer])
        throw new Error(
          `Biome '${biome.name}' references unknown scatter layer '${rule.layer}'.`
        );

      // Rules do not composite, so a repeat silently doubles the density.
      if (seen.has(rule.layer))
        throw new Error(
          `Biome '${biome.name}' names scatter layer '${rule.layer}' twice — a biome carries one rule per layer.`
        );
      seen.add(rule.layer);

      // Zero places nothing, which reads as broken; drop the rule instead.
      if (rule.density <= 0 || rule.density > 1)
        throw new Error(
          `Biome '${biome.name}' scatter layer '${rule.layer}' density ${rule.density} must be within (0, 1] — it is a fraction of what the layer's footprint allows.`
        );

      if (rule.waterType && getWaterTypeIndex(climate, rule.waterType) < 0)
        throw new Error(
          `Biome '${biome.name}' scatter layer '${rule.layer}' needs water type '${rule.waterType}', which the climate's palette lacks.`
        );
    }
  }
}

export function validateLakes(climate: ClimateConfig): void {
  const lakes = climate.lakes;
  if (!lakes) return;
  if (getWaterTypeIndex(climate, LAKE_WATER) < 0)
    throw new Error(
      `Climate has lakes but no '${LAKE_WATER}' water type to fill them.`
    );
  if (
    !(lakes.radius.from > 0) ||
    lakes.radius.to < lakes.radius.from ||
    !(lakes.bank > 1) ||
    !(lakes.irregularity >= 0 && lakes.irregularity <= 0.5) ||
    !(lakes.chance >= 0 && lakes.chance <= 1) ||
    !(lakes.depth.from > 0) ||
    lakes.depth.to < lakes.depth.from ||
    !(lakes.margin >= 0) ||
    !(lakes.moraine >= 0) ||
    !(lakes.maxLagoonSlope >= 0) ||
    !(lakes.lagoonChance >= 0 && lakes.lagoonChance <= 1) ||
    !(lakes.spacing >= 0)
  )
    throw new Error(
      'Lakes need a positive ascending radius and depth, bank > 1, irregularity within 0..0.5, chance and lagoonChance within 0..1 and non-negative margin, moraine and spacing.'
    );
  const tarns = lakes.tarns;
  if (
    tarns &&
    (!(tarns.radius.from > 0) ||
      tarns.radius.to < tarns.radius.from ||
      !(tarns.lipShare >= 0 && tarns.lipShare <= 1) ||
      !(tarns.maxRimSlope >= lakes.maxRimSlope))
  )
    throw new Error(
      "Tarns need a positive ascending radius, lipShare within 0..1 and a maxRimSlope no gentler than the lakes'."
    );
  // A lake must fit inside one cell's reach, or the neighbouring cells a chunk
  // checks would miss it.
  if (
    lakes.lagoonChance > 0 &&
    (!(lakes.lagoonRadius.from > 0) ||
      lakes.lagoonRadius.to < lakes.lagoonRadius.from)
  )
    throw new Error('Lagoons need a positive ascending radius.');
  const reach =
    Math.max(
      lakes.radius.to,
      tarns ? tarns.radius.to : 0,
      lakes.lagoonChance > 0 ? lakes.lagoonRadius.to : 0
    ) *
    (1 + lakes.irregularity) *
    (lakes.bank + lakes.moraine);
  if (reach >= lakes.cellSize)
    throw new Error(
      `Lakes reach ${reach} samples, which must be less than the ${lakes.cellSize}-sample cell.`
    );
}

// Fails loudly on a mis-authored table rather than rendering something subtly
// wrong. Called wherever a climate is first resolved for splat generation.
export function validateClimateLayers(climate: ClimateConfig): void {
  for (const biome of climate.biomes) {
    if (!biome.layers || biome.layers.length === 0)
      throw new Error(`Biome '${biome.name}' must have at least one layer.`);

    // The base takes whatever the layers above leave uncovered, so a selector
    // on it would be silently ignored.
    const base = biome.layers[0];
    if (base.slope || base.height)
      throw new Error(
        `Biome '${biome.name}' base layer '${base.material}' must not have selectors — it covers whatever the layers above it do not.`
      );

    for (let i = 0; i < biome.layers.length; i++) {
      const layer = biome.layers[i];
      if (!TERRAIN_MATERIALS[layer.material])
        throw new Error(
          `Biome '${biome.name}' references unknown terrain material '${layer.material}'.`
        );

      // Coverage 1 everywhere buries every layer beneath at weight 0. A valid
      // splat comes out, just an unintended one, so nothing downstream can
      // catch it.
      if (i > 0 && !layer.slope && !layer.height && !layer.noise)
        throw new Error(
          `Biome '${biome.name}' layer ${i} ('${layer.material}') has no selectors, so it covers everything and buries the layers beneath it. Give it a slope, height or noise selector — or make it the base layer.`
        );
    }
  }

  const coast = climate.coast;
  if (coast) {
    for (const material of getCoastMaterials(coast))
      if (!TERRAIN_MATERIALS[material])
        throw new Error(
          `Coast references unknown terrain material '${material}'.`
        );
    if (coast.blend <= 0)
      throw new Error('Coast blend must be a positive number of metres.');
    if (
      !(
        coast.beachHeight > coast.wetHeight &&
        coast.wetHeight > -coast.seabedDepth
      )
    )
      throw new Error(
        'Coast bands must satisfy beachHeight > wetHeight > -seabedDepth.'
      );
  }

  validateLakes(climate);

  const palette = getClimatePalette(climate);
  if (palette.length > MAX_SPLAT_LAYERS)
    throw new Error(
      `Climate needs ${palette.length} materials (${palette.join(
        ', '
      )}) but the splat map holds ${MAX_SPLAT_LAYERS}.`
    );

  validateBiomeScatter(climate);
  validateWaterPalette(climate);
}
