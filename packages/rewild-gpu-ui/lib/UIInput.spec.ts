import { UIEventType, UIPointerInit } from './events';
import { UIInput } from './UIInput';
import { UINode } from './UINode';
import { UISurface, UISurfaceOptions } from './UISurface';
import { UIVector3 } from './world';

type Pointer = Pick<UIPointerInit, 'pointerId' | 'pointerType' | 'button'>;

const MOUSE: Pointer = { pointerId: 1, pointerType: 'mouse' };
const TOUCH: Pointer = { pointerId: 7, pointerType: 'touch' };

function at(x: number, y: number, init = MOUSE): UIPointerInit {
  return { ...init, x, y };
}

function box(left: number, top: number, size: number): UINode {
  return new UINode({
    style: { position: 'absolute', left, top, width: size, height: size },
  });
}

const TYPES: UIEventType[] = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointercancel',
  'pointerenter',
  'pointerleave',
  'click',
  'wheel',
  'keydown',
  'keyup',
];

/** Logs each event that reaches the node, as `name type`. */
function record(log: string[], name: string, node: UINode): void {
  for (const type of TYPES)
    node.on(type, (e) => {
      if (e.currentTarget === e.target) log.push(`${name} ${type}`);
    });
}

/**
 * A menu surface over a HUD surface. The menu has a panel at 0..100 with a
 * button at 10..40. The HUD has a bar at 150..190.
 */
function setup(menuInput: UISurfaceOptions['input'] = 'nodes') {
  const hud = new UISurface({ kind: 'screen', name: 'hud' });
  const menu = new UISurface({
    kind: 'screen',
    name: 'menu',
    order: 1,
    input: menuInput,
  });
  const bar = box(150, 150, 40);
  hud.root.append(bar);
  const panel = box(0, 0, 100);
  const button = box(10, 10, 30);
  panel.append(button);
  menu.root.append(panel);
  for (const surface of [hud, menu]) surface.update(200, 200);
  const log: string[] = [];
  record(log, 'bar', bar);
  record(log, 'panel', panel);
  record(log, 'button', button);
  record(log, 'menu', menu.root);
  const input = new UIInput({ surfaces: [hud, menu] });
  return { input, hud, menu, bar, panel, button, log };
}

