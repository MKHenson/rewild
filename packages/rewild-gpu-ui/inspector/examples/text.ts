import { UINode, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Text';

function text(value: string, style: UIStyle = {}): UINode {
  return new UINode({ text: value, style });
}

function column(style: UIStyle, ...children: UINode[]): UINode {
  const node = new UINode({
    style: { flexDirection: 'column', alignItems: 'flex-start', ...style },
  });
  node.append(...children);
  return node;
}

const PARAGRAPH =
  'The portal hums as you come near. Its light falls on the moss, and the air smells of rain and old stone.';

example({
  part,
  name: 'Sizes and weights',
  description:
    'Regular and bold from 12 px to 48 px. Text must be sharp at each size and at each pixel ratio.',
  height: 280,
  build: ({ surface }) => {
    const sizes = [12, 16, 24, 48];
    surface.root.append(
      column(
        { padding: 16, gap: 6 },
        ...sizes.map((fontSize) => text(`${fontSize} px Roboto: AV To Wa`, { fontSize })),
        ...sizes.map((fontSize) =>
          text(`${fontSize} px bold`, { fontSize, fontWeight: 'bold' })
        )
      )
    );
  },
});

example({
  part,
  name: 'Wrapping',
  description:
    'A paragraph wraps at spaces in a 260 px box with padding, and sets the box height. Beside it, labels size their own boxes.',
  height: 220,
  build: ({ surface }) => {
    const box = text(PARAGRAPH, {
      width: 260,
      padding: [8, 12, 8, 12],
      backgroundColor: '#1a5c8e',
      borderRadius: 8,
      lineHeight: 1.4,
    });
    const labels = column(
      { gap: 8 },
      ...['Resume', 'Settings', 'Quit to the main menu'].map((label) =>
        text(label, {
          padding: [6, 12, 6, 12],
          backgroundColor: '#2d8f92',
          borderRadius: 6,
          fontWeight: 'bold',
        })
      )
    );
    const row = new UINode({
      style: { padding: 16, gap: 24, alignItems: 'flex-start' },
    });
    row.append(box, labels);
    surface.root.append(row);
  },
});

example({
  part,
  name: 'Alignment and line height',
  description:
    'Left, centre and right alignment, then line heights of 1, normal and 1.6. Each box is 180 px wide.',
  height: 300,
  build: ({ surface }) => {
    const cell = (style: UIStyle) =>
      text('Light on the moss, rain on old stone.', {
        width: 180,
        padding: 6,
        backgroundColor: '#24323f',
        ...style,
      });
    const row = (...children: UINode[]) => {
      const node = new UINode({ style: { gap: 12, alignItems: 'flex-start' } });
      node.append(...children);
      return node;
    };
    surface.root.append(
      column(
        { padding: 16, gap: 12 },
        row(
          cell({ textAlign: 'left' }),
          cell({ textAlign: 'center' }),
          cell({ textAlign: 'right' })
        ),
        row(
          cell({ lineHeight: 1 }),
          cell({ lineHeight: 'normal' }),
          cell({ lineHeight: 1.6 })
        )
      )
    );
  },
});

example({
  part,
  name: 'Overflow',
  description:
    'Lines too long for a 200 px box: an ellipsis, a clip, text that spills out with overflow visible, a long word on its own line, and kept line breaks.',
  height: 300,
  build: ({ surface }) => {
    const box: UIStyle = {
      width: 200,
      padding: 6,
      backgroundColor: '#24323f',
    };
    const long = 'Quit to the main menu and lose this run';
    surface.root.append(
      column(
        { padding: 16, gap: 10 },
        text(long, {
          ...box,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }),
        text(long, { ...box, whiteSpace: 'nowrap', overflow: 'hidden' }),
        text(long, { ...box, whiteSpace: 'nowrap', color: '#f2991a' }),
        text('An extraordinarily_long_identifier wraps', box),
        text('Health\nHunger\n\nOxygen', { ...box, whiteSpace: 'pre-line' })
      )
    );
  },
});

example({
  part,
  name: 'Characters',
  description:
    'Latin-1 and common symbols. A character the font does not have draws as "?".',
  height: 200,
  build: ({ surface }) => {
    surface.root.append(
      column(
        { padding: 16, gap: 8 },
        text('Ça déjà vu: naïve café, Øresund, Straße, ¿qué?', { fontSize: 20 }),
        text('“Quotes” ‘and’ dashes – — bullets • 50 € 20 °C ± 3 × 4 ½ ™ ©', {
          fontSize: 20,
        }),
        text('Missing: 日本 → ?', { fontSize: 20, color: '#f2991a' })
      )
    );
  },
});
