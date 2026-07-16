import {
  Component,
  register,
  theme,
  Typography,
  StyledMaterialIcon,
  IconType,
  Slider,
  Button,
  ButtonGroup,
} from 'rewild-ui';
import type { SculptBrushType } from 'rewild-renderer';
import {
  sculptStore,
  SCULPT_RADIUS_MIN,
  SCULPT_RADIUS_MAX,
} from 'src/ui/stores/SculptStore';

interface Props {}

const BRUSHES: Array<{
  type: SculptBrushType;
  icon: IconType;
  label: string;
}> = [
  { type: 'raise', icon: 'arrow_upward', label: 'Raise' },
  { type: 'lower', icon: 'arrow_downward', label: 'Lower' },
  { type: 'smooth', icon: 'blur_on', label: 'Smooth' },
  { type: 'flatten', icon: 'horizontal_rule', label: 'Flatten' },
];

// Floating brush controls shown over the viewport while sculpt mode is
// active (issue #175): brush selector plus radius/strength sliders.
// Shift inverts raise/lower during a stroke.
@register('x-sculpt-toolbar')
export class SculptToolbar extends Component<Props> {
  init() {
    this.on(sculptStore.dispatcher, () => this.render());

    // The DOM is built once and mutated below. Returning a fresh tree would
    // replace the sliders on every store change, which cancels an in-progress
    // drag along with its pointer capture.
    const brushButtons = BRUSHES.map(
      (brush) =>
        (
          <Button
            variant="ghost"
            selected={sculptStore.brush === brush.type}
            onClick={() => sculptStore.setBrush(brush.type)}>
            <StyledMaterialIcon icon={brush.icon} size="s" />
            <span>{brush.label}</span>
          </Button>
        ) as unknown as Button
    );

    const radiusSlider = (
      <Slider
        min={SCULPT_RADIUS_MIN}
        max={SCULPT_RADIUS_MAX}
        step={1}
        value={sculptStore.radius}
        onChange={(value: number) => sculptStore.setRadius(value)}
      />
    ) as unknown as Slider;

    const strengthSlider = (
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={sculptStore.strength}
        onChange={(value: number) => sculptStore.setStrength(value)}
      />
    ) as unknown as Slider;

    const radiusValue = (<span class="value" />) as HTMLSpanElement;
    const strengthValue = (<span class="value" />) as HTMLSpanElement;

    const elm = (
      <div class="panel">
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
          Drag to sculpt · Shift inverts raise/lower · Alt-drag or right-drag
          moves the camera · Esc exits
        </Typography>
      </div>
    );

    return () => {
      for (let i = 0, l = brushButtons.length; i < l; i++) {
        brushButtons[i].selected = sculptStore.brush === BRUSHES[i].type;
      }

      // The value accessor paints straight onto the existing DOM, so a sculpt
      // drag does not push a render cycle through the sliders on every move.
      radiusSlider.value = sculptStore.radius;
      strengthSlider.value = sculptStore.strength;

      radiusValue.textContent = `${sculptStore.radius}m`;
      strengthValue.textContent = `${Math.round(sculptStore.strength * 100)}%`;

      return elm;
    };
  }

  getStyle() {
    return StyledSculptToolbar;
  }
}

const StyledSculptToolbar = cssStylesheet(css`
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

  .brushes {
    margin-bottom: 0.5rem;
  }

  /* The buttons live in this component's shadow tree, so they are styled
     directly here — outer rules win over the Button's own :host defaults.
     Icon-over-label needs a column box in place of the default inline chrome. */
  .brushes x-button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
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