describe('UIInput pointer', () => {
  it('clicks a nested node and the click bubbles to its parent', () => {
    const { input, button, panel } = setup();
    const clicks: UINode[] = [];
    panel.on('click', (e) => clicks.push(e.target!));
    expect(input.pointer('down', at(20, 20))).toBe('taken');
    expect(input.pointer('up', at(20, 20))).toBe('taken');
    expect(clicks).toEqual([button]);
  });

  it('passes a click on nothing to the game', () => {
    const { input, log } = setup();
    expect(input.pointer('down', at(120, 20))).toBe('passed');
    expect(input.pointer('up', at(120, 20))).toBe('passed');
    expect(log).toEqual([]);
  });

  it('takes every point while a surface that takes all input is open', () => {
    const { input, menu, log } = setup('all');
    expect(input.pointer('down', at(120, 20))).toBe('taken');
    expect(log).toContain('menu pointerdown');
    menu.root.style.display = 'none';
    expect(input.pointer('down', at(121, 20))).toBe('passed');
  });

  it('gives a surface that takes no input no events', () => {
    const { input, hud, log } = setup();
    expect(input.pointer('down', at(160, 160))).toBe('taken');
    expect(log).toEqual(['bar pointerenter', 'bar pointerdown']);
    input.pointer('up', at(160, 160));
    hud.input = 'none';
    log.length = 0;
    input.pointer('move', at(161, 160));
    expect(input.pointer('down', at(161, 160))).toBe('passed');
    expect(log).toEqual(['bar pointerleave']);
  });

  it('clicks the nearest node that holds both the down and the up', () => {
    const { input, log } = setup();
    input.pointer('down', at(20, 20));
    input.pointer('up', at(60, 60));
    expect(log).toContain('panel click');
    expect(log).not.toContain('button click');
  });

  it('does not click for a button other than the main one', () => {
    const { input, log } = setup();
    const right = { ...MOUSE, button: 2 };
    input.pointer('down', at(20, 20, right));
    input.pointer('up', at(20, 20, right));
    expect(log.some((line) => line.endsWith('click'))).toBe(false);
  });

  it('enters from the outside in, and leaves from the inside out', () => {
    const { input, log } = setup();
    input.pointer('move', at(20, 20));
    expect(log).toEqual([
      'menu pointerenter',
      'panel pointerenter',
      'button pointerenter',
      'button pointermove',
    ]);
    log.length = 0;
    input.pointer('move', at(150, 20));
    expect(log).toEqual([
      'button pointerleave',
      'panel pointerleave',
      'menu pointerleave',
    ]);
  });

  it('leaves when the pointer goes out of the source', () => {
    const { input, log } = setup();
    input.pointer('move', at(20, 20));
    log.length = 0;
    input.pointerOut(MOUSE.pointerId);
    expect(log).toEqual([
      'button pointerleave',
      'panel pointerleave',
      'menu pointerleave',
    ]);
  });

  it('sends moves and the up to the node that captured the pointer', () => {
    const { input, button, log } = setup();
    button.on('pointerdown', (e) => button.setPointerCapture(e.pointerId));
    input.pointer('down', at(20, 20));
    log.length = 0;
    expect(input.pointer('move', at(180, 20))).toBe('taken');
    expect(input.pointer('up', at(180, 20))).toBe('taken');
    // The up leaves the pointer off the button, so the hover leaves it.
    expect(log.slice(0, 3)).toEqual([
      'button pointermove',
      'button pointerup',
      'button click',
    ]);
    expect(log).toContain('button pointerleave');
    expect(button.hasPointerCapture(MOUSE.pointerId)).toBe(false);
  });

  it('keeps a taken press until it is up, even off every node', () => {
    const { input } = setup();
    input.pointer('down', at(20, 20));
    expect(input.pointer('move', at(150, 20))).toBe('taken');
    expect(input.pointer('up', at(150, 20))).toBe('taken');
    expect(input.pointer('move', at(150, 21))).toBe('passed');
  });

  it('leaves a press of the game to the game, even over a node', () => {
    const { input, log } = setup();
    input.pointer('down', at(150, 20));
    expect(input.pointer('move', at(20, 20))).toBe('passed');
    expect(input.pointer('up', at(20, 20))).toBe('passed');
    expect(log).toEqual([]);
    expect(input.pointer('move', at(20, 21))).toBe('taken');
  });

  it('ends a touch when it lifts', () => {
    const { input, log } = setup();
    input.pointer('down', at(20, 20, TOUCH));
    input.pointer('up', at(20, 20, TOUCH));
    expect(log.slice(-4)).toEqual([
      'button click',
      'button pointerleave',
      'panel pointerleave',
      'menu pointerleave',
    ]);
  });

  it('cancels a press', () => {
    const { input, button, log } = setup();
    button.on('pointerdown', (e) => button.setPointerCapture(e.pointerId));
    input.pointer('down', at(20, 20, TOUCH));
    log.length = 0;
    expect(input.pointer('cancel', at(20, 20, TOUCH))).toBe('taken');
    expect(log[0]).toBe('button pointercancel');
    expect(log).not.toContain('button click');
    expect(button.hasPointerCapture(TOUCH.pointerId)).toBe(false);
  });

  it('reports a prevented default', () => {
    const { input, button } = setup();
    button.on('pointerdown', (e) => e.preventDefault());
    expect(input.pointer('down', at(20, 20))).toBe('prevented');
  });

  it('calls onDispatch for each event', () => {
    const { input } = setup();
    const types: string[] = [];
    input.onDispatch = (e) => types.push(e.type);
    input.pointer('move', at(20, 20));
    expect(types).toEqual([
      'pointerenter',
      'pointerenter',
      'pointerenter',
      'pointermove',
    ]);
  });

  it('gives a world surface no screen points and no focus scope', () => {
    const { input, hud, menu, log } = setup();
    const world = new UISurface({
      kind: 'world',
      name: 'panel',
      order: 2,
      input: 'all',
      size: { width: 0.2, height: 0.2 },
    });
    const node = box(0, 0, 200);
    world.root.append(node);
    world.update(world.layoutWidth, world.layoutHeight);
    record(log, 'world', node);
    const both = new UIInput({ surfaces: [hud, menu, world] });
    expect(both.focusScope()).toBeNull();
    expect(both.pointer('down', at(20, 20))).toBe('taken');
    expect(log).toEqual([
      'menu pointerenter',
      'panel pointerenter',
      'button pointerenter',
      'button pointerdown',
    ]);
    expect(input.pointer('down', at(120, 20))).toBe('passed');
  });
});

describe('UIInput wheel and keys', () => {
  it('sends a wheel to the node under the pointer', () => {
    const { input, button } = setup();
    let delta = 0;
    button.on('wheel', (e) => (delta = e.deltaY));
    expect(input.wheel({ ...at(20, 20), deltaX: 0, deltaY: 48 })).toBe('taken');
    expect(delta).toBe(48);
    expect(input.wheel({ ...at(150, 20), deltaX: 0, deltaY: 48 })).toBe(
      'passed'
    );
  });

  it('sends keys to the root of an open surface that takes all input', () => {
    const nodes = setup('nodes');
    expect(nodes.input.key('down', { key: 'a', code: 'KeyA' })).toBe('passed');
    const all = setup('all');
    expect(all.input.key('down', { key: 'a', code: 'KeyA' })).toBe('taken');
    expect(all.input.key('up', { key: 'a', code: 'KeyA' })).toBe('taken');
    expect(all.log).toEqual(['menu keydown', 'menu keyup']);
    all.menu.root.style.display = 'none';
    expect(all.input.key('down', { key: 'a', code: 'KeyA' })).toBe('passed');
  });
});

