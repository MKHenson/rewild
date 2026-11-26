import { ATLAS_TEXTURE, NO_TEXTURE, UIImage, UIImageLookup } from './image';
import {
  PRIMITIVE_FLOATS,
  PrimitiveKind,
  primitiveRuns,
  PrimitiveStream,
} from './stream';
import { UIStyle } from './style';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

/** A 100 by 50 image in the atlas, at the top left of its texture. */
const wide: UIImage = {
  width: 100,
  height: 50,
  pixelRatio: 1,
  texture: ATLAS_TEXTURE,
  layer: 2,
  uv: [0, 0, 0.5, 0.25],
};

function lookup(images: Record<string, UIImage>): UIImageLookup {
  return { image: (name) => images[name] };
}

const images = lookup({
  wide,
  sharp: { ...wide, pixelRatio: 2 },
  photo: { ...wide, texture: 7, layer: 0, uv: [0, 0, 1, 1] },
});

function surfaceWith(...nodes: UINode[]): UISurface {
  const surface = new UISurface({ kind: 'screen', name: 'test' });
  surface.images = images;
  surface.root.style.alignItems = 'flex-start';
  surface.root.append(...nodes);
  surface.update(400, 300);
  return surface;
}

function imageNode(image: string, style: UIStyle = {}): UINode {
  return new UINode({ image, style });
}

function primitive(stream: PrimitiveStream, index: number) {
  const o = index * PRIMITIVE_FLOATS;
  const d = Array.from(stream.data.subarray(o, o + PRIMITIVE_FLOATS));
  return {
    rect: d.slice(0, 4),
    radii: d.slice(12, 16),
    box: d.slice(20, 24),
    kind: d[26],
    layer: d[27],
    uv: d.slice(28, 32),
  };
}

describe('image size in layout', () => {
  it('takes the image size with no width or height', () => {
    const node = imageNode('wide');
    surfaceWith(node);
    expect(node.rect).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('takes the texel size over the pixel ratio', () => {
    const node = imageNode('sharp');
    surfaceWith(node);
    expect(node.rect.width).toBe(50);
    expect(node.rect.height).toBe(25);
  });

  it('keeps the aspect ratio when one side is set', () => {
    const byWidth = imageNode('wide', { width: 40 });
    const byHeight = imageNode('wide', { height: 40 });
    surfaceWith(byWidth, byHeight);
    expect(byWidth.rect.height).toBe(20);
    expect(byHeight.rect.width).toBe(80);
  });

  it('adds padding and border round the image', () => {
    const node = imageNode('wide', { padding: 5, borderWidth: 2 });
    surfaceWith(node);
    expect(node.rect.width).toBe(114);
    expect(node.rect.height).toBe(64);
  });

  it('has no size until the image loads', () => {
    const node = imageNode('missing');
    surfaceWith(node);
    expect(node.rect.width).toBe(0);
    expect(node.rect.height).toBe(0);
  });

  it('lays out its children over the image, and they do not size it', () => {
    const child = new UINode({ style: { width: 300, height: 10 } });
    const node = imageNode('wide', { padding: 4 });
    node.append(child);
    surfaceWith(node);
    expect(node.rect.width).toBe(108);
    expect(child.rect.x).toBe(4);
    expect(child.rect.y).toBe(4);
  });
});

describe('image drawing', () => {
  it('draws only once the image has loaded', () => {
    expect(
      surfaceWith(imageNode('missing', { width: 10, height: 10 })).stream.count
    ).toBe(0);
  });

  it('draws with contain by default, in the content box', () => {
    const node = imageNode('wide', { width: 100, height: 100, padding: 10 });
    const { stream } = surfaceWith(node);
    expect(stream.count).toBe(1);
    const p = primitive(stream, 0);
    expect(p.kind).toBe(PrimitiveKind.Image);
    expect(p.layer).toBe(2);
    // 80 by 80 content box: the image is 80 by 40, centred.
    expect(p.rect).toEqual([10, 30, 80, 40]);
    expect(p.box).toEqual([10, 10, 80, 80]);
    expect(p.uv).toEqual([0, 0, 0.5, 0.25]);
    expect(stream.textures[0]).toBe(ATLAS_TEXTURE);
  });

  it('crops the texture coordinates with cover', () => {
    const node = imageNode('wide', {
      width: 50,
      height: 50,
      objectFit: 'cover',
    });
    const p = primitive(surfaceWith(node).stream, 0);
    expect(p.rect).toEqual([0, 0, 50, 50]);
    // The middle half of the image's width shows.
    expect(p.uv).toEqual([0.125, 0, 0.375, 0.25]);
  });

  it('cuts the image to the content box corners', () => {
    const node = imageNode('wide', {
      width: 100,
      height: 50,
      borderRadius: 20,
      borderWidth: 4,
      padding: [2, 2, 2, 8],
    });
    const p = primitive(surfaceWith(node).stream, 0);
    expect(p.radii).toEqual([8, 14, 14, 8]);
  });

  it('draws over the box and under the children', () => {
    const child = new UINode({
      style: { width: 10, height: 10, backgroundColor: '#ff0000' },
    });
    const node = imageNode('wide', { backgroundColor: '#0000ff' });
    node.append(child);
    const { stream } = surfaceWith(node);
    expect([0, 1, 2].map((i) => primitive(stream, i).kind)).toEqual([
      PrimitiveKind.Rect,
      PrimitiveKind.Image,
      PrimitiveKind.Rect,
    ]);
  });

  it('lays out and draws again when the image changes', () => {
    const node = imageNode('wide');
    const surface = surfaceWith(node);
    node.image = 'sharp';
    surface.update(400, 300);
    expect(node.rect.width).toBe(50);
  });
});

describe('primitiveRuns', () => {
  const box = () =>
    new UINode({
      style: { width: 10, height: 10, backgroundColor: '#ffffff' },
    });

  it('draws boxes and small images in one run', () => {
    const { stream } = surfaceWith(
      box(),
      imageNode('wide'),
      box(),
      imageNode('sharp'),
      box()
    );
    expect(primitiveRuns(stream)).toEqual([
      { first: 0, count: 5, effect: null, texture: ATLAS_TEXTURE },
    ]);
  });

  it('starts a run for each change of image texture', () => {
    const { stream } = surfaceWith(
      imageNode('wide'),
      box(),
      imageNode('photo'),
      box(),
      imageNode('wide')
    );
    expect(
      primitiveRuns(stream).map((r) => [r.first, r.count, r.texture])
    ).toEqual([
      [0, 2, ATLAS_TEXTURE],
      [2, 2, 7],
      [4, 1, ATLAS_TEXTURE],
    ]);
  });

  it('gives no texture to a run with no image', () => {
    const { stream } = surfaceWith(box(), box());
    expect(primitiveRuns(stream)).toEqual([
      { first: 0, count: 2, effect: null, texture: NO_TEXTURE },
    ]);
  });

  it('still splits runs by effect', () => {
    const meter = new UINode({
      effect: 'meter',
      style: { width: 10, height: 10 },
    });
    const { stream } = surfaceWith(imageNode('wide'), meter, imageNode('wide'));
    expect(primitiveRuns(stream).map((r) => r.effect)).toEqual([
      null,
      'meter',
      null,
    ]);
  });
});
