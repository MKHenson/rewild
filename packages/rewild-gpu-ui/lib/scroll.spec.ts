import { Slider } from './components/Slider';
import { gamepad, MOUSE } from './components/testing';
import { hitTest } from './hitTest';
import { scrollbars } from './scroll';
import { UIStyle } from './style';
import { UIInput } from './UIInput';
import { Dirty, UINode } from './UINode';
import { UISurface } from './UISurface';

const TOUCH = { pointerId: 2, pointerType: 'touch' as const, button: 0 };

/** Rows of 40 px, focusable, in a column. */
function rows(count: number, style: UIStyle = {}): UINode[] {
  return Array.from(
    { length: count },
    (_, i) =>
      new UINode({
        name: `row${i}`,
        style: { height: 40, focusable: true, ...style },
      })
  );
}

/**
 * A 200 by 100 scroll container at 10, 10 with five 40 px rows, on a
 * surface that takes all input.
 */
function setup(style: UIStyle = {}) {
  const surface = new UISurface({ kind: 'screen', name: 'menu', input: 'all' });
  const list = new UINode({
    name: 'list',
    style: {
      position: 'absolute',
      left: 10,
      top: 10,
      width: 200,
      height: 100,
      flexDirection: 'column',
      overflow: 'scroll',
      ...style,
    },
  });
  const items = rows(5);
  list.append(...items);
  surface.root.append(list);
  const update = () => surface.update(400, 300);
  update();
  const input = new UIInput({ surfaces: [surface] });
  return { surface, list, items, input, update };
}

describe('scroll layout', () => {
  it('lets its items overflow and measures the content', () => {
    const { list, items } = setup({ padding: [0, 0, 8, 0] });
    expect(items.map((n) => n.rect.height)).toEqual([40, 40, 40, 40, 40]);
    expect(list.scrollHeight).toBe(208);
    expect(list.scrollWidth).toBe(200);
  });

  it('moves the children with no layout, and clamps', () => {
    const { list, items, surface } = setup();
    expect(list.scrollTo(0, 30)).toBe(true);
    expect(items[0].rect.y).toBe(10 - 30);
    expect(surface.needsLayout).toBe(false);
    expect(surface.needsPaint).toBe(true);
    list.scrollTop = 1000;
    expect(list.scrollTop).toBe(100);
    expect(items[4].rect.y).toBe(10 + 160 - 100);
    expect(list.scrollBy(0, 10)).toBe(false);
  });

  it('keeps the scroll through layout, and clamps it when the content shrinks', () => {
    const { list, items, update } = setup();
    list.scrollTop = 60;
    list.markDirty(Dirty.Layout);
    update();
    expect(items[1].rect.y).toBe(10 + 40 - 60);
    items[4].remove();
    items[3].remove();
    update();
    expect(list.scrollTop).toBe(20);
    expect(items[0].rect.y).toBe(-10);
  });

  it('scrolls along a row', () => {
    const { list } = setup({ flexDirection: 'row' });
    list.replaceChildren(...rows(4, { width: 80, height: undefined }));
    list.markDirty(Dirty.Layout);
    list.surface!.update(400, 300);
    expect(list.scrollWidth).toBe(320);
    list.scrollLeft = 500;
    expect(list.scrollLeft).toBe(120);
    expect(list.children[3].rect.x).toBe(10 + 240 - 120);
  });

  it('keeps a gutter clear for the scrollbar, inside the padding', () => {
    const { list, items } = setup({ padding: 8 });
    expect(list.scrollGutters).toEqual({ x: false, y: true });
    // 8 px of padding inside a 10 px gutter on the right.
    expect(items[0].rect.width).toBe(200 - 8 - 8 - 10);
    expect(list.scrollWidth).toBe(200);
    const [bar] = scrollbars(list);
    expect(bar.track.x).toBeGreaterThanOrEqual(
      items[0].rect.x + items[0].rect.width + 8
    );
  });

  it('removes the gutter when the content fits', () => {
    const { list, items, update } = setup();
    items.slice(2).forEach((n) => n.remove());
    update();
    expect(list.scrollGutters).toEqual({ x: false, y: false });
    expect(items[0].rect.width).toBe(200);
  });

  it('keeps both gutters, and the content clears both bars at the end', () => {
    const { list, update } = setup();
    const wide = new UINode({ style: { width: 300, height: 300 } });
    list.replaceChildren(wide);
    update();
    expect(list.scrollGutters).toEqual({ x: true, y: true });
    expect(list.scrollWidth).toBe(310);
    expect(list.scrollHeight).toBe(310);
    list.scrollTo(1000, 1000);
    for (const bar of scrollbars(list)) {
      if (bar.vertical)
        expect(wide.rect.x + wide.rect.width).toBeLessThanOrEqual(bar.track.x);
      else
        expect(wide.rect.y + wide.rect.height).toBeLessThanOrEqual(bar.track.y);
    }
  });

  it('gives a parent that sizes to its content the gutter too', () => {
    const surface = new UISurface({ kind: 'screen', name: 'menu' });
    const parent = new UINode({ style: { position: 'absolute' } });
    const list = new UINode({
      style: { height: 100, flexDirection: 'column', overflow: 'scroll' },
    });
    list.append(...rows(5, { width: 120 }));
    parent.append(list);
    surface.root.append(parent);
    surface.update(400, 300);
    expect(list.rect.width).toBe(130);
    expect(parent.rect.width).toBe(130);
  });

  it('does not hit a child scrolled out of view', () => {
    const { list, items, surface } = setup();
    list.scrollTop = 50;
    // The first row is above the list now, at y -40 to 0.
    expect(hitTest(surface.root, 20, 5)).not.toBe(items[0]);
    expect(hitTest(surface.root, 20, 15)).toBe(items[1]);
  });
});

