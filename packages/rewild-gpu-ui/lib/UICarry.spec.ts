import { gamepad, MOUSE, PAD } from './components/testing';
import type { UIPointerType } from './events';
import { printFocus } from './debug';
import { UICarry, UIPutAmount, UISlot, UITakeAmount } from './UICarry';
import { UIInput } from './UIInput';
import { UINode } from './UINode';
import { UISurface, UISurfaceOptions } from './UISurface';

const X = 2;
const SIZE = 40;

interface Stack {
  kind: string;
  count: number;
}

/**
 * A row of slots at the top left of a menu surface. Each holds a stack, and
 * stacks of one kind merge in `put`.
 */
function setup(
  contents: (Stack | null)[],
  options: {
    input?: 'all' | 'nodes';
    accepts?: (i: number, s: Stack) => boolean;
  } = {}
) {
  const surfaces: UISurface[] = [];
  const host = {
    surfaces,
    createSurface(o: UISurfaceOptions) {
      const surface = new UISurface(o);
      surfaces.push(surface);
      surfaces.sort((a, b) => a.order - b.order);
      return surface;
    },
  };
  const menu = host.createSurface({
    kind: 'screen',
    name: 'menu',
    input: options.input ?? 'all',
  });
  menu.root.style.alignItems = 'flex-start';
  const input = new UIInput(host);
  const carry = new UICarry(host, input);
  const items = contents.slice();
  const log: string[] = [];
  const takes: UITakeAmount[] = [];
  const puts: UIPutAmount[] = [];
  const nodes: UINode[] = [];
  const slots: UISlot<Stack>[] = [];

  items.forEach((_, i) => {
    const node = new UINode({
      name: `slot ${i}`,
      style: { width: SIZE, height: SIZE, focusable: true },
    });
    node.on('click', () => log.push(`click ${i}`));
    nodes.push(node);
    slots.push(
      carry.slot<Stack>(node, {
        take: (amount) => {
          takes.push(amount);
          const stack = items[i];
          if (!stack) return null;
          const count =
            amount === 'half' ? Math.ceil(stack.count / 2) : stack.count;
          const left = stack.count - count;
          items[i] = left ? { kind: stack.kind, count: left } : null;
          return { kind: stack.kind, count };
        },
        put: (stack, amount) => {
          puts.push(amount);
          const there = items[i];
          const count = amount === 'one' ? 1 : stack.count;
          const rest = stack.count - count;
          if (!there) {
            items[i] = { kind: stack.kind, count };
            return rest ? { kind: stack.kind, count: rest } : null;
          }
          if (there.kind === stack.kind) {
            items[i] = { kind: there.kind, count: there.count + count };
            return rest ? { kind: stack.kind, count: rest } : null;
          }
          items[i] = stack;
          return there;
        },
        accepts: options.accepts
          ? (item) => options.accepts!(i, item as Stack)
          : undefined,
        ghost: (stack) =>
          new UINode({
            name: `${stack.count} ${stack.kind}`,
            style: { width: 20, height: 20 },
          }),
        enter: () => log.push(`enter ${i}`),
        leave: () => log.push(`leave ${i}`),
      })
    );
  });
  menu.root.append(...nodes);
  const returns: [unknown, number][] = [];
  carry.onReturn = (item, from) =>
    returns.push([item, slots.indexOf(from as UISlot<Stack>)]);

  const update = () => {
    for (const surface of surfaces) surface.update(400, 300);
  };
  const centre = (i: number) => SIZE * i + SIZE / 2;
  const click = (
    i: number,
    button = 0,
    pointerType: UIPointerType = 'mouse'
  ) => {
    const at = { ...MOUSE, pointerType, button, x: centre(i), y: SIZE / 2 };
    input.pointer('down', at);
    input.pointer('up', at);
    update();
  };
  const move = (x: number, y: number) => {
    input.pointer('move', { ...MOUSE, x, y });
    update();
  };
  const key = (key: string, shiftKey = false) => {
    input.key('down', { key, code: key, shiftKey });
    input.key('up', { key, code: key, shiftKey });
    update();
  };
  let now = 0;
  const pad = (button: number) => {
    input.readGamepads([gamepad([button])], (now += 1000));
    input.readGamepads([gamepad([])], (now += 16));
    update();
  };
  update();
  return {
    menu,
    input,
    carry,
    items,
    nodes,
    slots,
    log,
    takes,
    puts,
    returns,
    surfaces,
    update,
    click,
    move,
    key,
    pad,
  };
}

const tile = (count = 1, kind = 'tile'): Stack => ({ kind, count });

