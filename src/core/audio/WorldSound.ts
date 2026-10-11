import type { AudioEngine, AudioScope } from 'rewild-audio';
import type { Renderer } from 'rewild-renderer';
import { isDawn } from 'rewild-renderer/lib/atmosphere/DayNightCycle';
import { moonIllumination } from 'rewild-renderer/lib/renderers/sky/Moon';
import { rainShare } from 'rewild-renderer/lib/renderers/sky/RainWetness';
import { resolveClimatePreset } from 'rewild-renderer/lib/renderers/terrain/Biomes';
import { BiomeProbe } from 'rewild-renderer/lib/renderers/terrain/BiomeProbe';
import type { TerrainRenderer } from 'rewild-renderer/lib/renderers/terrain/TerrainRenderer';
import {
  MAX_WATER_TYPES,
  OCEAN_WATER,
} from 'rewild-renderer/lib/renderers/terrain/Water';
import type { ShorePoint } from 'rewild-renderer/lib/renderers/water/ShoreField';
import type { WaterQuerySample } from 'rewild-renderer/lib/renderers/water/WaterQuery';
import { soundscapesDef, soundscapesLoaded } from './audio';
import { OpenSeaSound, SeaWater } from './OpenSeaSound';
import { RainSound } from './RainSound';
import { Soundscape, SoundscapeWeather } from './Soundscape';
import { SurfSound, SurfWater } from './SurfSound';
import { ThunderSound } from './ThunderSound';
import { WindSound } from './WindSound';

/** The terrain's water, as the surf and the open sea read it. */
class TerrainWater implements SurfWater, SeaWater {
  readonly lapping = new Float64Array(MAX_WATER_TYPES);
  readonly ocean = new Float64Array(MAX_WATER_TYPES);
  private _terrain: TerrainRenderer | null = null;
  private _preset: string | null = null;

  readonly sample = (x: number, z: number, out: WaterQuerySample): boolean =>
    this._terrain ? this._terrain.waterQuery.sample(x, z, out) : false;

  get seaLevel(): number {
    return this._terrain?.seaLevel ?? 0;
  }

  attach(terrain: TerrainRenderer): void {
    this._terrain = terrain;
    if (terrain.climatePreset === this._preset) return;
    this._preset = terrain.climatePreset;
    const palette = resolveClimatePreset(this._preset).water ?? [];
    this.lapping.fill(0);
    this.ocean.fill(0);
    for (let i = 0; i < palette.length && i < MAX_WATER_TYPES; i++) {
      this.lapping[i] = palette[i].lapping;
      this.ocean[i] = palette[i].name === OCEAN_WATER ? 1 : 0;
    }
  }

  nearestShore(x: number, z: number, out: ShorePoint): boolean {
    return this._terrain?.shoreField?.nearestShore(x, z, out) ?? false;
  }
}

const BIOME_PROBE_SECONDS = 0.2;

/**
 * The sound of the world around the listener: the weather now, and the water
 * and the land as they arrive. The game and the editor each own one in their
 * scene scope and update it once a frame, before `audio.update()`.
 */
export class WorldSound {
  private readonly _wind: WindSound;
  private readonly _rain: RainSound;
  private readonly _thunder: ThunderSound;
  private readonly _surf: SurfSound;
  private readonly _openSea: OpenSeaSound;
  private readonly _water = new TerrainWater();
  private readonly _biomes = new BiomeProbe();
  private readonly _engine: AudioEngine;
  private readonly _scope: AudioScope;
  private readonly _weather: SoundscapeWeather = {
    windiness: 0,
    gust: 0,
    rain: 0,
    snow: 0,
    wetness: 0,
    fog: 0,
    cloudiness: 0,
    sun: 0,
    dawn: false,
    moon: 0,
    state: 'Fair',
  };
  private _biomeWait = 0;
  private _soundscape: Soundscape | null = null;
  private _soundscapeVersion = 0;

  constructor(engine: AudioEngine, scope: AudioScope) {
    this._engine = engine;
    this._scope = scope;
    this._wind = new WindSound(engine, scope);
    this._rain = new RainSound(scope);
    this._thunder = new ThunderSound(engine, scope);
    this._surf = new SurfSound(engine, scope);
    this._openSea = new OpenSeaSound(engine, scope);
  }

  get wind(): WindSound {
    return this._wind;
  }

  get rain(): RainSound {
    return this._rain;
  }

  /** The biomes at the listener, probed at 5 Hz. */
  get biomes(): BiomeProbe {
    return this._biomes;
  }

  update(renderer: Renderer, seconds: number): void {
    const sky = renderer.sky?.skyRenderer;
    if (!sky) return;
    const atmosphere = renderer.sky.atmosphere;
    this._wind.update(sky.wind, seconds);
    this._rain.update(sky);
    this._thunder.update(
      sky.lightning.strikes,
      sky.wind,
      atmosphere.running && atmosphere.state === 'FrontApproaching',
      seconds
    );
    if (renderer.terrainRenderer) {
      this._water.attach(renderer.terrainRenderer);
      this._surf.update(this._water, sky.wind.vec[2], seconds);
      this._openSea.update(this._water, sky.wind.vec[2], seconds);
      this._biomeWait -= seconds;
      if (this._biomeWait <= 0) {
        this._biomeWait = BIOME_PROBE_SECONDS;
        const listener = this._engine.listenerPosition;
        this._biomes.probe(renderer.terrainRenderer, listener.x, listener.z);
      }
      this._updateSoundscape(renderer, seconds);
    }
  }

  /** Builds the soundscape again whenever `soundscapes.json` loads. */
  private _updateSoundscape(renderer: Renderer, seconds: number): void {
    const version = soundscapesLoaded();
    if (version !== this._soundscapeVersion) {
      this._soundscapeVersion = version;
      this._soundscape?.dispose();
      this._soundscape = null;
      const def = soundscapesDef();
      if (def)
        try {
          this._soundscape = new Soundscape(def, this._scope);
        } catch (e) {
          console.error('templates/soundscapes.json:', e);
        }
    }
    if (!this._soundscape) return;

    const sky = renderer.sky.skyRenderer;
    const w = this._weather;
    const precipitation = Math.max(0, sky.precipitation);
    w.windiness = sky.wind.vec[2];
    w.gust = this._wind.gust;
    w.rain = rainShare(precipitation, sky.temperature);
    w.snow = precipitation - w.rain;
    w.wetness = sky.rainWetness.film;
    w.fog = sky.foginess;
    w.cloudiness = sky.cloudiness;
    w.sun = sky.upDot;
    w.dawn = isDawn(sky.elevation);
    w.moon = sky.moon.isKeyLight(sky.elevation)
      ? moonIllumination(sky.moon.phase)
      : 0;
    w.state = renderer.sky.atmosphere.state;
    this._soundscape.update(w, this._biomes, seconds);
  }
}
