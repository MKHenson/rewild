import { UIEventType, UIPointerInit } from './events';
import { UIInput } from './UIInput';
import { UINode } from './UINode';
import { UISurface, UISurfaceOptions } from './UISurface';

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
