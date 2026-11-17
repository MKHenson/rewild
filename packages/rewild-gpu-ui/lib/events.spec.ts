import { UIEventPhase, UIKeyboardEvent, UIPointerEvent } from './events';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

const POINT = { pointerId: 1, pointerType: 'mouse' as const, x: 0, y: 0 };

function click() {
  return new UIPointerEvent('click', POINT);
}

/** root > parent > child, and a log of each listener call. */
function tree() {
  const root = new UINode();
  const parent = new UINode();
  const child = new UINode();
  parent.append(child);
  root.append(parent);
  const log: string[] = [];
  const names = new Map([
    [root, 'root'],
    [parent, 'parent'],
    [child, 'child'],
  ]);
  for (const [node, name] of names) {
    node.on('click', (e) => log.push(`${name} capture ${e.eventPhase}`), {
      capture: true,
    });
    node.on('click', (e) => log.push(`${name} bubble ${e.eventPhase}`));
  }
  return { root, parent, child, log };
}

describe('dispatchEvent', () => {
  it('captures down from the root, then bubbles up from the target', () => {
    const { child, log } = tree();
    child.dispatchEvent(click());
    const { Capture, Target, Bubble } = UIEventPhase;
    expect(log).toEqual([
      `root capture ${Capture}`,
      `parent capture ${Capture}`,
      `child capture ${Target}`,
      `child bubble ${Target}`,
      `parent bubble ${Bubble}`,
      `root bubble ${Bubble}`,
    ]);
  });

  it('sets the target and the current target', () => {
    const { parent, child } = tree();
    const event = click();
    let seen: [UINode | null, UINode | null] = [null, null];
    parent.on('click', (e) => (seen = [e.target, e.currentTarget]));
    child.dispatchEvent(event);
    expect(seen).toEqual([child, parent]);
    expect(event.currentTarget).toBeNull();
    expect(event.eventPhase).toBe(UIEventPhase.None);
  });

  it('stops after the node whose listener stops propagation', () => {
    const { parent, child, log } = tree();
    parent.on('click', (e) => e.stopPropagation());
    child.dispatchEvent(click());
    expect(log.at(-1)).toMatch(/^parent bubble/);
    expect(log.some((line) => line.startsWith('root bubble'))).toBe(false);
  });

  it('stops in the capture phase', () => {
    const { root, child, log } = tree();
    root.on('click', (e) => e.stopPropagation(), { capture: true });
    child.dispatchEvent(click());
    expect(log).toEqual([`root capture ${UIEventPhase.Capture}`]);
  });

  it('does not bubble enter and leave', () => {
    const { parent, child } = tree();
    const seen: number[] = [];
    parent.on('pointerenter', (e) => seen.push(e.eventPhase));
    parent.on('pointerenter', (e) => seen.push(e.eventPhase), {
      capture: true,
    });
    child.dispatchEvent(new UIPointerEvent('pointerenter', POINT));
    expect(seen).toEqual([UIEventPhase.Capture]);
  });

  it('returns false when a listener prevents the default', () => {
    const { root, child } = tree();
    expect(child.dispatchEvent(click())).toBe(true);
    root.on('click', (e) => e.preventDefault());
    const event = click();
    expect(child.dispatchEvent(event)).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('removes a listener with off', () => {
    const node = new UINode();
    const listener = jest.fn();
    node.on('keydown', listener);
    node.on('keydown', listener);
    node.dispatchEvent(
      new UIKeyboardEvent('keydown', { key: 'a', code: 'KeyA' })
    );
    expect(listener).toHaveBeenCalledTimes(1);
    node.off('keydown', listener);
    node.dispatchEvent(
      new UIKeyboardEvent('keydown', { key: 'a', code: 'KeyA' })
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not run a listener removed by an earlier one', () => {
    const node = new UINode();
    const second = jest.fn();
    node.on('click', () => node.off('click', second));
    node.on('click', second);
    node.dispatchEvent(click());
    expect(second).not.toHaveBeenCalled();
  });
});

describe('pointer capture', () => {
  it('belongs to one node on the surface at a time', () => {
    const surface = new UISurface({ kind: 'screen', name: 'test' });
    const a = new UINode();
    const b = new UINode();
    surface.root.append(a, b);
    a.setPointerCapture(1);
    expect(a.hasPointerCapture(1)).toBe(true);
    b.setPointerCapture(1);
    expect(a.hasPointerCapture(1)).toBe(false);
    a.releasePointerCapture(1);
    expect(b.hasPointerCapture(1)).toBe(true);
    b.releasePointerCapture(1);
    expect(surface.pointerCaptures.size).toBe(0);
  });

  it('needs a surface', () => {
    expect(() => new UINode().setPointerCapture(1)).toThrow();
  });
});
