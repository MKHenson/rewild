import {
  Button,
  Grid,
  HexColor,
  Image,
  Label,
  Modal,
  UICarry,
  UIChild,
  UIImages,
  UINode,
  UIPutAmount,
  UISlot,
  UIStyle,
  UITakeAmount,
} from '../../lib';
import { example } from '../registry';
import { panel, shape, SHAPE_COLORS, SHAPES } from '../standIns';

const part = 'Carry';

const SLOT = 56;
const CONTENT = 44;
const SLOT_COLOR = '#16212c';
const LIT_COLOR = '#2f6ea8';
const EDGE_COLOR: HexColor = '#3d5266';

/** A shape: an index into `SHAPES` and `SHAPE_COLORS`. */
interface Shape {
  kind: number;
}

/** A stack of numbered tiles. */
interface Tile {
  n: number;
  count: number;
}

const TILE_COLORS: HexColor[] = ['#e4572e', '#76b041', '#4ea5d9'];
const MAX_STACK = 10;

function addShapes(images: UIImages): void {
  SHAPES.forEach((kind, i) =>
    images.add(`shape-${i}`, shape(kind, SHAPE_COLORS[i]))
  );
}

function shapeName(item: unknown): string {
  return `1 × ${SHAPES[(item as Shape).kind]}`;
}

function drawShape(item: Shape, size: number): UINode {
  return new Image({
    image: `shape-${item.kind}`,
    style: { width: size, height: size, pointerEvents: 'none' },
  }).node;
}

function drawTile(item: Tile, size: number): UINode {
  const node = new UINode({
    style: {
      width: size,
      height: size,
      borderRadius: 6,
      backgroundColor: TILE_COLORS[item.n - 1],
      justifyContent: 'center',
      alignItems: 'center',
      pointerEvents: 'none',
    },
  });
  const count = new UINode({
    text: String(item.count),
    style: {
      position: 'absolute',
      right: 3,
      bottom: 1,
      fontSize: 12,
      fontWeight: 'bold',
    },
  });
  node.append(
    new UINode({ text: String(item.n), style: { fontSize: 20 } }),
    count
  );
  return node;
}

interface SlotsOptions<T> {
  name: string;
  draw(item: T, size: number): UINode;
  /** The slot's own rule. Defaults to taking the whole item and swapping. */
  take?(slots: Slots<T>, i: number, amount: UITakeAmount): T | null;
  put?(slots: Slots<T>, i: number, item: T, amount: UIPutAmount): T | null;
  accepts?(i: number, item: T): boolean;
  /** Each slot's edge colour. */
  edge?(i: number): HexColor;
  /** The size of what a slot draws. */
  size?: number;
  log?(line: string): void;
}

/** A list of slots and the items in them. Each slot is a focusable box. */
class Slots<T> {
  readonly nodes: UINode[];
  readonly slots: UISlot<T>[];

  constructor(
    carry: UICarry,
    readonly items: (T | null)[],
    private options: SlotsOptions<T>
  ) {
    const say = (line: string) => options.log?.(line);
    const label = (i: number) => `${options.name} ${i + 1}`;
    this.nodes = items.map((_, i) => {
      const node = new UINode({
        name: label(i),
        style: {
          width: SLOT,
          height: SLOT,
          flexShrink: 0,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: options.edge?.(i) ?? EDGE_COLOR,
          backgroundColor: SLOT_COLOR,
          justifyContent: 'center',
          alignItems: 'center',
          focusable: true,
        },
      });
      node.on('click', () => say(`click ${label(i)}: nothing to take`));
      return node;
    });
    this.slots = this.nodes.map((node, i) =>
      carry.slot<T>(node, {
        take: (amount) => {
          const item = options.take
            ? options.take(this, i, amount)
            : this.takeAll(i);
          if (item) say(`take ${amount} from ${label(i)}`);
          this.show(i);
          return item;
        },
        put: (item, amount) => {
          const had = this.items[i] !== null;
          const rest = options.put
            ? options.put(this, i, item, amount)
            : this.swap(i, item);
          say(
            `put ${amount} in ${label(i)}${
              rest === null ? '' : had ? ', exchange' : ', some stays carried'
            }`
          );
          this.show(i);
          return rest;
        },
        accepts: options.accepts && ((item) => options.accepts!(i, item as T)),
        ghost: (item) => this.draw(item),
        enter: () => (node.style.backgroundColor = LIT_COLOR),
        leave: () => (node.style.backgroundColor = SLOT_COLOR),
      })
    );
    items.forEach((_, i) => this.show(i));
  }

