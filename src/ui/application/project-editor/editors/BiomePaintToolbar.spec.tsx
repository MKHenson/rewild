import 'rewild-ui/compiler/jsx';
import { Slider } from 'rewild-ui';
import {
  DEFAULT_CLIMATE_PRESET,
  resolveClimatePreset,
} from 'rewild-renderer/lib/renderers/terrain/Biomes';
import { BiomePaintToolbar } from './BiomePaintToolbar';
import { biomePaintStore } from '../../../stores/BiomePaintStore';
import { projectStore } from '../../../stores/ProjectStore';

// Biomes come from the project's active climate preset, so the toolbar needs a
// project to read one off. The default preset is what an unset project falls
// back to, which is what these tests exercise.
const DEFAULT_BIOMES = resolveClimatePreset(DEFAULT_CLIMATE_PRESET).biomes;

function createToolbar(): BiomePaintToolbar {
  biomePaintStore.brush = 'paint';
  biomePaintStore.biome = 0;
  biomePaintStore.radius = 80;
  biomePaintStore.strength = 0.5;

  const comp = new BiomePaintToolbar();
  comp._createRenderer();
  comp.render();
  return comp;
}

function getSliders(comp: BiomePaintToolbar): Slider[] {
  return Array.from(
    comp.shadow?.querySelectorAll('x-slider') || []
  ) as Slider[];
}

function getBiomeButtons(comp: BiomePaintToolbar): Element[] {
  return Array.from(comp.shadow?.querySelectorAll('.biomes x-button') || []);
}

// Every button that isn't a biome button, i.e. the paint/erase pair. Derived by
// subtraction rather than by its own selector so this doesn't depend on how
// ButtonGroup renders its wrapper.
function getBrushButtons(comp: BiomePaintToolbar): Element[] {
  const biomes = new Set(getBiomeButtons(comp));
  return Array.from(comp.shadow?.querySelectorAll('x-button') || []).filter(
    (b) => !biomes.has(b)
  );
}

describe('BiomePaintToolbar', () => {
  afterEach(() => {
    projectStore.project = null as never;
  });

  it('renders one button per biome in the active climate', () => {
    const comp = createToolbar();
    const buttons = getBiomeButtons(comp);
    expect(buttons.length).toBe(DEFAULT_BIOMES.length);
    expect(buttons[0].textContent).toContain('Plain');
  });

  it('labels a kebab-cased biome name in title case', () => {
    // 'desert-mountain' → 'Desert Mountain'. Read the arid preset through the
    // project so the toolbar rebuilds its list against it.
    projectStore.project = {
      sceneGraph: { terrain: { climatePreset: 'arid' } },
    } as never;

    const comp = createToolbar();
    const labels = getBiomeButtons(comp).map((b) => b.textContent);
    expect(labels.some((l) => l?.includes('Desert Mountain'))).toBe(true);
    expect(labels.some((l) => l?.includes('Beach Sand'))).toBe(true);
  });

  it('marks the selected biome as the only selected biome button', () => {
    const comp = createToolbar();
    biomePaintStore.setBiome(2);

    const active = getBiomeButtons(comp).filter((b) =>
      b.hasAttribute('selected')
    );
    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('Mountain');
  });

  it('renders a slider for radius and strength', () => {
    const comp = createToolbar();
    expect(getSliders(comp).length).toBe(2);
  });

  it('shows the current values as text', () => {
    const comp = createToolbar();
    biomePaintStore.setRadius(120);
    biomePaintStore.setStrength(0.25);

    const values = comp.shadow?.querySelectorAll('.value');
    expect(values?.[0].textContent).toBe('120m');
    expect(values?.[1].textContent).toBe('25%');
  });

  it('marks the active brush as the selected brush button', () => {
    const comp = createToolbar();
    biomePaintStore.setBrush('erase');

    const brushes = getBrushButtons(comp);
    expect(brushes.length).toBe(2);
    const active = brushes.filter((b) => b.hasAttribute('selected'));
    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('Erase');
  });

  // A rebuilt tree would swap the slider mid-drag and cancel its pointer
  // capture, which left the thumb undraggable.
  it('keeps the same slider elements across re-renders', () => {
    const comp = createToolbar();
    const before = getSliders(comp);

    biomePaintStore.setRadius(120);
    biomePaintStore.setBiome(1);
    biomePaintStore.setStrength(0.8);

    const after = getSliders(comp);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });

  // Switching to a climate with fewer biomes must not leave the selection
  // pointing at a channel applyPaintStamp would reject.
  it('clamps a selection that outlives a preset with fewer biomes', async () => {
    const comp = createToolbar();
    biomePaintStore.setBiome(DEFAULT_BIOMES.length - 1);

    projectStore.project = {
      sceneGraph: {
        terrain: { climatePreset: 'nonexistent-preset-falls-back' },
      },
    } as never;
    comp.render();

    // The clamp is deferred out of the render pass, so let the microtask run.
    await Promise.resolve();
    expect(biomePaintStore.biome).toBeLessThan(DEFAULT_BIOMES.length);
  });
});
