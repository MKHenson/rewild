import type { WaterQuerySample } from '../water/WaterQuery';
import { ClimateConfig, resolveClimatePreset } from './Biomes';
import { PaintMask } from './PaintMask';
import { terrainGenerator } from './TerrainGenerator';

/** The terrain a `BiomeProbe` reads. `TerrainRenderer` is one. */
export interface BiomeProbeTerrain {
  readonly seed: number;
  readonly climatePreset: string;
  /** LOD-0 samples per chunk side. */
  readonly mapChunkSizeLod: number;
  readonly metersPerSample: number;
  readonly seaLevel?: number;
  readonly terrainChunks: ReadonlyMap<
    string,
    { readonly biomeMask: PaintMask | null }
  >;
}

const NO_MASK = new Uint8Array(0);

/**
 * The biomes at a world point, painted ones included, by the same lookup the
 * splat map uses (Rust, `TerrainGenerator.biomesAt`). `probe` writes them into
 * `biomes` / `weights`, indices into `climate.biomes` with weights summing to
 * 1, and returns how many. Unloaded chunks count as unpainted. `probeSea`
 * writes the sea biomes over the water there into `seaWeights`, one per
 * `climate.sea.biomes`. Allocates only when the climate changes.
 */
export class BiomeProbe {
  private _climate: ClimateConfig | null = null;
  private _preset = '';
  private _biomes: Int32Array | null = null;
  private _weights: Float64Array | null = null;
  private _count = 0;
  private _seaWeights: Float64Array | null = null;

  get climate(): ClimateConfig | null {
    return this._climate;
  }

  get count(): number {
    return this._count;
  }

  get biomes(): Int32Array | null {
    return this._biomes;
  }

  get weights(): Float64Array | null {
    return this._weights;
  }

  get seaWeights(): Float64Array | null {
    return this._seaWeights;
  }

  /** The weight of the named biome at the last probe, 0 when absent. */
  weightOf(name: string): number {
    const biomes = this._biomes;
    const climate = this._climate;
    if (!biomes || !climate) return 0;
    for (let i = 0; i < this._count; i++)
      if (climate.biomes[biomes[i]].name === name) return this._weights![i];
    return 0;
  }

  /** The weight of the named sea biome at the last sea probe, 0 when absent. */
  seaWeightOf(name: string): number {
    const sea = this._climate?.sea;
    const weights = this._seaWeights;
    if (!sea || !weights) return 0;
    for (let i = 0; i < sea.biomes.length; i++)
      if (sea.biomes[i].name === name) return weights[i];
    return 0;
  }

  /** The sea biomes at (x, z) over `water`; returns the sea's share of the
   *  bed there, 0 when dry or for a climate with no sea. */
  probeSea(
    terrain: BiomeProbeTerrain,
    x: number,
    z: number,
    water: WaterQuerySample
  ): number {
    const climate = this.useClimate(terrain);
    const weights = this._seaWeights!;
    weights.fill(0);
    if (!climate.sea || !water.wet) return 0;
    const mps = terrain.metersPerSample;
    return terrainGenerator(
      terrain.seed,
      climate,
      terrain.seaLevel ?? 0
    ).seaBiomesAt(
      x / mps - 0.5,
      -z / mps - 0.5,
      water.depth,
      water.coverage,
      water.shore,
      water.typeWeights,
      weights
    );
  }

  private useClimate(terrain: BiomeProbeTerrain): ClimateConfig {
    if (terrain.climatePreset !== this._preset || !this._climate) {
      this._preset = terrain.climatePreset;
      this._climate = resolveClimatePreset(this._preset);
      // Painted biomes merge with up to four climate biomes.
      const capacity = this._climate.biomes.length + 4;
      this._biomes = new Int32Array(capacity);
      this._weights = new Float64Array(capacity);
      this._seaWeights = new Float64Array(
        this._climate.sea?.biomes.length ?? 0
      );
    }
    return this._climate;
  }

  probe(terrain: BiomeProbeTerrain, x: number, z: number): number {
    const climate = this.useClimate(terrain);
    const size = terrain.mapChunkSizeLod;
    const mps = terrain.metersPerSample;
    const span = (size - 1) * mps;
    const cx = Math.round(x / span);
    const cy = Math.round(z / span);

    const mask = terrain.terrainChunks.get(`${cx},${cy}`)?.biomeMask ?? null;
    const painted =
      mask && mask.channels === climate.biomes.length ? mask : null;

    this._count = terrainGenerator(
      terrain.seed,
      climate,
      terrain.seaLevel ?? 0
    ).biomesAt(
      x / mps - 0.5,
      -z / mps - 0.5,
      painted ? painted.weights : NO_MASK,
      painted ? painted.size : 0,
      painted ? painted.step : 0,
      (x - cx * span + span / 2) / mps,
      (cy * span + span / 2 - z) / mps,
      this._biomes!,
      this._weights!
    );
    return this._count;
  }
}
