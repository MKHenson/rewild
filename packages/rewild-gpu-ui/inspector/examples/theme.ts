import { UINode, UIStyle, UIThemeColor } from '../../lib';
import { example } from '../registry';

const part = 'Theme';

function box(style: UIStyle, ...children: UINode[]): UINode {
  const node = new UINode({ style });
  node.append(...children);
  return node;
}

function text(text: string, style: UIStyle = {}): UINode {
  return new UINode({ text, style: { fontSize: 13, ...style } });
}

example({
  part,
  name: 'Theme colours',
  description:
    'Boxes and text in theme colours, read from style.css. Switch the theme on the left: both sides change.',
  height: 200,
  build: ({ surface }) => {
    const swatch = (fill: UIThemeColor, on: UIThemeColor) =>
      box(
        {
          width: 96,
          height: 48,
          padding: 8,
          borderRadius: 6,
          backgroundColor: fill,
        },
        text(fill, { color: on })
      );
    surface.root.append(
      box(
        {
          position: 'absolute',
          left: 16,
          top: 16,
          right: 16,
          flexDirection: 'column',
          gap: 12,
          padding: 16,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: 'onSurfaceBorder',
          backgroundColor: 'background',
        },
        box(
          { gap: 8, flexWrap: 'wrap' },
          swatch('primary400', 'onPrimary400'),
          swatch('secondary400', 'onSecondary400'),
          swatch('error400', 'onError400'),
          swatch('warning400', 'onWarning400'),
          swatch('subtle500', 'onSubtle')
        ),
        text('Text on the background', { color: 'onBackground', fontSize: 16 }),
        text('A lighter line of text', { color: 'onSurfaceLight' })
      )
    );
  },
});
