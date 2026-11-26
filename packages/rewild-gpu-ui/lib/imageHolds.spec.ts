import { Image } from './components/Image';
import { UIImageLookup } from './image';
import { UINode } from './UINode';
import { UISurface } from './UISurface';

/** Images that count each key's holds. */
function countingImages() {
  const holds = new Map<string, number>();
  const images: UIImageLookup = {
    image: () => undefined,
    hold: (key) => holds.set(key, (holds.get(key) ?? 0) + 1),
    release: (key) => holds.set(key, (holds.get(key) ?? 0) - 1),
  };
  return { images, holds };
}

function surfaceWith(images: UIImageLookup | null): UISurface {
  const surface = new UISurface({ kind: 'screen', name: 'test' });
  surface.images = images;
  return surface;
}

describe('image holds', () => {
  it('holds the image while the node is on a surface', () => {
    const { images, holds } = countingImages();
    const surface = surfaceWith(images);
    const node = new UINode({ src: 'fox' });
    expect(holds.get('fox')).toBeUndefined();
    surface.root.append(node);
    expect(holds.get('fox')).toBe(1);
    node.remove();
    expect(holds.get('fox')).toBe(0);
  });

  it('sets the image to the key', () => {
    expect(new UINode({ src: 'fox' }).image).toBe('fox');
  });

  it('holds for each node in a subtree that joins or leaves', () => {
    const { images, holds } = countingImages();
    const surface = surfaceWith(images);
    const panel = new UINode();
    panel.append(new UINode({ src: 'fox' }), new UINode({ src: 'owl' }));
    const deep = new UINode();
    deep.append(new UINode({ src: 'fox' }));
    panel.append(deep);
    surface.root.append(panel);
    expect(holds.get('fox')).toBe(2);
    expect(holds.get('owl')).toBe(1);
    panel.remove();
    expect(holds.get('fox')).toBe(0);
    expect(holds.get('owl')).toBe(0);
  });

  it('does not hold twice when a node moves within its surface', () => {
    const { images, holds } = countingImages();
    const surface = surfaceWith(images);
    const a = new UINode();
    const b = new UINode();
    const node = new UINode({ src: 'fox' });
    surface.root.append(a, b);
    a.append(node);
    b.append(node);
    expect(holds.get('fox')).toBe(1);
  });

  it('moves the hold when the src changes', () => {
    const { images, holds } = countingImages();
    const surface = surfaceWith(images);
    const node = new UINode({ src: 'fox' });
    surface.root.append(node);
    node.src = 'owl';
    expect(holds.get('fox')).toBe(0);
    expect(holds.get('owl')).toBe(1);
    expect(node.image).toBe('owl');
    node.src = null;
    expect(holds.get('owl')).toBe(0);
    expect(node.image).toBeNull();
  });

  it('holds when the surface gets its images, and gives back when it loses them', () => {
    const { images, holds } = countingImages();
    const surface = surfaceWith(null);
    surface.root.append(new UINode({ src: 'fox' }));
    expect(holds.get('fox')).toBeUndefined();
    surface.images = images;
    expect(holds.get('fox')).toBe(1);
    surface.images = null;
    expect(holds.get('fox')).toBe(0);
  });

  it('holds nothing for a node that only names an image', () => {
    const { images, holds } = countingImages();
    surfaceWith(images).root.append(new UINode({ image: 'circle' }));
    expect(holds.size).toBe(0);
  });

  it('gives the Image component the same holds', () => {
    const { images, holds } = countingImages();
    const surface = surfaceWith(images);
    const image = new Image({ src: 'fox' });
    surface.root.append(image);
    expect(holds.get('fox')).toBe(1);
    image.image = 'circle';
    expect(holds.get('fox')).toBe(0);
    expect(image.image).toBe('circle');
  });
});
