import {
  Button,
  fetchImage,
  Icon,
  Image,
  Label,
  UIChild,
  UIImages,
  UINode,
  UIObjectFit,
  UIStyle,
} from '../../lib';
import { testImage } from '../backdropImage';
import { example } from '../registry';
import {
  landscape,
  panel,
  picture,
  shape,
  SHAPE_COLORS,
  SHAPES,
} from '../standIns';

const part = 'Images';

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

/** Adds the six shapes as `shape-0` to `shape-5`. */
function addShapes(images: UIImages): string[] {
  return SHAPES.map((kind, i) => {
    const name = `shape-${i}`;
    images.add(name, shape(kind, SHAPE_COLORS[i]));
    return name;
  });
}

example({
  part,
  name: 'Sizes',
  description:
    'Shapes at their own size of 128 px, at half and at a quarter. Mips keep the small ones smooth, and their clear edges must not darken. The row also has a box, text and an icon, and the caption must show one draw call for all of it.',
  height: 400,
  build: ({ surface, images }) => {
    const names = addShapes(images);
    surface.root.append(
      column(
        { padding: 16, gap: 12 },
        row(
          { gap: 12, flexWrap: 'wrap' },
          ...names.map((image) => new Image({ image }))
        ),
        row(
          { gap: 12 },
          ...names.map((image) => new Image({ image, style: { width: 64 } })),
          ...names.map((image) => new Image({ image, style: { width: 32 } }))
        ),
        row(
          {
            gap: 8,
            padding: [6, 12, 6, 8],
            borderRadius: 6,
            backgroundColor: '#24323f',
          },
          new Image({ image: names[3], style: { width: 24 } }),
          new Icon({ icon: 'settings', size: 18 }),
          new Label({ text: 'Boxes, text, icons and images in one call' })
        )
      )
    );
  },
});

example({
  part,
  name: 'Object fit',
  description:
    'A 200 by 120 image in boxes of other shapes, with fill, contain and cover. Contain leaves the dark box at the sides. Cover cuts the image, and the frame round its edge shows only where it is not cut.',
  height: 330,
  build: ({ surface, images }) => {
    images.add('landscape', landscape());
    const fits: UIObjectFit[] = ['fill', 'contain', 'cover'];
    const box = (fit: UIObjectFit, width: number, height: number) =>
      column(
        { gap: 4 },
        new Image({
          image: 'landscape',
          fit,
          style: { width, height, backgroundColor: '#0d1620' },
        }),
        new Label({ text: fit, style: { fontSize: 13 } })
      );
    surface.root.append(
      column(
        { padding: 16, gap: 12 },
        row({ gap: 16 }, ...fits.map((fit) => box(fit, 160, 70))),
        row({ gap: 16 }, ...fits.map((fit) => box(fit, 90, 130)))
      )
    );
  },
});

example({
  part,
  name: 'Corners and clips',
  description:
    'An image with cover in a round box. An image in a box with a rounded border and padding, cut to the inside of the padding. An image larger than its parent, which clips it. An image at half opacity.',
  height: 200,
  build: ({ surface, images }) => {
    images.add('landscape', landscape());
    const clipper = new UINode({
      style: {
        width: 120,
        height: 120,
        overflow: 'hidden',
        borderRadius: 24,
        backgroundColor: '#24323f',
      },
    });
    clipper.append(
      new Image({
        image: 'landscape',
        style: { width: 200, height: 120, margin: [20, 0, 0, 20] },
      })
    );
    surface.root.append(
      row(
        { padding: 16, gap: 20 },
        new Image({
          image: 'landscape',
          fit: 'cover',
          style: { width: 120, height: 120, borderRadius: 60 },
        }),
        new Image({
          image: 'landscape',
          fit: 'fill',
          style: {
            width: 160,
            height: 120,
            padding: 8,
            borderWidth: 3,
            borderColor: '#73ccff',
            borderRadius: 28,
            backgroundColor: '#24323f',
          },
        }),
        clipper,
        new Image({
          image: 'landscape',
          style: { width: 120, opacity: 0.5 },
        })
      )
    );
  },
});

example({
  part,
  name: 'Natural size',
  description:
    'With no size, an image node takes the image size: 128 px. With a pixel ratio of 2, it takes half: 64 px. With only a width, the height keeps the aspect ratio. The last image has padding and children, which draw over it and do not size it.',
  height: 210,
  build: ({ images, surface }) => {
    images.add('shape-natural', shape('star', SHAPE_COLORS[1]));
    images.add('shape-sharp', shape('star', SHAPE_COLORS[1]), {
      pixelRatio: 2,
    });
    images.add('panel', panel());
    const card = new Image({
      image: 'panel',
      style: {
        width: 200,
        padding: 12,
        flexDirection: 'column',
        justifyContent: 'flex-end',
      },
    });
    card.node.append(
      new Label({ text: 'A label over the image', style: { fontSize: 18 } }),
      new Label({
        text: 'The image takes 200 px and its own height.',
        style: { fontSize: 13, color: '#c5d3e0' },
      })
    );
    surface.root.append(
      row(
        { padding: 16, gap: 16, alignItems: 'flex-start' },
        new Image({ image: 'shape-natural' }),
        new Image({ image: 'shape-sharp' }),
        new Image({ image: 'panel', style: { width: 90 } }),
        card
      )
    );
  },
});

example({
  part,
  name: 'From a URL',
  description:
    'The 960 by 640 test image, with its URL as the "src". The default loader takes a key as a URL. It is larger than an atlas block, so it has its own texture. The node has only a width, so it has no height until the image loads.',
  height: 260,
  build: ({ surface }) => {
    surface.root.append(
      column(
        { padding: 16 },
        new Image({
          src: testImage().url,
          style: { width: 320, borderRadius: 12 },
        })
      )
    );
  },
});

example({
  part,
  name: 'Large images',
  description:
    'Six pictures of 1024 by 1024, each in its own texture, drawn small with cover. Each has a "src" key, which this card\'s loader draws. Hide takes the nodes off the surface, so their images go into the cache and the draw calls go. Show finds them in the cache. Clear cache frees them, and the memory goes.',
  height: 400,
  build: ({ images, surface }) => {
    images.loader = async (key) => {
      const match = /^picture\/(\d+)$/.exec(key);
      return match ? picture(Number(match[1])) : fetchImage(key);
    };
    const pictures = row(
      { gap: 10, flexWrap: 'wrap' },
      ...[1, 2, 3, 4, 5, 6].map(
        (n) =>
          new Image({
            src: `picture/${n}`,
            fit: 'cover',
            style: {
              width: 120,
              height: 160,
              borderRadius: 8,
              backgroundColor: '#24323f',
            },
          })
      )
    );
    // The DOM side follows styles, not tree changes, so `display` hides
    // the pictures there.
    const show = () => {
      pictures.style.display = 'flex';
      page.append(pictures);
    };
    const hide = () => {
      pictures.style.display = 'none';
      pictures.remove();
    };
    const page: UINode = column(
      { padding: 16, gap: 12 },
      row(
        { gap: 8 },
        new Button({ label: 'Show', onClick: show }),
        new Button({ label: 'Hide', onClick: hide, color: 'secondary' }),
        new Button({
          label: 'Clear cache',
          onClick: () => images.clearCache(),
          variant: 'text',
        })
      ),
      pictures
    );
    surface.root.append(page);
  },
});
