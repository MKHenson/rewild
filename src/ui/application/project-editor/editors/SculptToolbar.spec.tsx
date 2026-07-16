import 'rewild-ui/compiler/jsx';
import { Slider } from 'rewild-ui';
import { SculptToolbar } from './SculptToolbar';
import { sculptStore } from '../../../stores/SculptStore';

function createToolbar(): SculptToolbar {
  sculptStore.brush = 'raise';
  sculptStore.radius = 20;
  sculptStore.strength = 0.5;

  const comp = new SculptToolbar();
  comp._createRenderer();
  comp.render();
  return comp;
}

function getSliders(comp: SculptToolbar): Slider[] {
  return Array.from(comp.shadow?.querySelectorAll('x-slider') || []) as Slider[];
}

describe('SculptToolbar', () => {
  it('renders a slider for radius and strength', () => {
    const comp = createToolbar();
    expect(getSliders(comp).length).toBe(2);
  });

  it('pushes the store values onto the sliders', () => {
    const comp = createToolbar();
    sculptStore.setRadius(35);
    sculptStore.setStrength(0.25);

    const [radius, strength] = getSliders(comp);
    expect(radius.props.value).toBe(35);
    expect(strength.props.value).toBe(0.25);
  });

  it('shows the current values as text', () => {
    const comp = createToolbar();
    sculptStore.setRadius(35);
    sculptStore.setStrength(0.25);

    const values = comp.shadow?.querySelectorAll('.value');
    expect(values?.[0].textContent).toBe('35m');
    expect(values?.[1].textContent).toBe('25%');
  });

  it('marks the active brush as the selected button', () => {
    const comp = createToolbar();
    sculptStore.setBrush('smooth');

    const buttons = Array.from(
      comp.shadow?.querySelectorAll('x-button') || []
    );
    const active = buttons.filter((b) => b.hasAttribute('selected'));
    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('Smooth');
    expect(active[0].getAttribute('aria-pressed')).toBe('true');
  });

  // A rebuilt tree would swap the slider mid-drag and cancel its pointer
  // capture, which left the thumb undraggable.
  it('keeps the same slider elements across re-renders', () => {
    const comp = createToolbar();
    const before = getSliders(comp);

    sculptStore.setRadius(35);
    sculptStore.setBrush('lower');
    sculptStore.setStrength(0.8);

    const after = getSliders(comp);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});
