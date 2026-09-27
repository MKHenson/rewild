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
  findLakes,
  lakeSpaceToWorld,
  worldToLakeSpace,
} from 'rewild-renderer/lib/renderers/terrain/Lakes';

interface Props {
  renderer: Renderer;
}

const STORAGE_KEY = 'rewild.editor.positionReadout';
const REFRESH_MS = 200;
// Lakes are searched this far around the camera, and searched again once the
// camera has moved a share of it.
const LAKE_SEARCH_METRES = 4000;
const LAKE_REFRESH_METRES = 500;

function readShown(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeShown(shown: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, shown ? '1' : '0');
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

function formatDistance(metres: number): string {
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`;
}

// A toggle in the viewport's top right: the camera's world position, the
// climate biomes under it, the ground height and the nearest lake.
@register('x-position-readout')
export class PositionReadout extends Component<Props> {
  init() {
    const [shown, setShown] = this.useState(readShown());

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

    const refresh = () => {
      const renderer = this.props.renderer;
      const terrain = renderer.terrainRenderer;
      renderer.camera.camera.transform.getWorldPosition(position);
      xValue.textContent = position.x.toFixed(1);
      yValue.textContent = position.y.toFixed(1);
      zValue.textContent = position.z.toFixed(1);

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

      if (!climate.lakes) {
        lakeValue.textContent = 'None in this climate';
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
      if (!nearest) {
        lakeValue.textContent = `None within ${formatDistance(
          LAKE_SEARCH_METRES
        )}`;
        return;
      }
      lakeSpaceToWorld(nearest.u, nearest.v, lakeWorld);
      lakeValue.textContent =
        `${nearest.tarn ? 'Tarn' : 'Lake'} ${formatDistance(
          nearestDistance
        )} away · ` +
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
          writeShown(next);
          setShown(next);
        }}>
        <StyledIcon icon="map-pin" size="s" />
      </Button>
    ) as unknown as Button;

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
      </div>
    ) as HTMLDivElement;

    const elm = (
      <div class="readout">
        <div class="toggle">{toggle}</div>
        {panel}
      </div>
    );

    this.onMount = () => {
      if (shown()) start();
    };
    this.onCleanup = stop;

    return () => {
      toggle.selected = shown();
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
    flex-direction: column;
    align-items: flex-end;
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
    max-width: 320px;
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
    flex: 0 0 3.5rem;
    opacity: 0.7;
  }

  .value {
    font-variant-numeric: tabular-nums;
  }
`);