describe('scrollbars', () => {
  it('sizes the thumb to the share that shows, and moves it with the scroll', () => {
    const { list } = setup();
    const [bar] = scrollbars(list);
    expect(bar.vertical).toBe(true);
    expect(bar.track).toEqual({ x: 202, y: 12, width: 6, height: 96 });
    expect(bar.thumb.height).toBeCloseTo(48);
    expect(bar.thumb.y).toBe(12);
    list.scrollTop = 100;
    const [end] = scrollbars(list);
    expect(end.thumb.y + end.thumb.height).toBeCloseTo(108);
  });

  it('has none when the content fits', () => {
    const { list, items } = setup();
    items.slice(2).forEach((n) => n.remove());
    list.surface!.update(400, 300);
    expect(scrollbars(list)).toEqual([]);
  });

  it('draws a thumb for each bar', () => {
    const { list, surface } = setup();
    const before = surface.stream.count;
    list.style.overflow = 'hidden';
    surface.update(400, 300);
    expect(surface.stream.count).toBe(before - 1);
  });

  it('drags the thumb with the mouse, and sends no events', () => {
    const { list, items, input } = setup();
    const down = jest.fn();
    items[0].on('pointerdown', down);
    input.pointer('down', { ...MOUSE, x: 205, y: 20 });
    expect(list.scrollbarDrag).toBe('y');
    // The thumb moves 48 px in its track for the full 100 px of scroll.
    input.pointer('move', { ...MOUSE, x: 300, y: 44 });
    expect(list.scrollTop).toBeCloseTo(50);
    input.pointer('up', { ...MOUSE, x: 300, y: 44 });
    expect(list.scrollbarDrag).toBeNull();
    expect(down).not.toHaveBeenCalled();
  });

  it('asks for a redraw on each move of a drag, as it sends no events', () => {
    const { input } = setup();
    const redraw = jest.fn();
    input.onRedraw = redraw;
    input.pointer('down', { ...MOUSE, x: 205, y: 20 });
    input.pointer('move', { ...MOUSE, x: 205, y: 30 });
    input.pointer('move', { ...MOUSE, x: 205, y: 40 });
    const moves = redraw.mock.calls.length;
    expect(moves).toBeGreaterThanOrEqual(3);
    input.pointer('up', { ...MOUSE, x: 205, y: 40 });
    expect(redraw.mock.calls.length).toBeGreaterThan(moves);
  });

  it('lights the scrollbar a mouse hovers', () => {
    const { list, input } = setup();
    const redraw = jest.fn();
    input.onRedraw = redraw;
    input.pointer('move', { ...MOUSE, x: 50, y: 50 });
    expect(list.scrollbarHover).toBeNull();
    input.pointer('move', { ...MOUSE, x: 205, y: 50 });
    expect(list.scrollbarHover).toBe('y');
    expect(redraw).toHaveBeenCalledTimes(1);
    input.pointer('move', { ...MOUSE, x: 206, y: 60 });
    expect(redraw).toHaveBeenCalledTimes(1);
    input.pointer('move', { ...MOUSE, x: 50, y: 50 });
    expect(list.scrollbarHover).toBeNull();
    expect(redraw).toHaveBeenCalledTimes(2);
  });

  it('pages on a press on the track', () => {
    const { list, input } = setup();
    input.pointer('down', { ...MOUSE, x: 205, y: 100 });
    input.pointer('up', { ...MOUSE, x: 205, y: 100 });
    expect(list.scrollTop).toBe(90);
  });
});

