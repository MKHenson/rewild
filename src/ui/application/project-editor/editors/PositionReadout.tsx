import { Component, register, theme, StyledIcon, Button } from 'rewild-ui';
import type { Renderer } from 'rewild-renderer';
import { Vector2, Vector3 } from 'rewild-common';
// Deep imports: the terrain tables only, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import {
  ClimateConfig,
  resolveClimatePreset,
} from 'rewild-renderer/lib/renderers/terrain/Biomes';
import {
  ClimateField,
  createClimateField,
  resolveBiomeWeights,
} from 'rewild-renderer/lib/renderers/terrain/ClimateField';
import {
  Lake,
  OCEAN_BODY_ID,
  findLakes,
  lakeSpaceToWorld,
  worldToLakeSpace,
} from 'rewild-renderer/lib/renderers/terrain/Lakes';
import { fromFloat16 } from 'rewild-renderer/lib/utils/float16';

interface Props {
  renderer: Renderer;
}

const STORAGE_KEY = 'rewild.editor.positionReadout';
const WEATHER_KEY = 'rewild.editor.lensEffects';
const REFRESH_MS = 200;
// Lakes are searched this far around the camera, and searched again once the
// camera has moved a share of it.
const LAKE_SEARCH_METRES = 4000;
const LAKE_REFRESH_METRES = 500;

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // Storage is a convenience; the toggle still works for this session.
  }
}

