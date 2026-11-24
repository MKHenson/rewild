import { UIInput } from './UIInput';
import { LOOK_POINTER_ID, UILookPointer } from './UILookPointer';
import { UINode } from './UINode';
import { UISurface, UISurfaceOptions } from './UISurface';

const EYE = { x: 0, y: 0, z: 0 };
const FORWARD = { x: 0, y: 0, z: -1 };
const LEFT = { x: -1, y: 0, z: 0 };

/**
 * A world panel of 0.4 by 0.2 m, 2 m in front of the eye, with a focusable
 * button in its middle and a label at its top.
 */
function setup() {
  const surfaces: UISurface[] = [];
  const panel = new UISurface({
    kind: 'world',
    name: 'panel',
    size: { width: 0.4, height: 0.2 },
  });
  panel.worldMatrix.makeTranslation(0, 0, -2);
  const label = new UINode({
    style: { position: 'absolute', left: 0, top: 0, width: 400, height: 40 },
  });
  const button = new UINode({
    style: {
      position: 'absolute',
      left: 100,
      top: 50,
      width: 200,
      height: 100,
      focusable: true,
    },
  });
  panel.root.append(label, button);
  panel.update(panel.layoutWidth, panel.layoutHeight);
  surfaces.push(panel);
  const input = new UIInput({ surfaces });
  const look = new UILookPointer({
    input,
    createSurface: (options: UISurfaceOptions) => {
      const surface = new UISurface(options);
      surfaces.push(surface);
      return surface;
    },
  });
  const clicks: string[] = [];
  button.on('click', () => clicks.push('button'));
  return { input, look, button, clicks };
}

describe('UILookPointer', () => {
  it('shows the crosshair only while the ray points at a focusable node', () => {
    const { look, button } = setup();
    expect(look.surface.input).toBe('none');
    look.aim(EYE, FORWARD);
    expect(look.target).toBe(button);
    expect(look.crosshair.style.opacity).toBe(1);
    // The label at the top of the panel takes no focus.
    look.aim({ x: 0, y: 0.09, z: 0 }, FORWARD);
    expect(look.target).toBeNull();
    expect(look.crosshair.style.opacity).toBe(0);
  });

  it('hides the crosshair past reach and when the scene blocks the ray', () => {
    const { look } = setup();
    look.reach = 1.5;
    look.aim(EYE, FORWARD);
    expect(look.target).toBeNull();
    look.reach = 3;
    look.aim(EYE, FORWARD, 1);
    expect(look.target).toBeNull();
    expect(look.crosshair.style.opacity).toBe(0);
  });

  it('clicks the node under the crosshair when the last source lets go', () => {
    const { look, clicks } = setup();
    look.aim(EYE, FORWARD);
    expect(look.press('mouse')).toBe(true);
    expect(look.press('key')).toBe(true);
    look.release('mouse');
    expect(clicks).toEqual([]);
    look.release('key');
    expect(clicks).toEqual(['button']);
  });

  it('leaves a press to the game when no node is under the crosshair', () => {
    const { look, clicks } = setup();
    look.aim(EYE, LEFT);
    expect(look.press('pad')).toBe(false);
    look.release('pad');
    expect(look.pressed).toBe(false);
    expect(clicks).toEqual([]);
  });

  it('keeps the crosshair while a press holds, and clicks nothing off the node', () => {
    const { look, clicks } = setup();
    look.aim(EYE, FORWARD);
    look.press('mouse');
    look.aim(EYE, LEFT);
    expect(look.crosshair.style.opacity).toBe(1);
    look.release('mouse');
    expect(clicks).toEqual([]);
  });

  it('stops with no click, and ends the hover', () => {
    const { input, look, clicks } = setup();
    look.aim(EYE, FORWARD);
    look.press('mouse');
    look.stop();
    look.release('mouse');
    expect(clicks).toEqual([]);
    expect(input.pointerTarget(LOOK_POINTER_ID)).toBeNull();
    expect(look.target).toBeNull();
    expect(look.crosshair.style.opacity).toBe(0);
  });
});
