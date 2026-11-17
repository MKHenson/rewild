import { Icon, UI_ICON_NAMES, UIChild, UINode, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Icons';

function row(style: UIStyle, ...children: UIChild[]): UINode {
  const node = new UINode({ style: { alignItems: 'center', ...style } });
  node.append(...children);
  return node;
}

function column(style: UIStyle, ...children: UIChild[]): UINode {
  const node = new UINode({
    style: { flexDirection: 'column', alignItems: 'flex-start', ...style },
  });
  node.append(...children);
  return node;
}

example({
  part,
  name: 'Sizes',
  description:
    'The settings icon from 12 px to 96 px. It must be sharp at each size and at each pixel ratio, and match the lucide SVG on the DOM side.',
  height: 140,
  build: ({ surface }) => {
    surface.root.append(
      row(
        { padding: 16, gap: 16 },
        ...[12, 16, 18, 24, 32, 48, 96].map(
          (size) => new Icon({ icon: 'settings', size })
        )
      )
    );
  },
});

example({
  part,
  name: 'Every icon',
  description:
    'Each icon in the atlas at 24 px and 48 px. To add one, add its lucide name to lib/iconNames.ts and run "npm run ui-icons".',
  height: 150,
  build: ({ surface }) => {
    surface.root.append(
      column(
        { padding: 16, gap: 12 },
        row({ gap: 16 }, ...UI_ICON_NAMES.map((icon) => new Icon({ icon }))),
        row(
          { gap: 16 },
          ...UI_ICON_NAMES.map((icon) => new Icon({ icon, size: 48 }))
        )
      )
    );
  },
});

example({
  part,
  name: 'Tints',
  description:
    'Icons tint like text. The first row takes its colour from its parent. The second sets a colour on each icon. The last icon is at half opacity.',
  height: 130,
  build: ({ surface }) => {
    const colors = ['#4dd926', '#f2991a', '#73ccff', '#ff4d4d'] as const;
    surface.root.append(
      column(
        { padding: 16, gap: 12 },
        row(
          { gap: 12, color: '#f2991a' },
          ...UI_ICON_NAMES.map((icon) => new Icon({ icon, size: 32 }))
        ),
        row(
          { gap: 12 },
          ...colors.map(
            (color) => new Icon({ icon: 'settings', size: 32, color })
          ),
          new Icon({ icon: 'settings', size: 32, style: { opacity: 0.5 } })
        )
      )
    );
  },
});

example({
  part,
  name: 'With text',
  description:
    'Icons beside labels, as in a button. Each icon is centred on its label in a flex row. The last one has a box larger than its icon, which centres in the content box.',
  height: 170,
  build: ({ surface }) => {
    const button = (icon: Icon, label: string, fontSize = 16) =>
      row(
        {
          gap: 8,
          padding: [8, 14, 8, 12],
          backgroundColor: '#24323f',
          borderRadius: 6,
          fontSize,
        },
        icon,
        new UINode({ text: label })
      );
    surface.root.append(
      column(
        { padding: 16, gap: 10 },
        row(
          { gap: 10 },
          button(new Icon({ icon: 'play', size: 18 }), 'Resume'),
          button(new Icon({ icon: 'settings', size: 18 }), 'Settings'),
          button(new Icon({ icon: 'x', size: 18 }), 'Quit')
        ),
        button(new Icon({ icon: 'info', size: 24 }), 'Larger text', 22),
        button(
          new Icon({
            icon: 'chevron-down',
            style: {
              width: 40,
              height: 24,
              padding: 2,
              backgroundColor: '#1a5c8e',
            },
          }),
          'A wide box'
        )
      )
    );
  },
});

example({
  part,
  name: 'Clipped',
  description:
    'An icon larger than a rounded box with overflow hidden is clipped to the inside of its border.',
  height: 130,
  build: ({ surface }) => {
    const box = new UINode({
      style: {
        width: 80,
        height: 80,
        overflow: 'hidden',
        borderRadius: 24,
        borderWidth: 2,
        borderColor: '#73ccff',
        backgroundColor: '#24323f',
        justifyContent: 'center',
        alignItems: 'center',
      },
    });
    box.append(new Icon({ icon: 'settings', size: 120 }));
    surface.root.append(row({ padding: 16 }, box));
  },
});
