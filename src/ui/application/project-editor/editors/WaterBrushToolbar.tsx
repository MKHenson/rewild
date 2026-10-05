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
// Deep import: the palette names only, not the renderer's root index (which
// drags in WGSL assets that plain ts tooling/jest cannot load).
import {
  LAKE_WATER,
  OCEAN_WATER,
} from 'rewild-renderer/lib/renderers/terrain/Water';
import {
  waterBrushStore,
  WaterBrushType,
  WATER_BRUSH_RADIUS_MIN,
  WATER_BRUSH_RADIUS_MAX,
  WATER_BRUSH_DEPTH_MIN,
  WATER_BRUSH_DEPTH_MAX,
} from 'src/ui/stores/WaterBrushStore';

interface Props {}

const BRUSHES: Array<{
  type: WaterBrushType;
  icon: IconType;
  label: string;
}> = [
  { type: 'level', icon: 'move-vertical', label: 'Level' },
  { type: 'type', icon: 'palette', label: 'Type' },
  { type: 'add', icon: 'droplet', label: 'Add' },
  { type: 'remove', icon: 'eraser', label: 'Remove' },
];

const WATER_TYPES = [
  { value: LAKE_WATER, label: 'Lake' },
  { value: OCEAN_WATER, label: 'Ocean' },
];

const HINTS: Record<WaterBrushType, string> = {
  level:
    'Click a lake, then drag up or down to set its level · Strength sets the speed · It stops at the spill height',
  type: 'Drag to paint the water type over the water there',
  add: 'Drag to add water and dig its bed · On a lake it joins it, on dry land it makes a new one at the ground · It stops at other water · Shift removes',
  remove:
    'Drag to hand the water and the ground back to the generated world · Shift adds',
};

// Floating brush controls shown over the viewport while the water brush is
// active: brush selector, water type, radius, strength and depth, and what the
// brush last reported.
@register('x-water-brush-toolbar')
export class WaterBrushToolbar extends Component<Props> {
  init() {
    this.on(waterBrushStore.dispatcher, () => this.render());

    // The DOM is built once and mutated below. Returning a fresh tree would
    // replace the sliders on every store change, which cancels an in-progress
    // drag along with its pointer capture.
    const typeSelect = (
      <Select
        value={waterBrushStore.waterType}
        options={WATER_TYPES}
        onChange={(value: string) => waterBrushStore.setWaterType(value)}
      />
    ) as unknown as Select;

    const brushButtons = BRUSHES.map(
      (brush) =>
        (
          <Button
            variant="ghost"
            selected={waterBrushStore.brush === brush.type}
            onClick={() => waterBrushStore.setBrush(brush.type)}>
            <StyledIcon icon={brush.icon} size="s" />
            <span>{brush.label}</span>
          </Button>
        ) as unknown as Button
    );

    const radiusSlider = (
      <Slider
        min={WATER_BRUSH_RADIUS_MIN}
        max={WATER_BRUSH_RADIUS_MAX}
        step={2}
        value={waterBrushStore.radius}
        onChange={(value: number) => waterBrushStore.setRadius(value)}
      />
    ) as unknown as Slider;

    const strengthSlider = (
      <Slider
        min={0.05}
        max={1}
        step={0.05}
        value={waterBrushStore.strength}
        onChange={(value: number) => waterBrushStore.setStrength(value)}
      />
    ) as unknown as Slider;

    const depthSlider = (
      <Slider
        min={WATER_BRUSH_DEPTH_MIN}
        max={WATER_BRUSH_DEPTH_MAX}
        step={0.25}
        value={waterBrushStore.depth}
        onChange={(value: number) => waterBrushStore.setDepth(value)}
      />
    ) as unknown as Slider;

    const radiusValue = (<span class="value" />) as HTMLSpanElement;
    const strengthValue = (<span class="value" />) as HTMLSpanElement;
    const depthValue = (<span class="value" />) as HTMLSpanElement;
    // The classes go on the hosts: Typography puts its own on an element
    // inside its shadow root, where the panel cannot reach it.
    const info = (<Typography variant="label" />) as unknown as HTMLElement;
    info.classList.add('info');
    const hint = (<Typography variant="light" />) as unknown as HTMLElement;
    hint.classList.add('hint');

    const typeRow = (
      <div class="field">
        <Typography variant="label">Type</Typography>
        {typeSelect}
      </div>
    ) as HTMLDivElement;
    const radiusRow = (
      <div class="slider-row">
        <Typography variant="label">Radius</Typography>
        {radiusSlider}
        {radiusValue}
      </div>
    ) as HTMLDivElement;
    const strengthRow = (
      <div class="slider-row">
        <Typography variant="label">Strength</Typography>
        {strengthSlider}
        {strengthValue}
      </div>
    ) as HTMLDivElement;
    const depthRow = (
      <div class="slider-row">
        <Typography variant="label">Depth</Typography>
        {depthSlider}
        {depthValue}
      </div>
    ) as HTMLDivElement;

    const elm = (
      <div class="panel">
        <ButtonGroup class="brushes" fullWidth>
          {brushButtons}
        </ButtonGroup>
        {typeRow}
        {radiusRow}
        {strengthRow}
        {depthRow}
        {info}
        {hint}
      </div>
    );

    return () => {
      // A control the current brush ignores is hidden.
      const brush = waterBrushStore.brush;
      typeRow.classList.toggle('hidden', brush !== 'type');
      radiusRow.classList.toggle('hidden', brush === 'level');
      depthRow.classList.toggle('hidden', brush !== 'add');
      typeSelect.value = waterBrushStore.waterType;

      for (let i = 0, l = brushButtons.length; i < l; i++) {
        brushButtons[i].selected = brush === BRUSHES[i].type;
      }

      radiusSlider.value = waterBrushStore.radius;
      strengthSlider.value = waterBrushStore.strength;
      depthSlider.value = waterBrushStore.depth;
      radiusValue.textContent = `${waterBrushStore.radius}m`;
      strengthValue.textContent = `${Math.round(
        waterBrushStore.strength * 100
      )}%`;
      depthValue.textContent = `${waterBrushStore.depth}m`;

      info.textContent = waterBrushStore.info;
      info.classList.toggle('empty', !waterBrushStore.info);
      hint.textContent = `${HINTS[brush]} · Alt-drag or right-drag moves the camera · Esc exits`;

      return elm;
    };
  }

  getStyle() {
    return StyledWaterBrushToolbar;
  }
}

const StyledWaterBrushToolbar = cssStylesheet(css`
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
    width: 320px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }

  .brushes {
    margin-bottom: 0.5rem;
  }

  .brushes x-button {
    flex: 1;
    padding: 0.35rem 0.1rem;
    font-size: 0.6rem;
    text-transform: none;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .field x-typography,
  .slider-row x-typography {
    width: 62px;
    flex-shrink: 0;
  }

  .field x-select {
    flex: 1;
    min-width: 0;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
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

  .field.hidden,
  .slider-row.hidden {
    display: none;
  }

  .info {
    display: block;
    margin: 0.35rem 0;
  }

  .info.empty {
    display: none;
  }
`);
