import { Vector2 } from 'rewild-common';
import { ClimateConfig, resolveClimatePreset } from './Biomes';
import {
  BiomeResolver,
  createBiomeResolver,
  createClimateField,
  resolveActiveBiomes,
} from './ClimateField';
import { PaintMask } from './PaintMask';

/** The terrain a `BiomeProbe` reads. `TerrainRenderer` is one. */
export interface BiomeProbeTerrain {
  readonly seed: number;
  readonly climatePreset: string;
  /** LOD-0 samples per chunk side. */
  readonly mapChunkSizeLod: number;
  readonly metersPerSample: number;
  readonly terrainChunks: ReadonlyMap<
    string,
    { readonly biomeMask: PaintMask | null }
  >;
}

/**
 * The biomes at a world point, painted ones included, by the same lookup the
 * splat map uses. `probe` writes them into `biomes` / `weights`, indices into
 * `climate.biomes` with weights summing to 1, and returns how many.
 * Unloaded chunks count as unpainted. Allocates only when the chunk or the
 * climate changes.
 */
export class BiomeProbe {
  private _resolver: BiomeResolver | null = null;
  private _climate: ClimateConfig | null = null;
  private _seed = NaN;
  private _preset = '';
  private _size = 0;
  private _cx = NaN;
  private _cy = NaN;
  private _key = '';
  private _count = 0;

  get climate(): ClimateConfig | null {
    return this._climate;
  }

  get count(): number {
    return this._count;
  }

  get biomes(): Int32Array | null {
    return this._resolver?.biomes ?? null;
  }

  get weights(): Float64Array | null {
    return this._resolver?.weights ?? null;
  }

  /** The weight of the named biome at the last probe, 0 when absent. */
  weightOf(name: string): number {
    const resolver = this._resolver;
    const climate = this._climate;
    if (!resolver || !climate) return 0;
    for (let i = 0; i < this._count; i++)
      if (climate.biomes[resolver.biomes[i]].name === name)
        return resolver.weights[i];
    return 0;
  }

  probe(terrain: BiomeProbeTerrain, x: number, z: number): number {
    const size = terrain.mapChunkSizeLod;
    const mps = terrain.metersPerSample;
    const span = (size - 1) * mps;
    const cx = Math.round(x / span);
    const cy = Math.round(z / span);

    if (
      terrain.seed !== this._seed ||
      terrain.climatePreset !== this._preset ||
      size !== this._size
    ) {
      this._seed = terrain.seed;
      this._preset = terrain.climatePreset;
      this._size = size;
      this._climate = resolveClimatePreset(this._preset);
      this._cx = NaN;
    }
    const climate = this._climate!;

    if (cx !== this._cx || cy !== this._cy) {
      this._cx = cx;
      this._cy = cy;
      this._key = `${cx},${cy}`;
      const field = createClimateField(
        size,
        size,
        this._seed,
        new Vector2(cx * (size - 1), cy * (size - 1)),
        climate
      );
      this._resolver = createBiomeResolver(field, null);
    }
    const resolver = this._resolver!;

    const mask = terrain.terrainChunks.get(this._key)?.biomeMask ?? null;
    resolver.biomeMask =
      mask && mask.channels === climate.biomes.length ? mask : null;

    this._count = resolveActiveBiomes(
      resolver,
      (x - cx * span + span / 2) / mps,
      (cy * span + span / 2 - z) / mps
    );
    return this._count;
  }
}