describe('scroll input', () => {
  it('scrolls the nearest container that can move on a wheel', () => {
    const { list, items, input, surface } = setup();
    const inner = new UINode({
      style: { height: 40, overflow: 'scroll', flexDirection: 'column' },
    });
    inner.append(...rows(2));
    list.insertBefore(inner, items[0]);
    surface.update(400, 300);
    const wheel = (deltaY: number) =>
      input.wheel({ ...MOUSE, x: 20, y: 20, deltaX: 0, deltaY });
    expect(wheel(30)).toBe('prevented');
    expect(inner.scrollTop).toBe(30);
    wheel(30);
    expect(inner.scrollTop).toBe(40);
    // The inner list is at its end, so the outer one scrolls.
    wheel(30);
    expect(list.scrollTop).toBe(30);
  });

  it('keeps a wheel at the end of a container from the page', () => {
    const { list, input, surface } = setup();
    const outside = new UINode({
      style: {
        position: 'absolute',
        left: 300,
        top: 10,
        width: 50,
        height: 50,
      },
    });
    surface.root.append(outside);
    surface.update(400, 300);
    const wheel = (x: number, deltaY: number) =>
      input.wheel({ ...MOUSE, x, y: 20, deltaX: 0, deltaY });
    expect(wheel(20, -30)).toBe('prevented');
    expect(wheel(20, 0)).toBe('prevented');
    expect(list.scrollTop).toBe(0);
    expect(wheel(320, 30)).not.toBe('prevented');
  });

  it('scrolls across with Shift', () => {
    const { list, input } = setup({ flexDirection: 'row' });
    list.replaceChildren(...rows(4, { width: 80, height: undefined }));
    list.surface!.update(400, 300);
    input.wheel({
      ...MOUSE,
      x: 20,
      y: 20,
      deltaX: 0,
      deltaY: 50,
      shiftKey: true,
    });
    expect(list.scrollLeft).toBe(50);
  });

  it('lets a wheel listener prevent the scroll', () => {
    const { list, input } = setup();
    list.on('wheel', (e) => e.preventDefault());
    input.wheel({ ...MOUSE, x: 20, y: 20, deltaX: 0, deltaY: 50 });
    expect(list.scrollTop).toBe(0);
  });

  it('drags with a touch past the slop, and cancels the press', () => {
    const { list, items, input } = setup();
    const cancel = jest.fn();
    const click = jest.fn();
    items[1].on('pointercancel', cancel);
    items[1].on('click', click);
    input.pointer('down', { ...TOUCH, x: 50, y: 60 });
    input.pointer('move', { ...TOUCH, x: 50, y: 55 });
    expect(list.scrollTop).toBe(0);
    input.pointer('move', { ...TOUCH, x: 50, y: 40 });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(list.scrollTop).toBe(20);
    input.pointer('move', { ...TOUCH, x: 50, y: 10 });
    expect(list.scrollTop).toBe(50);
    input.pointer('up', { ...TOUCH, x: 50, y: 10 });
    expect(click).not.toHaveBeenCalled();
  });

  it('leaves a touch to a node that captured it', () => {
    const { list, items, input, surface } = setup();
    const slider = new Slider({ value: 50, style: { width: 150 } });
    list.insertBefore(slider, items[0]);
    surface.update(400, 300);
    input.pointer('down', { ...TOUCH, x: 50, y: 20 });
    input.pointer('move', { ...TOUCH, x: 100, y: 0 });
    expect(list.scrollTop).toBe(0);
    expect(slider.value).toBeGreaterThan(50);
  });

  it('scrolls the focused node into view when focus moves by key', () => {
    const { list, items, input, update } = setup();
    items[0].focus();
    for (let i = 0; i < 3; i++)
      input.key('down', { key: 'ArrowDown', code: 'ArrowDown' });
    update();
    expect(items[3].focused).toBe(true);
    // The row and a 4 px margin show at the bottom of the list.
    expect(list.scrollTop).toBe(64);
    expect(items[3].rect.y + 40).toBe(10 + 100 - 4);
  });

  it('does not scroll when a pointer gives focus', () => {
    const { list, items, update } = setup();
    list.scrollTop = 30;
    items[0].focus();
    update();
    expect(list.scrollTop).toBe(30);
  });
});

describe('the right stick', () => {
  const stick = (x: number, y: number) =>
    ({ ...gamepad([]), axes: [0, 0, x, y] } as unknown as Gamepad);

  it('scrolls the container round the focused node', () => {
    const { list, items, input } = setup();
    items[0].focus();
    input.readGamepads([stick(0, 1)], 0);
    input.readGamepads([stick(0, 1)], 50);
    // 1200 px a second at full tilt, for 50 ms.
    expect(list.scrollTop).toBeCloseTo(60);
  });

  it('scrolls the first container in the scope with no focus, and has a dead zone', () => {
    const { list, input } = setup();
    input.readGamepads([stick(0, 0.15)], 0);
    input.readGamepads([stick(0, 0.15)], 50);
    expect(list.scrollTop).toBe(0);
    input.readGamepads([stick(0, 0.6)], 100);
    // Half tilt past the dead zone, squared: a quarter speed.
    expect(list.scrollTop).toBeCloseTo(15);
  });
});
