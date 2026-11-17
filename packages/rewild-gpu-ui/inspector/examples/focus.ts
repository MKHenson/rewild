import { UINode, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Focus';

function box(style: UIStyle, ...children: UINode[]): UINode {
  const node = new UINode({ style });
  node.append(...children);
  return node;
}

/** A focusable button that lights while the pointer is over it. */
function button(text: string, style: UIStyle = {}): UINode {
  const node = box(
    {
      padding: [8, 16, 8, 16],
      borderRadius: 6,
      justifyContent: 'center',
      backgroundColor: '#2f6ea8',
      focusable: true,
      ...style,
    },
    new UINode({ text, style: { fontSize: 14, pointerEvents: 'none' } })
  );
  node.on('pointerenter', () => (node.style.backgroundColor = '#3d86c9'));
  node.on('pointerleave', () => (node.style.backgroundColor = '#2f6ea8'));
  return node;
}

example({
  part,
  name: 'A grid of buttons',
  description:
    'Click the canvas, then move with the arrow keys, Tab and Shift+Tab, and click with Enter. A gamepad does the same with its d-pad or left stick, and A. The ring shows for keys and the gamepad, not for a click.',
  log: true,
  height: 200,
  build: ({ surface, log }) => {
    surface.input = 'all';
    const names = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven'];
    const buttons = names.map((name) => button(name, { width: 96 }));
    for (const [i, node] of buttons.entries()) {
      node.on('focus', () => log(`focus ${names[i]}`));
      node.on('click', (e) =>
        log(`click ${names[i]} by ${e.pointerType || 'key or gamepad'}`)
      );
    }
    // Rows of three, with a wide button last, so moves must pick by place.
    surface.root.append(
      box(
        { flexDirection: 'column', gap: 12, padding: 24 },
        box({ gap: 12 }, ...buttons.slice(0, 3)),
        box({ gap: 12 }, ...buttons.slice(3, 6)),
        box({ gap: 12 }, button('Wide', { width: 312 }))
      )
    );
  },
});

example({
  part,
  name: 'A dialog that closes on Escape or B',
  description:
    'The dialog is a surface over the menu, so focus stays in it. Escape, B, Cancel or a click outside the panel closes it, and focus goes back to "Open dialog".',
  log: true,
  height: 240,
  build: ({ surface, log, createSurface }) => {
    surface.input = 'all';
    const open = button('Open dialog');
    surface.root.append(
      box(
        { flexDirection: 'column', gap: 12, padding: 24, width: 200 },
        button('Resume'),
        open,
        button('Quit')
      )
    );

    const dialog = createSurface({
      kind: 'screen',
      name: 'dialog',
      order: 1,
      input: 'all',
    });
    const ok = button('OK');
    const cancel = button('Cancel', { backgroundColor: '#3a3f4a' });
    cancel.on('pointerleave', () => (cancel.style.backgroundColor = '#3a3f4a'));
    dialog.root.style.display = 'none';
    dialog.root.style.backgroundColor = '#00000099';
    dialog.root.style.justifyContent = 'center';
    dialog.root.style.alignItems = 'center';
    dialog.root.append(
      box(
        {
          flexDirection: 'column',
          gap: 16,
          padding: 20,
          borderRadius: 12,
          backgroundColor: '#262a31',
        },
        new UINode({ text: 'Leave the level?', style: { fontSize: 16 } }),
        box({ gap: 12 }, ok, cancel)
      )
    );

    const close = (why: string) => {
      dialog.root.style.display = 'none';
      log(`closed by ${why}`);
    };
    open.on('click', (e) => {
      dialog.root.style.display = 'flex';
      // A key or the gamepad opened it, so the ring shows on OK.
      ok.focus({ focusVisible: e.pointerType === '' });
      log('opened');
    });
    ok.on('click', () => close('OK'));
    cancel.on('click', () => close('Cancel'));
    dialog.root.on('click', (e) => {
      if (e.target === dialog.root) close('a click outside');
    });
    dialog.root.on('keydown', (e) => {
      if (e.key === 'Escape') close(e.code === 'GamepadB' ? 'B' : 'Escape');
    });
  },
});
