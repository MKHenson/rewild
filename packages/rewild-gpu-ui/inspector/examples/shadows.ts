import { UINode, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Shadows';

function box(style: UIStyle): UINode {
  return new UINode({
    style: {
      position: 'absolute',
      width: 100,
      height: 70,
      backgroundColor: '#e2e6eb',
      ...style,
    },
  });
}

example({
  part,
  name: 'Outer shadows',
  description:
    'Blur radii of 0, 8 and 24 px, an offset, a spread, a negative spread and a round box. The blur is a Gaussian with half the radius as its deviation, as in CSS.',
  height: 280,
  build: ({ surface }) => {
    surface.root.append(
      box({ left: 24, top: 24, boxShadow: { x: 6, y: 6, color: '#000000a0' } }),
      box({
        left: 164,
        top: 24,
        boxShadow: { blur: 8, color: '#000000c0' },
      }),
      box({
        left: 304,
        top: 24,
        boxShadow: { y: 12, blur: 24, color: '#000000c0' },
      }),
      box({
        left: 24,
        top: 150,
        boxShadow: { blur: 10, spread: 8, color: '#3a86cfc0' },
      }),
      box({
        left: 164,
        top: 150,
        boxShadow: { y: 16, blur: 16, spread: -8, color: '#000000e0' },
      }),
      box({
        left: 304,
        top: 150,
        borderRadius: 35,
        boxShadow: { y: 8, blur: 20, color: '#000000c0' },
      })
    );
  },
});

example({
  part,
  name: 'Corners and see-through boxes',
  description:
    'A radius per corner grows with the spread, and a square corner stays square. A see-through box does not show its shadow, because CSS draws an outer shadow only outside the box.',
  height: 200,
  build: ({ surface }) => {
    surface.root.append(
      box({
        left: 24,
        top: 40,
        borderRadius: [0, 24, 8, 40],
        boxShadow: { blur: 4, spread: 10, color: '#d8942d' },
      }),
      box({
        left: 180,
        top: 40,
        backgroundColor: '#e2e6eb40',
        borderWidth: 1,
        borderColor: '#e2e6eb',
        borderRadius: 12,
        boxShadow: { x: 10, y: 10, blur: 6, color: '#000000ff' },
      }),
      box({
        left: 320,
        top: 40,
        borderRadius: 12,
        boxShadow: [
          { y: 2, blur: 4, color: '#ffffffa0' },
          { y: 16, blur: 32, spread: 4, color: '#972222' },
        ],
      })
    );
  },
});

example({
  part,
  name: 'Inset shadows',
  description:
    'An inset shadow draws inside the padding box, over the background and under the border. A 1 px line at the top, a soft inner glow, and an offset inset shadow in a bordered round box.',
  height: 160,
  build: ({ surface }) => {
    surface.root.append(
      box({
        left: 24,
        top: 40,
        backgroundColor: '#1c2127',
        borderRadius: 14,
        boxShadow: { inset: true, y: 1, color: '#ffffff40' },
      }),
      box({
        left: 164,
        top: 40,
        backgroundColor: '#1c2127',
        boxShadow: { inset: true, blur: 20, spread: 2, color: '#3a86cf' },
      }),
      box({
        left: 304,
        top: 40,
        borderWidth: 6,
        borderColor: '#641111',
        borderRadius: 24,
        boxShadow: { inset: true, x: 8, y: 8, blur: 8, color: '#000000c0' },
      })
    );
  },
});
