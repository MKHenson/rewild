import {
  Component,
  register,
  theme,
  Typography,
  StyledIcon,
  IconType,
  Slider,
  Select,
  Button,
  ButtonGroup,
} from 'rewild-ui';
// Deep import: the layer table only, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import { getScatterLayerOrder } from 'rewild-renderer/lib/renderers/terrain/ScatterLayers';
import {
  scatterPaintStore,
  ScatterBrushType,
  SCATTER_PAINT_RADIUS_MIN,
  SCATTER_PAINT_RADIUS_MAX,
} from 'src/ui/stores/ScatterPaintStore';

interface Props {}

const BRUSHES: Array<{
  type: ScatterBrushType;
  icon: IconType;
  label: string;
}> = [
  { type: 'paint', icon: 'paintbrush', label: 'Paint' },
  { type: 'erase', icon: 'eraser', label: 'Erase' },
  { type: 'exclude', icon: 'ban', label: 'Exclude' },
  { type: 'pluck', icon: 'scissors', label: 'Pluck' },
];

// Brushes that edit the density field, and so are steered by the layer picker
// and the sliders. Exclude paints its own channel and pluck works on instances.
const USES_LAYER: ScatterBrushType[] = ['paint', 'erase'];
const USES_SLIDERS: ScatterBrushType[] = ['paint', 'erase', 'exclude'];

// A layer's id as a label: the table stores snake ids ('granite_boulder').
function labelForLayer(name: string): string {
  return name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// Floating brush controls shown over the viewport while scatter paint mode is
// active: layer picker, paint/erase/exclude, radius and strength.
@register('x-scatter-paint-toolbar')
export class ScatterPaintToolbar extends Component<Props> {
  init() {
    this.on(scatterPaintStore.dispatcher, () => this.render());

    // The DOM is built once and mutated below. Returning a fresh tree would
    // replace the sliders on every store change, which cancels an in-progress
    // drag along with its pointer capture.
    const layers = getScatterLayerOrder();
    // Keyed by layer name rather than slot so the DOM says which layer is
    // selected; the store keeps the slot, which is the mask channel.
    const layerSelect = (
      <Select
        value={layers[scatterPaintStore.layer]}
        options={layers.map((name) => ({
          value: name,
          label: labelForLayer(name),
        }))}
        onChange={(value: string) =>
          scatterPaintStore.setLayer(layers.indexOf(value))
        }
      />
    ) as unknown as Select;

    const brushButtons = BRUSHES.map(
      (brush) =>
        (
          <Button
            variant="ghost"
            selected={scatterPaintStore.brush === brush.type}
            onClick={() => scatterPaintStore.setBrush(brush.type)}>
            <StyledIcon icon={brush.icon} size="s" />
            <span>{brush.label}</span>
          </Button>
        ) as unknown as Button
    );

    const radiusSlider = (
      <Slider
        min={SCATTER_PAINT_RADIUS_MIN}
        max={SCATTER_PAINT_RADIUS_MAX}
        step={5}
        value={scatterPaintStore.radius}
        onChange={(value: number) => scatterPaintStore.setRadius(value)}
      />
    ) as unknown as Slider;

    const strengthSlider = (
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={scatterPaintStore.strength}
        onChange={(value: number) => scatterPaintStore.setStrength(value)}
      />
    ) as unknown as Slider;

    const radiusValue = (<span class="value" />) as HTMLSpanElement;
    const strengthValue = (<span class="value" />) as HTMLSpanElement;
    // The class goes on the host: Typography puts its own on an element inside
    // its shadow root, where the panel cannot reach it.
    const hint = (<Typography variant="light" />) as unknown as HTMLElement;
    hint.classList.add('hint');
    const layerRow = (
      <div class="field">
        <Typography variant="label">Layer</Typography>
        {layerSelect}
      </div>
    ) as HTMLDivElement;

    const sliderRows = (<div class="sliders" />) as HTMLDivElement;

    const elm = (
      <div class="panel">
        {layerRow}
        <ButtonGroup class="brushes" fullWidth>
          {brushButtons}
        </ButtonGroup>
        {sliderRows}
        {hint}
      </div>
    );

    sliderRows.append(
      (
        <div class="slider-row">
          <Typography variant="label">Radius</Typography>
          {radiusSlider}
          {radiusValue}
        </div>
      ) as HTMLElement,
      (
        <div class="slider-row">
          <Typography variant="label">Strength</Typography>
          {strengthSlider}
          {strengthValue}
        </div>
      ) as HTMLElement
    );

    return () => {
      // A control the current brush ignores is disabled rather than left
      // looking like it still applies: exclude paints its own channel, and
      // pluck takes one instance at a fixed reach with no field to blend. The
      // row class dims the label to match the control.
      const brush = scatterPaintStore.brush;
      const layerOff = !USES_LAYER.includes(brush);
      const slidersOff = !USES_SLIDERS.includes(brush);
      layerRow.classList.toggle('inactive', layerOff);
      sliderRows.classList.toggle('inactive', slidersOff);
      layerSelect.disabled = layerOff;
      radiusSlider.disabled = slidersOff;
      strengthSlider.disabled = slidersOff;
      layerSelect.value = layers[scatterPaintStore.layer];

      hint.textContent =
        brush === 'pluck'
          ? 'Click or drag to remove one instance · Shift puts one back · Alt-drag or right-drag moves the camera · Esc exits'
          : 'Drag to plant · Shift erases · Exclude clears biome-grown scatter · Alt-drag or right-drag moves the camera · Esc exits';

      for (let i = 0, l = brushButtons.length; i < l; i++) {
        brushButtons[i].selected = scatterPaintStore.brush === BRUSHES[i].type;
      }

      // The value accessor paints straight onto the existing DOM, so a paint
      // drag does not push a render cycle through the sliders on every move.
      radiusSlider.value = scatterPaintStore.radius;
      strengthSlider.value = scatterPaintStore.strength;

      radiusValue.textContent = `${scatterPaintStore.radius}m`;
      strengthValue.textContent = `${Math.round(
        scatterPaintStore.strength * 100
      )}%`;

      return elm;
    };
  }

  getStyle() {
    return StyledScatterPaintToolbar;
  }
}

const StyledScatterPaintToolbar = cssStylesheet(css`
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

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .field x-typography {
    width: 62px;
    flex-shrink: 0;
  }

  .field x-select {
    flex: 1;
    min-width: 0;
  }

  /* A control the brush ignores says so rather than going away — a row that
     disappears makes the panel jump between brushes. Only the labels dim here;
     the controls carry their own disabled look. */
  .field.inactive x-typography,
  .sliders.inactive x-typography,
  .sliders.inactive .value {
    opacity: 0.4;
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
