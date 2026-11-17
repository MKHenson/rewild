import { UIColor, UINode, UIPointerEvent, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Events';

function box(style: UIStyle, ...children: UINode[]): UINode {
  const node = new UINode({ style });
  node.append(...children);
  return node;
}

/** Lights the node while the pointer is over it, and more while it is down. */
function hoverable(
  node: UINode,
  color: UIColor,
  hover: UIColor,
  press: UIColor
) {
  node.style.backgroundColor = color;
  node.on('pointerenter', () => (node.style.backgroundColor = hover));
  node.on('pointerleave', () => (node.style.backgroundColor = color));
  node.on('pointerdown', () => (node.style.backgroundColor = press));
  node.on('pointerup', () => (node.style.backgroundColor = hover));
  return node;
}

function label(text: string, style: UIStyle = {}): UINode {
  return new UINode({
    text,
    style: { fontSize: 13, pointerEvents: 'none', ...style },
  });
}

function where(e: UIPointerEvent): string {
  return `(${Math.round(e.x)}, ${Math.round(e.y)})`;
}

example({
  part,
  name: 'Bubbling',
  description:
    'A click on a button bubbles to the panels that hold it. "Stop" stops it at the button. A click on the panels does not reach the page, and a click outside them does: a DOM listener on the canvas stands in for the game.',
  log: true,
  height: 220,
  build: ({ surface, canvas, log }) => {
    const go = hoverable(
      box({ padding: [8, 16, 8, 16], borderRadius: 6 }, label('Bubble')),
      '#2f6ea8',
      '#3d86c9',
      '#24567f'
    );
    const stop = hoverable(
      box({ padding: [8, 16, 8, 16], borderRadius: 6 }, label('Stop')),
      '#a8452f',
      '#c9573d',
      '#7f3424'
    );
    stop.on('click', (e) => e.stopPropagation());
    const inner = box(
      {
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        borderRadius: 10,
        backgroundColor: '#3a3f4a',
      },
      label('Inner panel'),
      box({ gap: 8 }, go, stop)
    );
    const outer = box(
      {
        position: 'absolute',
        left: 16,
        top: 16,
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        borderRadius: 14,
        backgroundColor: '#262a31',
      },
      label('Outer panel'),
      inner
    );
    surface.root.append(outer);

    const names = new Map([
      [go, 'Bubble'],
      [stop, 'Stop'],
      [inner, 'inner'],
      [outer, 'outer'],
    ]);
    for (const [node, name] of names)
      node.on('click', (e) =>
        log(`click on ${name}, target ${names.get(e.target!) ?? 'root'}`)
      );
    canvas.addEventListener('click', () =>
      log('The page got the click, as the game would')
    );
  },
});

example({
  part,
  name: 'Hit test',
  description:
    'Each shape lights only where it draws. The round corners and the circle miss outside their curves. The wide child is clipped by its rounded parent, so it lights only inside the parent.',
  height: 180,
  build: ({ surface }) => {
    const shapes = [
      box({ width: 120, height: 120, borderRadius: [40, 0, 40, 0] }),
      box({ width: 120, height: 120, borderRadius: 60 }),
    ].map((node) => hoverable(node, '#2f6ea8', '#5fa8e8', '#24567f'));
    const clipped = hoverable(
      box({ position: 'absolute', left: -40, top: 30, width: 200, height: 60 }),
      '#2d8f92',
      '#5fd0d3',
      '#1f6466'
    );
    const parent = hoverable(
      box(
        {
          width: 120,
          height: 120,
          borderRadius: 30,
          borderWidth: 6,
          borderColor: '#ffffff',
          overflow: 'hidden',
        },
        clipped
      ),
      '#3a3f4a',
      '#565d6b',
      '#2a2e36'
    );
    surface.root.append(
      box({ padding: 24, gap: 32, alignItems: 'flex-start' }, ...shapes, parent)
    );
  },
});

/** A handle on a track that follows the pointer while it is down. */
function slider(capture: boolean, log: (line: string) => void): UINode {
  const handle = box({
    position: 'absolute',
    top: -8,
    left: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  });
  const track = box(
    {
      width: 260,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#3a3f4a',
    },
    handle
  );
  let dragging = false;
  const moveTo = (x: number) => {
    const left = x - track.rect.x - 12;
    handle.style.left = Math.max(-12, Math.min(260 - 12, left));
  };
  handle.on('pointerdown', (e) => {
    dragging = true;
    if (capture) handle.setPointerCapture(e.pointerId);
  });
  handle.on('pointermove', (e) => {
    if (dragging) moveTo(e.x);
  });
  handle.on('pointerup', () => (dragging = false));
  handle.on('pointerleave', () => {
    if (dragging && !capture) {
      dragging = false;
      log('The handle lost the pointer');
    }
  });
  handle.on('pointercancel', () => (dragging = false));
  return track;
}

example({
  part,
  name: 'Pointer capture',
  description:
    'Drag each handle. The top one captures the pointer, so it follows a drag off its track and off the canvas. The bottom one does not, so it stops when the pointer leaves it.',
  log: true,
  height: 160,
  build: ({ surface, log }) => {
    surface.root.append(
      box(
        { flexDirection: 'column', padding: 32, gap: 48 },
        slider(true, log),
        slider(false, log)
      )
    );
  },
});

example({
  part,
  name: 'Wheel and keys',
  description:
    'This surface takes all input. The wheel scrolls the list and does not scroll the page. Keys go to the root while the canvas or the page has focus. Click the canvas, then type.',
  log: true,
  height: 200,
  build: ({ surface, log }) => {
    surface.input = 'all';
    const items = Array.from({ length: 20 }, (_, i) =>
      hoverable(
        box(
          { padding: [6, 10, 6, 10], borderRadius: 4 },
          label(`Item ${i + 1}`)
        ),
        '#262a31',
        '#3a3f4a',
        '#1c1f24'
      )
    );
    const content = box(
      {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        flexDirection: 'column',
        gap: 4,
      },
      ...items
    );
    const list = box(
      {
        position: 'absolute',
        left: 16,
        top: 16,
        bottom: 16,
        width: 200,
        padding: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#565d6b',
        overflow: 'hidden',
      },
      content
    );
    surface.root.append(list);

    let scroll = 0;
    list.on('wheel', (e) => {
      e.preventDefault();
      const max = Math.max(0, content.rect.height - list.rect.height + 10);
      scroll = Math.max(0, Math.min(max, scroll + e.deltaY));
      content.style.top = -scroll;
    });
    surface.root.on('keydown', (e) => {
      log(`keydown ${e.key} (${e.code})${e.repeat ? ', repeat' : ''}`);
      // Tab stays in the example, the same as a menu that holds focus.
      if (e.key === 'Tab') e.preventDefault();
    });
    surface.root.on('keyup', (e) => log(`keyup ${e.key}`));
    surface.root.on('click', (e) => log(`click at ${where(e)}`));
  },
});
