import type { ClimateConfig, CoastConfig } from './BiomeTypes';

// Materials per climate, across two RGBA8 splat textures. The palette is global
// rather than per-chunk, so there is no eviction policy and no overflow seam at
// a shared edge. Per-chunk palettes are the answer if the library ever outgrows
// eight simultaneously visible materials; the shader's layerIndex indirection
// is the hook for it.
export const MAX_SPLAT_LAYERS = 8;

// Two consecutive planes (channels 0-3, then 4-7) rather than interleaved, so
// each plane uploads straight from the same buffer.
export const SPLAT_BYTES_PER_TEXEL = MAX_SPLAT_LAYERS;

// The splat map's channel i. Biome order then layer order, then the coast's
// materials, so adding a layer shifts later channels — which only matters once
// splat maps are persisted.
export function getClimatePalette(climate: ClimateConfig): string[] {
  const palette: string[] = [];
  for (const biome of climate.biomes) {
    for (const layer of biome.layers) {
      if (!palette.includes(layer.material)) palette.push(layer.material);
    }
  }
  for (const material of getCoastMaterials(climate.coast))
    if (!palette.includes(material)) palette.push(material);
  return palette;
}

/** The coast's sand, wet sand and sea bed materials, with fallbacks applied. */
export function getCoastMaterials(
  coast: CoastConfig | undefined
): [string, string, string] | [] {
  if (!coast) return [];
  const wet = coast.wetSand ?? coast.sand;
  return [coast.sand, wet, coast.seabed ?? wet];
}

// A loose upper bound on what generation may produce: every deformation peaks
// at its own amplitude and they stack, so a biome's ceiling is their sum.
export function getMaxWorldHeight(climate: ClimateConfig): number {
  let max = 0;
  for (const biome of climate.biomes) {
    let ceiling = 0;
    for (const def of biome.deformations) ceiling += def.amplitude;
    if (ceiling > max) max = ceiling;
  }
  return max;
}