describe('UICarry', () => {
  describe('the one rule', () => {
    it('with nothing carried, a click on an empty slot goes on as a click', () => {
      const { carry, click, log, takes } = setup([null]);
      click(0);
      expect(carry.held).toBeNull();
      expect(takes).toEqual(['all']);
      expect(log).toEqual(['click 0']);
    });

    it('with nothing carried, a click on a full slot carries its item', () => {
      const { carry, click, items, log } = setup([tile(3)]);
      click(0);
      expect(carry.held).toEqual(tile(3));
      expect(carry.from?.node.name).toBe('slot 0');
      expect(items[0]).toBeNull();
      expect(log).not.toContain('click 0');
    });

    it('with an item carried, a click on an empty slot puts it in', () => {
      const { carry, click, items, puts } = setup([tile(3), null]);
      click(0);
      click(1);
      expect(carry.held).toBeNull();
      expect(carry.from).toBeNull();
      expect(items).toEqual([null, tile(3)]);
      expect(puts).toEqual(['all']);
    });

    it('with an item carried, a click on a full slot exchanges the items', () => {
      const { carry, click, items, slots } = setup([
        tile(1, 'a'),
        tile(2, 'b'),
      ]);
      click(0);
      click(1);
      expect(items).toEqual([null, tile(1, 'a')]);
      expect(carry.held).toEqual(tile(2, 'b'));
      expect(carry.from).toBe(slots[1]);
    });

    it('calls onChange with each carried item', () => {
      const { carry, click } = setup([tile(1, 'a'), tile(1, 'b')]);
      const changes: unknown[] = [];
      carry.onChange = (held) => changes.push(held);
      click(0);
      click(1);
      click(0);
      expect(changes).toEqual([tile(1, 'a'), tile(1, 'b'), null]);
    });

    it('lets a click on a node that is not a slot go on', () => {
      const { carry, click, menu, update } = setup([tile()]);
      const button = new UINode({ style: { width: SIZE, height: SIZE } });
      const clicked = jest.fn();
      button.on('click', clicked);
      menu.root.append(button);
      update();
      click(0);
      click(1);
      expect(clicked).toHaveBeenCalled();
      expect(carry.held).toEqual(tile());
    });
  });

  describe('accepts', () => {
    const red = (i: number, s: Stack) => i !== 1 || s.kind === 'red';

    it('takes no click and keeps the item on a slot that refuses it', () => {
      const { carry, click, items, log } = setup([tile(1, 'blue'), null], {
        accepts: red,
      });
      click(0);
      log.length = 0;
      click(1);
      expect(carry.held).toEqual(tile(1, 'blue'));
      expect(items[1]).toBeNull();
      expect(log).not.toContain('click 1');
      expect(log).not.toContain('enter 1');
    });

    it('lights only a slot that accepts, and fades the ghost over one that refuses', () => {
      const { carry, click, move, log } = setup([tile(1, 'blue'), null, null], {
        accepts: red,
      });
      click(0);
      expect(log).toEqual(['enter 0']);
      const ghost = carry.surface.root.children[0];
      move(60, 20);
      expect(log).toEqual(['enter 0', 'leave 0']);
      expect(carry.over?.node.name).toBe('slot 1');
      expect(ghost.style.opacity).toBe(0.5);
      move(100, 20);
      expect(log).toEqual(['enter 0', 'leave 0', 'enter 2']);
      expect(ghost.style.opacity).toBe(1);
      move(300, 200);
      expect(log).toEqual(['enter 0', 'leave 0', 'enter 2', 'leave 2']);
      expect(carry.over).toBeNull();
    });
  });

  describe('amounts', () => {
    it('takes half with the right button and puts one', () => {
      const { carry, click, items, takes, puts, log } = setup([tile(7), null]);
      click(0, 2);
      expect(takes).toEqual(['half']);
      expect(carry.held).toEqual(tile(4));
      expect(items[0]).toEqual(tile(3));
      click(1, 2);
      click(1, 2);
      expect(puts).toEqual(['one', 'one']);
      expect(items[1]).toEqual(tile(2));
      expect(carry.held).toEqual(tile(2));
      expect(log.filter((l) => l.startsWith('click'))).toEqual([]);
    });

    it('rebuilds the ghost for what stays carried', () => {
      const { carry, click } = setup([tile(4), null]);
      click(0);
      click(1, 2);
      expect(carry.surface.root.children[0].children[0].name).toBe('3 tile');
    });

    it('takes all with Enter and half with Shift+Enter', () => {
      const { carry, key, nodes, takes, puts, items } = setup([tile(6), null]);
      nodes[0].focus();
      key('Enter', true);
      expect(takes).toEqual(['half']);
      key('ArrowRight');
      key('Enter', true);
      expect(puts).toEqual(['one']);
      key('Enter');
      expect(puts).toEqual(['one', 'all']);
      expect(items).toEqual([tile(3), tile(3)]);
      expect(carry.held).toBeNull();
    });

    it('takes all with A and half with X', () => {
      const { carry, pad, nodes, takes, puts } = setup([tile(6), null]);
      nodes[0].focus();
      pad(X);
      expect(takes).toEqual(['half']);
      pad(PAD.RIGHT);
      pad(X);
      pad(PAD.A);
      expect(puts).toEqual(['one', 'all']);
      expect(carry.held).toBeNull();
    });

    it('takes all with a tap', () => {
      const { carry, click, items } = setup([tile(5), null]);
      click(0, 0, 'touch');
      expect(carry.held).toEqual(tile(5));
      click(1, 0, 'touch');
      expect(items[1]).toEqual(tile(5));
    });
  });

  describe('returning', () => {
    it('returns the item on Escape before the nodes get the key', () => {
      const { carry, key, click, menu, returns } = setup([tile()]);
      const keydown = jest.fn();
      menu.root.on('keydown', keydown);
      click(0);
      key('Escape');
      expect(carry.held).toBeNull();
      expect(returns).toEqual([[tile(), 0]]);
      expect(keydown).not.toHaveBeenCalled();
      key('Escape');
      expect(keydown).toHaveBeenCalledTimes(1);
    });

    it('returns the item on B', () => {
      const { carry, pad, click, returns } = setup([tile()]);
      click(0);
      pad(PAD.B);
      expect(carry.held).toBeNull();
      expect(returns).toEqual([[tile(), 0]]);
    });

    it('returns the item on cancel', () => {
      const { carry, click, returns } = setup([tile(), tile(1, 'b')]);
      click(0);
      click(1);
      carry.cancel();
      expect(returns).toEqual([[tile(1, 'b'), 1]]);
      expect(carry.held).toBeNull();
    });

    it('returns the item on a press off each surface, which the game does not get', () => {
      const { carry, input, click, returns } = setup([tile()], {
        input: 'nodes',
      });
      click(0);
      const at = { ...MOUSE, x: 300, y: 200 };
      expect(input.pointer('down', at)).not.toBe('passed');
      expect(input.pointer('up', at)).not.toBe('passed');
      expect(returns).toEqual([[tile(), 0]]);
      expect(carry.held).toBeNull();
    });

    it('returns the item when the surface of its slot closes', () => {
      const { carry, click, menu, returns } = setup([tile()]);
      click(0);
      menu.input = 'none';
      carry.update();
      expect(returns).toEqual([[tile(), 0]]);
      expect(carry.held).toBeNull();
    });

    it('puts the item back in its slot when there is no onReturn', () => {
      const { carry, click, items } = setup([tile(2)]);
      carry.onReturn = null;
      click(0);
      carry.cancel();
      expect(items[0]).toEqual(tile(2));
    });
  });

  describe('the ghost', () => {
    it('draws on the carry surface over the other surfaces, and takes no input', () => {
      const { carry, surfaces, click } = setup([tile()]);
      click(0);
      expect(surfaces[surfaces.length - 1]).toBe(carry.surface);
      expect(carry.surface.order).toBe(3);
      expect(carry.surface.input).toBe('none');
      expect(carry.surface.root.children[0].children[0].name).toBe('1 tile');
    });

    it('is centred on the pointer, and the hit test finds the slot under it', () => {
      const { carry, click, move } = setup([tile(), null]);
      click(0);
      move(65, 25);
      const ghost = carry.surface.root.children[0];
      expect(ghost.style.transform).toEqual({ x: 55, y: 15 });
      expect(ghost.style.transition).toBeUndefined();
      expect(carry.over?.node.name).toBe('slot 1');
    });

    it('sits up and to the right of the focused node, and slides to it', () => {
      const { carry, key, nodes } = setup([tile(), null]);
      nodes[0].focus();
      key('Enter');
      key('ArrowRight');
      const ghost = carry.surface.root.children[0];
      expect(ghost.style.transform).toEqual({
        x: centre(1) + 12 - 10,
        y: SIZE / 2 - 12 - 10,
      });
      expect(ghost.style.transition).toEqual({
        property: 'transform',
        duration: 80,
      });
      expect(carry.over?.node.name).toBe('slot 1');
    });

    it('goes when nothing is carried', () => {
      const { carry, click } = setup([tile(), null]);
      click(0);
      click(1);
      expect(carry.surface.root.children).toEqual([]);
    });
  });

  it('removes a slot', () => {
    const { carry, click, slots, log } = setup([tile()]);
    slots[0].remove();
    click(0);
    expect(carry.held).toBeNull();
    expect(log).toEqual(['click 0']);
  });

  it('prints the carried item, where it came from and the slot under it', () => {
    const { carry, input, surfaces, click } = setup([tile(2), null]);
    expect(printFocus(surfaces, input)).toContain('Carried: nothing');
    click(0);
    const lines = printFocus(surfaces, input).split('\n');
    expect(lines).toContain(
      'Carried: {"kind":"tile","count":2} from menu root/0 #slot 0'
    );
    expect(lines).toContain('  over: menu root/0 #slot 0');
    carry.describe = (item) => `${(item as Stack).count} × tile`;
    expect(printFocus(surfaces, input)).toContain('Carried: 2 × tile');
  });
});

function centre(i: number): number {
  return SIZE * i + SIZE / 2;
}
