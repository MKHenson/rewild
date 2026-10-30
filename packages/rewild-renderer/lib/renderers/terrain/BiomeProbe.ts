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
 * 1, and returns how many. Unloaded chunks count as unpainted. Allocates only
 * when the climate changes.
 */
export class BiomeProbe {
  private _climate: ClimateConfig | null = null;
  private _preset = '';
  private _biomes: Int32Array | null = null;
  private _weights: Float64Array | null = null;
  private _count = 0;

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

  /** The weight of the named biome at the last probe, 0 when absent. */
  weightOf(name: string): number {
    const biomes = this._biomes;
    const climate = this._climate;
    if (!biomes || !climate) return 0;
    for (let i = 0; i < this._count; i++)
      if (climate.biomes[biomes[i]].name === name) return this._weights![i];
    return 0;
  }

  probe(terrain: BiomeProbeTerrain, x: number, z: number): number {
    if (terrain.climatePreset !== this._preset || !this._climate) {
      this._preset = terrain.climatePreset;
      this._climate = resolveClimatePreset(this._preset);
      // Painted biomes merge with up to four climate biomes.
      const capacity = this._climate.biomes.length + 4;
      this._biomes = new Int32Array(capacity);
      this._weights = new Float64Array(capacity);
    }
    const climate = this._climate;
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
