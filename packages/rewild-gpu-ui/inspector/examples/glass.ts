import { glassSurface, UINode, UIStyle } from '../../lib';
import { example } from '../registry';

const part = 'Glass';

function box(style: UIStyle, ...children: UINode[]): UINode {
  const node = new UINode({ style });
  node.append(...children);
  return node;
}

function text(text: string, style: UIStyle = {}): UINode {
  return new UINode({ text, style });
}

/** The DOM modal's glass: its edge, its radius and its shadows. */
const MODAL: UIStyle = {
  ...glassSurface(),
  borderWidth: 1,
  borderColor: 'glassEdge',
  borderRadius: 14,
  boxShadow: [
    { y: 30, blur: 80, color: '#00000059' },
    { inset: true, y: 1, color: '#ffffff14' },
  ],
};

example({
  part,
  name: 'Glass panel',
  description:
    "The DOM modal's frosted glass over the test image: the surface colour at 60 %, a blur of 18 px, saturation at 150 %, a 1 px edge and a shadow. Switch the theme and the pixel ratio: both sides should match.",
  height: 320,
  backdrop: true,
  build: ({ surface }) => {
    surface.root.append(
      box(
        {
          ...MODAL,
          position: 'absolute',
          left: 40,
          top: 40,
          width: 300,
          flexDirection: 'column',
          gap: 8,
          padding: 16,
        },
        text('Frosted glass', {
          color: 'onSurface',
          fontSize: 20,
          fontWeight: 'bold',
        }),
        text(
          'What is behind the panel shows through, blurred, with its colours raised.',
          { color: 'onSurfaceLight', fontSize: 14 }
        )
      )
    );
  },
});

example({
  part,
  name: 'Glass opacity and shape',
  description:
    'The surface colour at 60 % and 85 %, as the DOM modal and the select list use it, a round pill, and a glass panel with half its opacity.',
  height: 240,
  backdrop: true,
  build: ({ surface }) => {
    const panel = (style: UIStyle) =>
      box({
        position: 'absolute',
        top: 30,
        width: 140,
        height: 120,
        borderWidth: 1,
        borderColor: 'glassEdge',
        borderRadius: 10,
        ...style,
      });
    surface.root.append(
      panel({ ...glassSurface(0.6), left: 24 }),
      panel({ ...glassSurface(0.85), left: 184 }),
      panel({
        ...glassSurface(0.6),
        left: 344,
        height: 48,
        borderRadius: 24,
      }),
      panel({ ...glassSurface(0.6), left: 344, top: 100, opacity: 0.5 })
    );
  },
});