describe('UIInput focus', () => {
  /** A menu that takes all input, with three focusable buttons in a row. */
  function menu() {
    const surface = new UISurface({
      kind: 'screen',
      name: 'menu',
      input: 'all',
    });
    const buttons = [0, 50, 100].map((left) => {
      const node = box(left, 0, 40);
      node.style.focusable = true;
      return node;
    });
    surface.root.append(...buttons);
    surface.update(200, 200);
    const input = new UIInput({ surfaces: [surface] });
    const press = (key: string, shiftKey = false) =>
      input.key('down', { key, code: key, shiftKey });
    return { surface, buttons, input, press };
  }

  it('moves focus with the arrow keys and shows the ring', () => {
    const { surface, buttons, press } = menu();
    expect(press('ArrowRight')).toBe('prevented');
    expect(surface.focused).toBe(buttons[0]);
    expect(surface.focusVisible).toBe(true);
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowRight');
    expect(surface.focused).toBe(buttons[2]);
    press('ArrowLeft');
    expect(surface.focused).toBe(buttons[1]);
  });

  it('moves focus with Tab and Shift+Tab, and wraps', () => {
    const { surface, buttons, press } = menu();
    press('Tab');
    expect(surface.focused).toBe(buttons[0]);
    press('Tab', true);
    expect(surface.focused).toBe(buttons[2]);
  });

  it('sends keys to the focused node, and they bubble', () => {
    const { surface, buttons, press } = menu();
    const targets: UINode[] = [];
    surface.root.on('keydown', (e) => targets.push(e.target!));
    press('a');
    buttons[1].focus();
    press('a');
    expect(targets).toEqual([surface.root, buttons[1]]);
  });

  it('clicks the focused node with Enter, but not on a repeat', () => {
    const { buttons, input, press } = menu();
    const click = jest.fn();
    buttons[1].on('click', click);
    buttons[1].focus();
    expect(press('Enter')).toBe('prevented');
    input.key('down', { key: 'Enter', code: 'Enter', repeat: true });
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.calls[0][0]).toMatchObject({
      pointerType: '',
      x: 70,
      y: 20,
    });
  });

  it('does no default action when a listener prevents it', () => {
    const { surface, buttons, press } = menu();
    buttons[0].focus();
    buttons[0].on('keydown', (e) => e.preventDefault());
    expect(press('ArrowRight')).toBe('prevented');
    expect(surface.focused).toBe(buttons[0]);
  });

  it('passes Escape on, so a menu can close itself', () => {
    const { surface, buttons, press } = menu();
    buttons[0].focus();
    surface.root.on('keydown', (e) => {
      if (e.key === 'Escape') surface.root.style.display = 'none';
    });
    expect(press('Escape')).toBe('taken');
    expect(surface.open).toBe(false);
    expect(press('Escape')).toBe('passed');
  });

  it('focuses a pressed node with no ring, and blurs on a press elsewhere', () => {
    const { surface, buttons, input } = menu();
    input.pointer('down', at(60, 10));
    expect(surface.focused).toBe(buttons[1]);
    expect(surface.focusVisible).toBe(false);
    input.pointer('up', at(60, 10));
    input.pointer('down', at(180, 180));
    expect(surface.focused).toBeNull();
  });

  it('keeps focus on each surface, so it goes back when a popup closes', () => {
    const { surface, buttons } = menu();
    const popup = new UISurface({
      kind: 'screen',
      name: 'popup',
      order: 1,
      input: 'all',
    });
    const ok = box(0, 100, 40);
    ok.style.focusable = true;
    popup.root.append(ok);
    popup.update(200, 200);
    const input = new UIInput({ surfaces: [surface, popup] });
    buttons[2].focus();
    input.key('down', { key: 'Tab', code: 'Tab' });
    expect(popup.focused).toBe(ok);
    expect(surface.focused).toBe(buttons[2]);
    popup.root.style.display = 'none';
    expect(input.focusScope()).toBe(surface);
    input.key('down', { key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(surface.focused).toBe(buttons[1]);
  });

  it('takes gamepad presses as keys', () => {
    const { surface, buttons, input } = menu();
    const click = jest.fn();
    buttons[1].on('click', click);
    const pad = (pressed: number[]) =>
      ({
        index: 0,
        mapping: 'standard',
        buttons: Array.from({ length: 17 }, (_, i) => ({
          pressed: pressed.includes(i),
        })),
        axes: [0, 0],
      } as unknown as Gamepad);
    input.readGamepads([pad([15])], 0);
    input.readGamepads([pad([])], 10);
    input.readGamepads([pad([15])], 20);
    expect(surface.focused).toBe(buttons[1]);
    input.readGamepads([pad([0])], 30);
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('UIInput rays', () => {
  const FORWARD: UIVector3 = { x: 0, y: 0, z: -1 };

  /**
   * A world panel of 0.4 by 0.2 m, 2 m in front of the eye, with a button
   * at 100..300 by 50..150 px, its middle on the ray.
   */
  function setupWorld(z = -2) {
    const log: string[] = [];
    const panel = new UISurface({
      kind: 'world',
      name: 'panel',
      size: { width: 0.4, height: 0.2 },
    });
    panel.worldMatrix.makeTranslation(0, 0, z);
    const button = new UINode({
      style: {
        position: 'absolute',
        left: 100,
        top: 50,
        width: 200,
        height: 100,
      },
    });
    panel.root.append(button);
    panel.update(panel.layoutWidth, panel.layoutHeight);
    record(log, 'button', button);
    const input = new UIInput({ surfaces: [panel] });
    const ray = (x = 0, y = 0, reach = 3) => ({
      pointerId: -2,
      origin: { x, y, z: 0 },
      direction: FORWARD,
      reach,
    });
    return { input, panel, button, log, ray };
  }

  it('turns a ray into pointer events on the node it meets', () => {
    const { input, button, log, ray } = setupWorld();
    expect(input.ray('move', ray())).toBe('taken');
    expect(input.pointerTarget(-2)).toBe(button);
    expect(input.ray('down', ray())).toBe('taken');
    expect(input.ray('up', ray())).toBe('taken');
    expect(log).toEqual([
      'button pointerenter',
      'button pointermove',
      'button pointerdown',
      'button pointerup',
      'button click',
    ]);
    // The ray points between presses, as a mouse does.
    expect(input.pointerTarget(-2)).toBe(button);
  });

  it('leaves a node when the ray moves off it, and passes a miss', () => {
    const { input, log, ray } = setupWorld();
    input.ray('move', ray());
    // 0.15 m right is past the button's right edge, still on the panel.
    expect(input.ray('move', ray(0.15))).toBe('passed');
    expect(input.ray('move', ray(1))).toBe('passed');
    expect(log).toEqual([
      'button pointerenter',
      'button pointermove',
      'button pointerleave',
    ]);
  });

  it('misses a surface past reach, behind the eye or seen from behind', () => {
    const { input, panel, log, ray } = setupWorld();
    expect(input.ray('move', ray(0, 0, 1.5))).toBe('passed');
    panel.worldMatrix.makeTranslation(0, 0, 2);
    expect(input.ray('move', ray())).toBe('passed');
    panel.worldMatrix.makeRotationY(Math.PI).setPosition(0, 0, -2);
    expect(input.ray('move', ray())).toBe('passed');
    expect(log).toEqual([]);
  });

  it('takes the nearest surface, whose root blocks the ones behind it', () => {
    const far = setupWorld(-2);
    const near = new UISurface({
      kind: 'world',
      name: 'near',
      size: { width: 0.4, height: 0.2 },
    });
    near.worldMatrix.makeTranslation(0, 0, -1);
    near.update(near.layoutWidth, near.layoutHeight);
    const input = new UIInput({ surfaces: [far.panel, near] });
    expect(input.ray('move', far.ray())).toBe('passed');
    expect(far.log).toEqual([]);
    near.input = 'none';
    expect(input.ray('move', far.ray())).toBe('taken');
    expect(far.log).toEqual(['button pointerenter', 'button pointermove']);
  });

  it('keeps a captured pointer on its surface, off its edge', () => {
    const { input, button, ray } = setupWorld();
    const moves: number[] = [];
    button.on('pointerdown', (e) => button.setPointerCapture(e.pointerId));
    button.on('pointermove', (e) => moves.push(e.x));
    input.ray('down', ray());
    input.ray('move', ray(1));
    expect(moves).toHaveLength(1);
    // 1 m right of the panel's centre, which is 200 px from its left edge.
    expect(moves[0]).toBeCloseTo(1200, 3);
  });

  it('cancels the press and the hover with no click', () => {
    const { input, log, ray } = setupWorld();
    input.ray('down', ray());
    expect(input.ray('cancel', ray())).toBe('taken');
    expect(input.pointerTarget(-2)).toBeNull();
    expect(log).toEqual([
      'button pointerenter',
      'button pointerdown',
      'button pointercancel',
      'button pointerleave',
    ]);
  });
});