  /** Puts a returned item in slot `i`, or else in the first empty slot. Returns false when full. */
  stow(item: T, i: number): boolean {
    const at = this.items[i] === null ? i : this.items.indexOf(null);
    if (at < 0) return false;
    this.items[at] = item;
    this.show(at);
    return true;
  }

  show(i: number): void {
    const item = this.items[i];
    this.nodes[i].replaceChildren(...(item ? [this.draw(item)] : []));
  }

  private draw(item: T): UINode {
    return this.options.draw(item, this.options.size ?? CONTENT);
  }

  private takeAll(i: number): T | null {
    const item = this.items[i];
    this.items[i] = null;
    return item;
  }

  private swap(i: number, item: T): T | null {
    const had = this.items[i];
    this.items[i] = item;
    return had;
  }
}

/**
 * Gives a returned item back to the group of the slot it came from, and logs
 * it. With `drop`, an item returned from outside the slots goes there instead.
 */
function returnTo(
  carry: UICarry,
  groups: Slots<any>[],
  log: (line: string) => void,
  drop?: (item: unknown) => void
): void {
  carry.onReturn = (item, from, reason) => {
    if (drop && reason === 'outside') {
      drop(item);
      log(`onReturn ${reason}: dropped ${carry.describe(item)} in the world`);
      return;
    }
    const group = groups.find((g) => g.slots.includes(from as UISlot<any>));
    const i = group ? group.slots.indexOf(from as UISlot<any>) : 0;
    const placed =
      (group?.stow(item, i) ?? false) || groups.some((g) => g.stow(item, 0));
    log(
      `onReturn ${reason}: ${carry.describe(item)} to ${from.node.name}${
        placed ? '' : ', with no room, so it is lost'
      }`
    );
  };
}

function row(style: UIStyle, ...children: UIChild[]): UINode {
  const node = new UINode({ style: { gap: 8, ...style } });
  node.append(...children);
  return node;
}

function column(style: UIStyle, ...children: UIChild[]): UINode {
  const node = new UINode({
    style: {
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 12,
      padding: 16,
      ...style,
    },
  });
  node.append(...children);
  return node;
}

/** Shapes at the given places in a list of `length` slots. */
function shapesAt(
  length: number,
  at: Record<number, number>
): (Shape | null)[] {
  return Array.from({ length }, (_, i) =>
    at[i] === undefined ? null : { kind: at[i] }
  );
}

example({
  part,
  name: 'Move',
  description:
    'Click a shape to carry it, and click an empty slot to put it down. A click on a full slot exchanges the two shapes. A click on an empty slot with nothing carried does nothing, and the slot gets the click. Enter and A do the same as a click on the focused slot.',
  log: true,
  carried: true,
  height: 200,
  build: ({ surface, carry, images, log }) => {
    surface.input = 'all';
    addShapes(images);
    carry.describe = shapeName;
    const options = { draw: drawShape, log };
    const top = new Slots(carry, shapesAt(6, { 0: 0, 1: 1, 3: 2 }), {
      ...options,
      name: 'top',
    });
    const bottom = new Slots(carry, shapesAt(6, { 2: 3, 5: 4 }), {
      ...options,
      name: 'bottom',
    });
    returnTo(carry, [top, bottom], log);
    surface.root.append(
      column({}, row({}, ...top.nodes), row({}, ...bottom.nodes))
    );
  },
});

