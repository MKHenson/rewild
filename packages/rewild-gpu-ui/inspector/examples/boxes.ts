import { UINode, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Boxes';

function box(style: UIStyle, ...children: UINode[]): UINode {
  const node = new UINode({ style: { position: 'absolute', ...style } });
  node.append(...children);
  return node;
}

example({
  part,
  name: 'Backgrounds and borders',
  description:
    'Fills, borders of 1, 4 and 12 px, a border with no fill, and a see-through border over its fill.',
  build: ({ surface }) => {
    surface.root.append(
      box({
        left: 16,
        top: 16,
        width: 100,
        height: 80,
        backgroundColor: '#1a5c8e',
      }),
      box({
        left: 132,
        top: 16,
        width: 100,
        height: 80,
        backgroundColor: '#2d8f92',
        borderWidth: 1,
        borderColor: '#ffffff',
      }),
      box({
        left: 248,
        top: 16,
        width: 100,
        height: 80,
        backgroundColor: '#d8942d',
        borderWidth: 4,
        borderColor: '#641111',
      }),
      box({
        left: 16,
        top: 120,
        width: 100,
        height: 80,
        borderWidth: 4,
        borderColor: '#00b959',
      }),
      box({
        left: 132,
        top: 120,
        width: 100,
        height: 80,
        backgroundColor: '#972222',
        borderWidth: 12,
        borderColor: '#ffffff80',
      })
    );
  },
});

example({
  part,
  name: 'Corner radius',
  description:
    'One radius, one per corner, a pill whose radius is too large and is scaled down, and a thick border with a smaller inner radius.',
  build: ({ surface }) => {
    surface.root.append(
      box({
        left: 16,
        top: 16,
        width: 100,
        height: 80,
        backgroundColor: '#1a5c8e',
        borderRadius: 12,
      }),
      box({
        left: 132,
        top: 16,
        width: 100,
        height: 80,
        backgroundColor: '#2d8f92',
        borderRadius: [0, 24, 8, 40],
      }),
      box({
        left: 248,
        top: 16,
        width: 160,
        height: 32,
        backgroundColor: '#d8942d',
        borderRadius: 999,
      }),
      box({
        left: 16,
        top: 120,
        width: 100,
        height: 100,
        backgroundColor: '#e2e2e2',
        borderWidth: 16,
        borderColor: '#811a1a',
        borderRadius: 24,
      }),
      box({
        left: 132,
        top: 120,
        width: 100,
        height: 100,
        backgroundColor: '#00b959',
        borderWidth: 2,
        borderColor: '#005328',
        borderRadius: 50,
      })
    );
  },
});

example({
  part,
  name: 'Clipping',
  description:
    'Children of a box with hidden overflow are clipped to the inside of its border, with its corner radius. The right box nests one clip in another.',
  height: 260,
  build: ({ surface }) => {
    surface.root.append(
      box(
        {
          left: 16,
          top: 16,
          width: 180,
          height: 140,
          backgroundColor: '#1a5c8e',
          borderWidth: 4,
          borderColor: '#ffffff',
          borderRadius: 32,
          overflow: 'hidden',
        },
        box({
          left: -20,
          top: -20,
          width: 80,
          height: 80,
          backgroundColor: '#d8942d',
        }),
        box({
          right: -20,
          bottom: 20,
          width: 120,
          height: 40,
          backgroundColor: '#00b959',
        })
      ),
      box(
        {
          left: 220,
          top: 16,
          width: 200,
          height: 200,
          backgroundColor: '#2d8f92',
          overflow: 'hidden',
        },
        box(
          {
            left: 40,
            top: 40,
            width: 200,
            height: 120,
            backgroundColor: '#641111',
            borderRadius: 16,
            overflow: 'hidden',
          },
          box({
            left: 20,
            top: 60,
            width: 220,
            height: 30,
            backgroundColor: '#e2e2e2',
          })
        )
      ),
      box(
        { left: 16, top: 180, width: 180, height: 60, overflow: 'hidden' },
        box({
          left: 120,
          top: 10,
          width: 120,
          height: 40,
          backgroundColor: '#972222',
          borderRadius: 20,
        })
      )
    );
  },
});

example({
  part,
  name: 'Absolute position',
  description:
    'Boxes pinned to each corner, a box stretched by left and right, and percentage sizes. Resize the window to see them follow.',
  build: ({ surface }) => {
    const anchor = (style: UIStyle) =>
      box({ width: 40, height: 40, backgroundColor: '#d8942d', ...style });
    surface.root.append(
      anchor({ left: 8, top: 8 }),
      anchor({ right: 8, top: 8 }),
      anchor({ right: 8, bottom: 8 }),
      anchor({ left: 8, bottom: 8 }),
      box({
        left: 64,
        right: 64,
        top: 8,
        height: 24,
        backgroundColor: '#1a5c8e',
        borderRadius: 12,
      }),
      box(
        {
          left: '30%',
          top: '30%',
          width: '40%',
          height: '40%',
          backgroundColor: '#2d8f92',
          borderWidth: 8,
          borderColor: '#005328',
        },
        box({
          left: '10%',
          top: '10%',
          width: '50%',
          height: '50%',
          backgroundColor: '#e2e2e2',
        })
      )
    );
  },
});

example({
  part,
  name: 'Tree order and opacity',
  description:
    'Later siblings draw on top. Opacity on a box with no children, at 1, 0.75, 0.5 and 0.25.',
  build: ({ surface }) => {
    const colours = ['#972222', '#d8942d', '#00b959', '#1a5c8e'] as const;
    surface.root.append(
      ...colours.map((backgroundColor, i) =>
        box({
          left: 16 + i * 30,
          top: 16 + i * 20,
          width: 100,
          height: 80,
          backgroundColor,
          borderRadius: 8,
        })
      ),
      ...colours.map((backgroundColor, i) =>
        box({
          left: 260 + i * 30,
          top: 16 + i * 20,
          width: 100,
          height: 80,
          backgroundColor,
          borderRadius: 8,
          opacity: 1 - i * 0.25,
        })
      )
    );
  },
});

example({
  part,
  name: 'Hairlines',
  description:
    '1 px borders and 1 px tall boxes. Switch the pixel ratio: each line should stay sharp, with no blur at the edges.',
  height: 160,
  build: ({ surface }) => {
    surface.root.append(
      ...[0, 4, 8, 16].map((radius, i) =>
        box({
          left: 16 + i * 96,
          top: 16,
          width: 80,
          height: 60,
          borderWidth: 1,
          borderColor: '#999999',
          borderRadius: radius,
        })
      ),
      ...[0, 1, 2, 3].map((i) =>
        box({
          left: 16,
          right: 16,
          top: 96 + i * 12,
          height: i + 1,
          backgroundColor: '#999999',
        })
      )
    );
  },
});
