import 'rewild-ui/compiler/jsx';
import { Select, Slider } from 'rewild-ui';
import { getScatterLayerOrder } from 'rewild-renderer/lib/renderers/terrain/ScatterLayers';
import { ScatterPaintToolbar } from './ScatterPaintToolbar';
import { scatterPaintStore } from '../../../stores/ScatterPaintStore';

const LAYERS = getScatterLayerOrder();

function createToolbar(): ScatterPaintToolbar {
  scatterPaintStore.brush = 'paint';
  scatterPaintStore.layer = 0;
  scatterPaintStore.radius = 50;
  scatterPaintStore.strength = 0.5;

  const comp = new ScatterPaintToolbar();
  comp._createRenderer();
  comp.render();
  return comp;
}

function getSliders(comp: ScatterPaintToolbar): Slider[] {
  return Array.from(
    comp.shadow?.querySelectorAll('x-slider') || []
  ) as Slider[];
}

function getLayerSelect(comp: ScatterPaintToolbar): Select {
  return comp.shadow?.querySelector('x-select') as Select;
}

function getBrushButtons(comp: ScatterPaintToolbar): Element[] {
  return Array.from(comp.shadow?.querySelectorAll('x-button') || []);
}

describe('ScatterPaintToolbar', () => {
  // The palette is the whole library, not a climate's subset: every layer is
  // paintable anywhere. A dropdown rather than a button grid, because the list
  // grows with the game's content while the floating panel must not.
  it('offers every layer in the scatter library as a dropdown option', () => {
    const comp = createToolbar();
    expect(getLayerSelect(comp).props.options.length).toBe(LAYERS.length);
  });

  it('labels a snake_cased layer id in title case', () => {
    const comp = createToolbar();
    const labels = getLayerSelect(comp).props.options.map((o) => o.label);
    expect(labels).toContain('Granite Boulder');
  });

  it('shows the selected layer, and stores the slot its option names', () => {
    const comp = createToolbar();
    scatterPaintStore.setLayer(1);
    expect(getLayerSelect(comp).value).toBe(LAYERS[1]);

    getLayerSelect(comp).props.onChange?.(LAYERS[2]);
    expect(scatterPaintStore.layer).toBe(2);
  });

  it('offers paint, erase and exclude', () => {
    const comp = createToolbar();
    const labels = getBrushButtons(comp).map((b) => b.textContent);
    expect(labels.length).toBe(3);
    expect(labels.some((l) => l?.includes('Paint'))).toBe(true);
    expect(labels.some((l) => l?.includes('Erase'))).toBe(true);
    expect(labels.some((l) => l?.includes('Exclude'))).toBe(true);
  });

  it('marks the active brush as the selected brush button', () => {
    const comp = createToolbar();
    scatterPaintStore.setBrush('erase');

    const active = getBrushButtons(comp).filter((b) =>
      b.hasAttribute('selected')
    );
    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('Erase');
  });

  // Exclude paints its own channel, so a picker that still looked live would
  // suggest it does something the stroke ignores.
  it('dims the layer picker while the exclusion brush is armed', () => {
    const comp = createToolbar();
    const row = () => comp.shadow?.querySelector('.field');

    scatterPaintStore.setBrush('exclude');
    expect(row()?.classList.contains('inactive')).toBe(true);

    scatterPaintStore.setBrush('paint');
    expect(row()?.classList.contains('inactive')).toBe(false);
  });

  it('renders a slider for radius and strength', () => {
    const comp = createToolbar();
    expect(getSliders(comp).length).toBe(2);
  });

  it('shows the current values as text', () => {
    const comp = createToolbar();
    scatterPaintStore.setRadius(120);
    scatterPaintStore.setStrength(0.25);

    const values = comp.shadow?.querySelectorAll('.value');
    expect(values?.[0].textContent).toBe('120m');
    expect(values?.[1].textContent).toBe('25%');
  });

  // A rebuilt tree would swap the slider mid-drag and cancel its pointer
  // capture, which left the thumb undraggable.
  it('keeps the same slider and select elements across re-renders', () => {
    const comp = createToolbar();
    const before = getSliders(comp);
    const beforeSelect = getLayerSelect(comp);

    scatterPaintStore.setRadius(120);
    scatterPaintStore.setLayer(1);
    scatterPaintStore.setStrength(0.8);

    const after = getSliders(comp);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(getLayerSelect(comp)).toBe(beforeSelect);
  });
});