example({
  part,
  name: 'Accepts',
  description:
    'A slot with a coloured edge takes only the shape of its colour. Over a slot that refuses, the ghost fades, the slot does not light, and a click does nothing. The plain slots take any shape.',
  log: true,
  carried: true,
  height: 200,
  build: ({ surface, carry, images, log }) => {
    surface.input = 'all';
    addShapes(images);
    carry.describe = shapeName;
    const coloured = new Slots<Shape>(carry, shapesAt(4, {}), {
      name: 'coloured',
      draw: drawShape,
      edge: (i) => SHAPE_COLORS[i] as HexColor,
      accepts: (i, item) => item.kind === i,
      log,
    });
    const plain = new Slots(
      carry,
      shapesAt(6, { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }),
      {
        name: 'plain',
        draw: drawShape,
        log,
      }
    );
    returnTo(carry, [plain, coloured], log);
    surface.root.append(
      column({}, row({}, ...coloured.nodes), row({}, ...plain.nodes))
    );
  },
});

example({
  part,
  name: 'Stacks',
  description:
    'Numbered tiles merge up to 10 in a slot. With nothing carried, the right button, Shift+Enter and X take half a stack. With a stack carried, they put one tile in, and the rest stays carried. A main click puts as many as fit. Tiles of another number exchange on a main click, and refuse one at a time.',
  log: true,
  carried: true,
  height: 200,
  build: ({ surface, carry, log }) => {
    surface.input = 'all';
    carry.describe = (item) => {
      const { n, count } = item as Tile;
      return `${count} × tile ${n}`;
    };
    const tiles = new Slots<Tile>(
      carry,
      [
        { n: 1, count: 7 },
        { n: 2, count: 4 },
        { n: 1, count: 5 },
        null,
        null,
        { n: 3, count: 10 },
      ],
      {
        name: 'slot',
        draw: drawTile,
        log,
        take: (slots, i, amount) => {
          const stack = slots.items[i];
          if (!stack) return null;
          const count =
            amount === 'half' ? Math.ceil(stack.count / 2) : stack.count;
          const left = stack.count - count;
          slots.items[i] = left ? { n: stack.n, count: left } : null;
          return { n: stack.n, count };
        },
        put: (slots, i, item, amount) => {
          const there = slots.items[i];
          if (there && there.n !== item.n) {
            if (amount === 'one') return item;
            slots.items[i] = item;
            return there;
          }
          const room = MAX_STACK - (there?.count ?? 0);
          const moved = Math.min(room, amount === 'one' ? 1 : item.count);
          if (moved > 0)
            slots.items[i] = { n: item.n, count: (there?.count ?? 0) + moved };
          const rest = item.count - moved;
          return rest ? { n: item.n, count: rest } : null;
        },
      }
    );
    returnTo(carry, [tiles], log);
    surface.root.append(column({}, row({}, ...tiles.nodes)));
  },
});

example({
  part,
  name: 'Return',
  description:
    'Slots in a modal. Escape, B and Return, which calls cancel(), put the carried shape back in its slot, and the modal stays open: a second Escape closes it. A click on the backdrop, or a right click off a slot, drops the shape in the world, and the modal stays open too. Pick up puts the dropped shapes back. Close closes the modal, and a carried shape goes back. Each line that starts with onReturn is one call, with its reason.',
  log: true,
  carried: true,
  height: 300,
  build: ({ surface, carry, images, log, createSurface }) => {
    surface.input = 'all';
    addShapes(images);
    carry.describe = shapeName;
    const modal = new Modal(
      { createSurface },
      { onClose: () => log('modal closed') }
    );
    const slots = new Slots(carry, shapesAt(5, { 0: 0, 2: 1, 3: 5 }), {
      name: 'slot',
      draw: drawShape,
      log,
    });
    const world: Shape[] = [];
    const ground = new Label({ text: '', style: { fontSize: 13 } });
    const showWorld = () =>
      (ground.text = `In the world: ${
        world.map((item) => SHAPES[item.kind]).join(', ') || 'nothing'
      }`);
    showWorld();
    returnTo(carry, [slots], log, (item) => {
      world.push(item as Shape);
      showWorld();
    });
    modal.append(
      column(
        { padding: 0 },
        row({}, ...slots.nodes),
        ground,
        row(
          {},
          new Button({
            label: 'Return',
            color: 'secondary',
            onClick: () => carry.cancel(),
          }),
          new Button({
            label: 'Pick up',
            color: 'secondary',
            onClick: () => {
              while (world.length && slots.stow(world[0], 0)) world.shift();
              showWorld();
            },
          }),
          new Button({
            label: 'Close',
            variant: 'text',
            onClick: () => {
              modal.close();
              log('modal closed');
            },
          })
        )
      )
    );
    surface.root.append(
      column(
        {},
        new Button({
          label: 'Open',
          onClick: () => {
            modal.open();
            slots.nodes[0].focus();
          },
        })
      )
    );
  },
});

