import { UINode, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Transitions';

function box(style: UIStyle, ...children: UINode[]): UINode {
  const node = new UINode({ style });
  node.append(...children);
  return node;
}

function label(text: string, style: UIStyle = {}): UINode {
  return new UINode({
    text,
    style: { fontSize: 14, pointerEvents: 'none', ...style },
  });
}

/** A button that lights on hover and shrinks a little while pressed. */
function button(text: string): UINode {
  const node = box(
    {
      padding: [8, 16, 8, 16],
      borderRadius: 6,
      backgroundColor: 'primary500',
      transition: [
        { property: 'backgroundColor', duration: 150 },
        { property: 'transform', duration: 100, easing: 'ease-out' },
      ],
    },
    label(text, { color: 'onPrimary500' })
  );
  const pressed = { scale: 0.95 };
  node.on('pointerenter', () => (node.style.backgroundColor = 'primary400'));
  node.on('pointerleave', () => {
    node.style.backgroundColor = 'primary500';
    node.style.transform = undefined;
  });
  node.on('pointerdown', () => (node.style.transform = pressed));
  node.on('pointerup', () => (node.style.transform = undefined));
  return node;
}

example({
  part,
  name: 'Hover and press',
  description:
    'The colour eases on hover, and the button shrinks while pressed. The DOM side follows the Mica side, with the same CSS transitions.',
  height: 120,
  build: ({ surface }) => {
    surface.root.append(
      box(
        { position: 'absolute', left: 24, top: 32, gap: 12 },
        button('Resume'),
        button('Settings'),
        button('Quit')
      )
    );
  },
});

example({
  part,
  name: 'Fade and slide',
  description:
    'Click the buttons. The panel fades over 300 ms and slides over 500 ms. A click in the middle of a transition turns it round from where it is, with no jump.',
  height: 200,
  build: ({ surface }) => {
    const panel = box(
      {
        position: 'absolute',
        left: 24,
        top: 80,
        width: 160,
        height: 90,
        borderRadius: 12,
        backgroundColor: 'secondary400',
        transition: [
          { property: 'opacity', duration: 300 },
          { property: 'transform', duration: 500, easing: 'ease-in-out' },
        ],
      },
      label('Panel', { margin: 12, color: 'onSecondary400' })
    );
    const fade = button('Fade');
    fade.on('click', () => {
      panel.style.opacity = panel.style.opacity === 0.2 ? 1 : 0.2;
    });
    const slide = button('Slide');
    slide.on('click', () => {
      panel.style.transform = panel.style.transform ? undefined : { x: 220 };
    });
    surface.root.append(
      box({ position: 'absolute', left: 24, top: 16, gap: 12 }, fade, slide),
      panel
    );
  },
});
