import { printTree, UINode, UISurface, UISurfaceOptions } from 'rewild-gpu-ui';
import { Hud, HUD_CALM_OPACITY, HUD_HUNGER_CALM } from './Hud';

function setup() {
  let surface: UISurface | null = null;
  const hud = new Hud({
    createSurface(options: UISurfaceOptions) {
      surface = new UISurface(options);
      return surface;
    },
  });
  const find = (name: string) => {
    const search = (node: UINode): UINode | null => {
      if (node.name === name) return node;
      for (const child of node.children) {
        const hit = search(child);
        if (hit) return hit;
      }
      return null;
    };
    return search(surface!.root)!;
  };
  return { hud, surface: surface!, find };
}

describe('Hud', () => {
  it('takes no input', () => {
    const { surface } = setup();
    expect(surface.input).toBe('none');
  });

  it('shows only health and hunger while all is well, on a dimmed plate', () => {
    const { find } = setup();
    expect(find('health-row').style.display).not.toBe('none');
    expect(find('hunger-row').style.display).not.toBe('none');
    expect(find('stamina-row').style.display).toBe('none');
    expect(find('oxygen-row').style.display).toBe('none');
    expect(find('plate').style.opacity).toBe(HUD_CALM_OPACITY);
  });

  it('brightens the plate once hunger falls', () => {
    const { hud, find } = setup();
    hud.hungerValue = HUD_HUNGER_CALM - 0.01;
    hud.update(1 / 60);
    expect(find('plate').style.opacity).toBe(1);
  });

  it('shows stamina and oxygen below full', () => {
    const { hud, find } = setup();
    hud.staminaValue = 0.9;
    hud.oxygenValue = 0.5;
    hud.update(1 / 60);
    expect(find('stamina-row').style.display).toBe('flex');
    expect(find('oxygen-row').style.display).toBe('flex');
  });

  it('brightens the plate while health is down or trailing', () => {
    const { hud, find } = setup();
    hud.healthValue = 0.5;
    hud.update(1 / 60);
    expect(find('plate').style.opacity).toBe(1);
    for (let i = 0; i < 240; i++) hud.update(1 / 60);
    hud.healthValue = 1;
    hud.update(1 / 60);
    expect(find('plate').style.opacity).toBe(1);
    for (let i = 0; i < 240; i++) hud.update(1 / 60);
    expect(find('plate').style.opacity).toBe(HUD_CALM_OPACITY);
  });

  it('shows the temperature gauge only away from normal', () => {
    const { hud, find } = setup();
    expect(find('temperature-plate').style.opacity).toBe(0);
    hud.temperature = -0.5;
    hud.update(1 / 60);
    expect(find('temperature-plate').style.opacity).toBe(1);
    hud.temperature = 0;
    hud.update(1 / 60);
    expect(find('temperature-plate').style.opacity).toBe(0);
  });

  it('refills every bar with no trail on reset', () => {
    const { hud, find, surface } = setup();
    hud.healthValue = 0.1;
    hud.hungerValue = 0.1;
    hud.reset();
    expect(find('plate').style.opacity).toBe(HUD_CALM_OPACITY);
    expect(printTree(surface)).toContain('#health');
  });
});