example({
  part,
  name: 'Across surfaces',
  description:
    'The panel on the right is a surface of its own, over the surface of the left slots. A shape goes from one to the other both ways, and its ghost draws over both. A modal takes all input, so this panel is a plain surface: the pointer reaches the slots under it. Focus lives on the left surface, so the keys and the gamepad move only through the left slots.',
  log: true,
  carried: true,
  height: 220,
  build: ({ surface, carry, images, log, createSurface }) => {
    surface.input = 'all';
    addShapes(images);
    carry.describe = shapeName;
    const left = new Slots(carry, shapesAt(6, { 0: 0, 1: 1, 4: 2 }), {
      name: 'below',
      draw: drawShape,
      log,
    });
    const over = createSurface({
      kind: 'screen',
      name: 'panel',
      order: 1,
      input: 'nodes',
    });
    const right = new Slots(carry, shapesAt(4, { 1: 3, 2: 4 }), {
      name: 'panel',
      draw: drawShape,
      log,
    });
    returnTo(carry, [left, right], log);
    surface.root.append(
      column(
        {},
        row({ flexWrap: 'wrap', width: 3 * SLOT + 2 * 8 }, ...left.nodes)
      )
    );
    over.root.style.justifyContent = 'flex-end';
    over.root.style.alignItems = 'flex-start';
    over.root.append(
      column(
        {
          margin: 16,
          padding: 12,
          borderRadius: 12,
          backgroundColor: '#262a31',
          borderWidth: 1,
          borderColor: '#4a5563',
        },
        new UINode({ text: 'A panel surface', style: { fontSize: 14 } }),
        row({ flexWrap: 'wrap', width: 2 * SLOT + 8 }, ...right.nodes)
      )
    );
  },
});

example({
  part,
  name: 'Together',
  description:
    'A grid of slots over a framed panel image, in a modal. The grid draws the slots on the image, and the ghost draws over the modal. The arrow keys and the d-pad move through the cells while a shape is carried.',
  log: true,
  carried: true,
  height: 360,
  build: ({ surface, carry, images, log, createSurface }) => {
    surface.input = 'all';
    addShapes(images);
    images.add('panel', panel());
    carry.describe = shapeName;
    const modal = new Modal(
      { createSurface },
      { onClose: () => log('modal closed') }
    );
    const slots = new Slots(
      carry,
      shapesAt(15, { 0: 0, 3: 1, 6: 2, 8: 3, 11: 4, 14: 5 }),
      { name: 'cell', draw: drawShape, size: 38, log }
    );
    returnTo(carry, [slots], log);
    const grid = new Grid({
      columns: 5,
      rows: 3,
      cellSize: 52,
      gap: 8,
      style: { position: 'absolute', top: 34, left: 34 },
      cell: (_column, _row, index) => slots.nodes[index],
    });
    const backing = new Image({
      image: 'panel',
      style: { width: 360, height: 240 },
    });
    backing.node.append(grid);
    modal.append(backing);
    surface.root.append(
      column(
        {},
        new Button({
          label: 'Open',
          onClick: () => {
            modal.open();
            slots.nodes[0].focus();
          },
        })
      )
    );
  },
});