function labelForBiome(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// "FrontApproaching" → "Front approaching".
function labelForState(state: string): string {
  const words = state.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

const FORECAST_SHOWN = 3;

// The weather state and the ones coming, while the atmosphere runs.
function describeWeather(renderer: Renderer): { now: string; next: string } {
  const atmosphere = renderer.sky.atmosphere;
  if (!atmosphere.running)
    return { now: 'Static (Dynamic Day & Weather off)', next: '—' };
  const sample = atmosphere.sample;
  const left = atmosphere.stateDuration - atmosphere.stateElapsed;
  const now = `${labelForState(sample.state)} · ${Math.round(
    sample.stateProgress * 100
  )}% · ${formatDuration(left)} left${
    atmosphere.isEnabled ? '' : ' · scripted'
  } · seed ${atmosphere.seed}`;
  const next = atmosphere
    .forecast(FORECAST_SHOWN)
    .map(
      (entry) =>
        `${labelForState(entry.state)} in ${formatDuration(entry.startsIn)}`
    )
    .join(' · ');
  return { now, next };
}

function formatDistance(metres: number): string {
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
}

// Generated lakes set the top bit of their body ID; the editor's do not.
const GENERATED_LAKE_BIT = 0x80000000;

// The water body showing under world (x, z) in its loaded chunk, or null.
function waterUnder(
  renderer: Renderer,
  x: number,
  z: number,
  ground: number | null
): string | null {
  const terrain = renderer.terrainRenderer;
  const span = terrain.chunkSize;
  const cx = Math.round(x / span);
  const cy = Math.round(z / span);
  const water = terrain.terrainChunks.get(`${cx},${cy}`)?.water;
  if (!water) return null;
  const unit = terrain.metersPerSample * water.step;
  const last = water.size - 1;
  const mx = Math.min(
    last,
    Math.max(0, Math.round((x - cx * span + span / 2) / unit))
  );
  const my = Math.min(
    last,
    Math.max(0, Math.round((cy * span + span / 2 - z) / unit))
  );
  const t = my * water.size + mx;
  if (water.coverage[t] === 0) return null;
  const id = water.bodyIds[t];
  const body = water.bodies.find((b) => b.id === id);
  if (!body || (ground !== null && ground >= body.level)) return null;
  const kind =
    id === OCEAN_BODY_ID
      ? 'Sea'
      : (id & GENERATED_LAKE_BIT) !== 0
      ? 'Generated lake'
      : 'Painted lake';
  const depth =
    ground === null ? '' : ` · ${(body.level - ground).toFixed(1)} m deep`;
  return `${kind} ${
    id === OCEAN_BODY_ID ? '' : `${id} `
  }under you · level ${body.level.toFixed(1)} m${depth}${
    body.locked ? ' · locked' : ''
  }`;
}

const PAINTED_SEARCH_METRES = 1000;

interface PaintedWater {
  id: number;
  level: number;
  distance: number;
}

// The nearest texel of a painted lake within PAINTED_SEARCH_METRES of world
// (x, z), over the loaded chunks' water maps, where its water shows.
function nearestPainted(
  renderer: Renderer,
  x: number,
  z: number
): PaintedWater | null {
  const terrain = renderer.terrainRenderer;
  const span = terrain.chunkSize;
  const reach = PAINTED_SEARCH_METRES;
  let best: PaintedWater | null = null;
  for (
    let cy = Math.round((z - reach) / span);
    cy <= Math.round((z + reach) / span);
    cy++
  )
    for (
      let cx = Math.round((x - reach) / span);
      cx <= Math.round((x + reach) / span);
      cx++
    ) {
      const water = terrain.terrainChunks.get(`${cx},${cy}`)?.water;
      if (!water?.shows) continue;
      const unit = terrain.metersPerSample * water.step;
      for (let my = 0; my < water.size; my++)
        for (let mx = 0; mx < water.size; mx++) {
          const t = my * water.size + mx;
          const id = water.bodyIds[t];
          if (
            water.coverage[t] === 0 ||
            id === OCEAN_BODY_ID ||
            (id & GENERATED_LAKE_BIT) !== 0 ||
            fromFloat16(water.heights[t]) >= fromFloat16(water.level[t])
          )
            continue;
          const d = Math.hypot(
            cx * span - span / 2 + mx * unit - x,
            cy * span + span / 2 - my * unit - z
          );
          if (d > reach || (best && d >= best.distance)) continue;
          best = {
            id,
            level: water.baseLevel + fromFloat16(water.level[t]),
            distance: d,
          };
        }
    }
  return best;
}

function describePainted(painted: PaintedWater): string {
  return `Painted lake ${painted.id} ${formatDistance(
    painted.distance
  )} away · level ${painted.level.toFixed(1)} m`;
}

// A toggle in the viewport's top right: the camera's world position, the
// climate biomes under it, the ground height, the water under it or else the
// nearest lake, painted or generated, and the weather state and the ones
// coming. The panel opens to the left of the toggles. Under it, a toggle for the lens
// effects (Renderer.lensEffects), the blur and drops: off gives a clear view
// to edit in.
@register('x-position-readout')
export class PositionReadout extends Component<Props> {
  init() {
    const [shown, setShown] = this.useState(readFlag(STORAGE_KEY, false));
    const [weather, setWeather] = this.useState(readFlag(WEATHER_KEY, true));

    const position = new Vector3();
    const lakeSpace = new Float64Array(2);
    const lakeWorld = new Float64Array(2);
    const biomes = new Int32Array(4);
    const weights = new Float64Array(4);

    let climateKey = '';
    let climate: ClimateConfig | null = null;
    let field: ClimateField | null = null;
    let lakes: Lake[] = [];
    let lakeQueryX = NaN;
    let lakeQueryZ = NaN;
    let timer: number | null = null;

    const xValue = (<span class="value" />) as HTMLSpanElement;
    const yValue = (<span class="value" />) as HTMLSpanElement;
    const zValue = (<span class="value" />) as HTMLSpanElement;
    const groundValue = (<span class="value" />) as HTMLSpanElement;
    const biomeValue = (<span class="value" />) as HTMLSpanElement;
    const lakeValue = (<span class="value" />) as HTMLSpanElement;
    const weatherValue = (<span class="value" />) as HTMLSpanElement;
    const nextValue = (<span class="value" />) as HTMLSpanElement;

    const refresh = () => {
      const renderer = this.props.renderer;
      const terrain = renderer.terrainRenderer;
      renderer.camera.camera.transform.getWorldPosition(position);
      xValue.textContent = position.x.toFixed(1);
      yValue.textContent = position.y.toFixed(1);
      zValue.textContent = position.z.toFixed(1);

      const forecast = describeWeather(renderer);
      weatherValue.textContent = forecast.now;
      nextValue.textContent = forecast.next;

      const ground = terrain.sampleHeight(position.x, position.z);
      groundValue.textContent =
        ground === null ? '—' : `${ground.toFixed(1)} m`;

      const key = `${terrain.seed}|${terrain.climatePreset}|${terrain.seaLevel}`;
      if (key !== climateKey) {
        climateKey = key;
        climate = resolveClimatePreset(terrain.climatePreset);
        field = createClimateField(
          0,
          0,
          terrain.seed,
          new Vector2(0, 0),
          climate
        );
        lakeQueryX = NaN;
      }
      if (!climate || !field) return;

      worldToLakeSpace(position.x, position.z, lakeSpace);
      const count = resolveBiomeWeights(
        field,
        lakeSpace[0],
        lakeSpace[1],
        biomes,
        weights
      );
      const parts: string[] = [];
      for (let i = 0; i < count; i++)
        parts.push(
          count === 1
            ? labelForBiome(climate.biomes[biomes[i]].name)
            : `${labelForBiome(climate.biomes[biomes[i]].name)} ${Math.round(
                weights[i] * 100
              )}%`
        );
      biomeValue.textContent = parts.join(' · ');

      const under = waterUnder(renderer, position.x, position.z, ground);
      if (under) {
        lakeValue.textContent = under;
        return;
      }
      const painted = nearestPainted(renderer, position.x, position.z);
      if (!climate.lakes) {
        lakeValue.textContent = painted
          ? describePainted(painted)
          : 'None in this climate';
        return;
      }
      if (
        Number.isNaN(lakeQueryX) ||
        Math.hypot(position.x - lakeQueryX, position.z - lakeQueryZ) >
          LAKE_REFRESH_METRES
      ) {
        lakeQueryX = position.x;
        lakeQueryZ = position.z;
        const lo = new Float64Array(2);
        const hi = new Float64Array(2);
        worldToLakeSpace(
          position.x - LAKE_SEARCH_METRES,
          position.z + LAKE_SEARCH_METRES,
          lo
        );
        worldToLakeSpace(
          position.x + LAKE_SEARCH_METRES,
          position.z - LAKE_SEARCH_METRES,
          hi
        );
        lakes = findLakes(
          terrain.seed,
          climate,
          terrain.seaLevel,
          lo[0],
          lo[1],
          hi[0],
          hi[1]
        );
      }

      let nearest: Lake | null = null;
      let nearestDistance = Infinity;
      for (const lake of lakes) {
        lakeSpaceToWorld(lake.u, lake.v, lakeWorld);
        const d = Math.hypot(
          lakeWorld[0] - position.x,
          lakeWorld[1] - position.z
        );
        if (d < nearestDistance) {
          nearestDistance = d;
          nearest = lake;
        }
      }
      if (painted && painted.distance < nearestDistance) {
        lakeValue.textContent = describePainted(painted);
        return;
      }
      if (!nearest) {
        lakeValue.textContent = `None within ${formatDistance(
          LAKE_SEARCH_METRES
        )}`;
        return;
      }
      lakeSpaceToWorld(nearest.u, nearest.v, lakeWorld);
      lakeValue.textContent =
        `${
          nearest.lagoon ? 'Lagoon' : nearest.tarn ? 'Tarn' : 'Lake'
        } ${formatDistance(nearestDistance)} away · ` +
        `(${Math.round(lakeWorld[0])}, ${Math.round(
          lakeWorld[1]
        )}) · level ${nearest.level.toFixed(0)} m`;
    };

    const start = () => {
      if (timer !== null) return;
      refresh();
      timer = window.setInterval(refresh, REFRESH_MS);
    };

    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };

    const toggle = (
      <Button
        variant="ghost"
        onClick={() => {
          const next = !shown();
          writeFlag(STORAGE_KEY, next);
          setShown(next);
        }}>
        <StyledIcon icon="map-pin" size="s" />
      </Button>
    ) as unknown as Button;

    const weatherToggle = (
      <Button
        variant="ghost"
        onClick={() => {
          const next = !weather();
          writeFlag(WEATHER_KEY, next);
          setWeather(next);
        }}>
        <StyledIcon icon="cloud-rain-wind" size="s" />
      </Button>
    ) as unknown as Button;
    (weatherToggle as unknown as HTMLElement).title =
      'Lens effects: blur and drops';

    const panel = (
      <div class="panel">
        <div class="row">
          <span class="label">X</span>
          {xValue}
        </div>
        <div class="row">
          <span class="label">Y</span>
          {yValue}
        </div>
        <div class="row">
          <span class="label">Z</span>
          {zValue}
        </div>
        <div class="row">
          <span class="label">Ground</span>
          {groundValue}
        </div>
        <div class="row">
          <span class="label">Biome</span>
          {biomeValue}
        </div>
        <div class="row">
          <span class="label">Lake</span>
          {lakeValue}
        </div>
        <div class="row">
          <span class="label">Weather</span>
          {weatherValue}
        </div>
        <div class="row">
          <span class="label">Next</span>
          {nextValue}
        </div>
      </div>
    ) as HTMLDivElement;

    const elm = (
      <div class="readout">
        {panel}
        <div class="toggles">
          <div class="toggle">{toggle}</div>
          <div class="toggle">{weatherToggle}</div>
        </div>
      </div>
    );

    this.onMount = () => {
      this.props.renderer.lensEffects = weather();
      if (shown()) start();
    };
    // The game shares the renderer, so leaving the editor gives the lens
    // effects back.
    this.onCleanup = () => {
      stop();
      this.props.renderer.lensEffects = true;
    };

    return () => {
      toggle.selected = shown();
      weatherToggle.selected = weather();
      this.props.renderer.lensEffects = weather();
      panel.hidden = !shown();
      if (shown() && this.isConnected) start();
      else stop();
      return elm;
    };
  }

  getStyle() {
    return StyledPositionReadout;
  }
}

const StyledPositionReadout = cssStylesheet(css`
  :host {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 5;
    display: block;
  }

  .readout {
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .toggles {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .toggle,
  .panel {
    background: ${theme.colors.surface};
    border: 1px solid ${theme.colors.onSurfaceBorder};
    border-radius: 5px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }

  .toggle {
    display: flex;
  }

  .panel {
    color: ${theme.colors.onSurface};
    padding: 0.5rem 0.6rem;
    min-width: 200px;
    max-width: 360px;
    font-size: 0.8rem;
  }

  .panel[hidden] {
    display: none;
  }

  .row {
    display: flex;
    gap: 0.5rem;
    line-height: 1.5;
  }

  .label {
    flex: 0 0 4rem;
    opacity: 0.7;
  }

  .value {
    font-variant-numeric: tabular-nums;
  }
`);
