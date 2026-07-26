import {
  Component,
  register,
  theme,
  Typography,
  StyledIcon,
  Slider,
  Button,
  ButtonGroup,
} from 'rewild-ui';
import type { PaintBrushType } from 'rewild-renderer';
// Deep import: the biome tables only, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import {
  DEFAULT_CLIMATE_PRESET,
  resolveClimatePreset,
} from 'rewild-renderer/lib/renderers/terrain/Biomes';
import { projectStore } from 'src/ui/stores/ProjectStore';
import {
  biomePaintStore,
  BIOME_PAINT_RADIUS_MIN,
  BIOME_PAINT_RADIUS_MAX,
} from 'src/ui/stores/BiomePaintStore';

interface Props {}

const BRUSHES: Array<{ type: PaintBrushType; label: string }> = [
  { type: 'paint', label: 'Paint' },
  { type: 'erase', label: 'Erase' },
];

// A biome's name as a label: the table stores kebab ids ('desert-mountain').
function labelForBiome(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Floating brush controls shown over the viewport while biome paint mode is
// active: biome picker, paint/erase, radius and strength.
//
// The biome list is read from the project's *active climate preset* rather than
// from a global biome table, because that is exactly the set a chunk's splat map
// can address — the palette holds the materials of the climate's own biomes and
// nothing else. Change the preset in terrain settings and this list changes with
// it (a preset change already invalidates every chunk, masks included).
@register('x-biome-paint-toolbar')
export class BiomePaintToolbar extends Component<Props> {
  init() {
    this.on(biomePaintStore.dispatcher, () => this.render());
    this.on(projectStore.dispatcher, () => this.render());

    // The DOM is built once and mutated below. Returning a fresh tree would
    // replace the sliders on every store change, which cancels an in-progress
    // drag along with its pointer capture.
    const brushButtons = BRUSHES.map(
      (brush) =>
        (
          <Button
            variant="ghost"
            selected={biomePaintStore.brush === brush.type}
            onClick={() => biomePaintStore.setBrush(brush.type)}>
            <span>{brush.label}</span>
          </Button>
        ) as unknown as Button
    );

    const radiusSlider = (
      <Slider
        min={BIOME_PAINT_RADIUS_MIN}
        max={BIOME_PAINT_RADIUS_MAX}
        step={5}
        value={biomePaintStore.radius}
        onChange={(value: number) => biomePaintStore.setRadius(value)}
      />
    ) as unknown as Slider;

    const strengthSlider = (
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={biomePaintStore.strength}
        onChange={(value: number) => biomePaintStore.setStrength(value)}
      />
    ) as unknown as Slider;

    const radiusValue = (<span class="value" />) as HTMLSpanElement;
    const strengthValue = (<span class="value" />) as HTMLSpanElement;
    const biomeList = (<div class="biomes" />) as HTMLDivElement;

    // Which preset the buttons currently reflect, so the list is only rebuilt
    // when the preset actually changes rather than on every store event.
    let renderedPreset: string | null = null;

    const elm = (
      <div class="panel">
        {biomeList}
        <ButtonGroup class="brushes" fullWidth>
          {brushButtons}
        </ButtonGroup>
        <div class="slider-row">
          <Typography variant="label">Radius</Typography>
          {radiusSlider}
          {radiusValue}
        </div>
        <div class="slider-row">
          <Typography variant="label">Strength</Typography>
          {strengthSlider}
          {strengthValue}
        </div>
        <Typography variant="light">
          Drag to paint · Shift erases · Alt-drag or right-drag moves the camera
          · Esc exits
        </Typography>
      </div>
    );

    return () => {
      const preset =
        projectStore.project?.sceneGraph?.terrain?.climatePreset ??
        DEFAULT_CLIMATE_PRESET;
      const biomes = resolveClimatePreset(preset).biomes;

      // A preset with fewer biomes than the last one can leave the selection
      // pointing past the end — a channel applyPaintStamp would reject. Show
      // the clamped value now and correct the store *after* this render pass:
      // setBiome dispatches, and dispatching mid-render re-enters render().
      const selected = Math.min(biomePaintStore.biome, biomes.length - 1);
      if (selected !== biomePaintStore.biome) {
        queueMicrotask(() => biomePaintStore.setBiome(selected));
      }

      if (renderedPreset !== preset) {
        renderedPreset = preset;
        biomeList.replaceChildren(
          ...biomes.map((biome, index) => {
            const button = (
              <Button
                variant="ghost"
                selected={selected === index}
                onClick={() => biomePaintStore.setBiome(index)}>
                <StyledIcon icon="mountain-snow" size="s" />
                <span>{labelForBiome(biome.name)}</span>
              </Button>
            ) as unknown as Button;
            return button as unknown as HTMLElement;
          })
        );
      } else {
        const buttons = biomeList.children;
        for (let i = 0; i < buttons.length; i++) {
          (buttons[i] as unknown as Button).selected = selected === i;
        }
      }

      for (let i = 0, l = brushButtons.length; i < l; i++) {
        brushButtons[i].selected = biomePaintStore.brush === BRUSHES[i].type;
      }

      // The value accessor paints straight onto the existing DOM, so a paint
      // drag does not push a render cycle through the sliders on every move.
      radiusSlider.value = biomePaintStore.radius;
      strengthSlider.value = biomePaintStore.strength;

      radiusValue.textContent = `${biomePaintStore.radius}m`;
      strengthValue.textContent = `${Math.round(
        biomePaintStore.strength * 100
      )}%`;

      return elm;
    };
  }

  getStyle() {
    return StyledBiomePaintToolbar;
  }
}

const StyledBiomePaintToolbar = cssStylesheet(css`
  :host {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 5;
    display: block;
  }

  .panel {
    background: ${theme.colors.surface};
    color: ${theme.colors.onSurface};
    border: 1px solid ${theme.colors.onSurfaceBorder};
    border-radius: 5px;
    padding: 0.6rem;
    min-width: 240px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }

  /* Biomes wrap rather than sharing one row: a climate can carry more of them
     than fit across the panel, and a squeezed 5-across row is unreadable. */
  .biomes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .biomes x-button {
    flex: 1 1 30%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 0.35rem 0.2rem;
    font-size: 0.65rem;
    text-transform: none;
  }

  .brushes {
    margin-bottom: 0.5rem;
  }

  .brushes x-button {
    flex: 1;
    padding: 0.35rem 0.2rem;
    font-size: 0.65rem;
    text-transform: none;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }

  .slider-row x-typography {
    width: 62px;
    flex-shrink: 0;
  }

  .slider-row x-slider {
    flex: 1;
  }

  .slider-row .value {
    width: 42px;
    text-align: right;
    font-size: 0.75rem;
    color: ${theme.colors.onSubtle};
  }
`);
