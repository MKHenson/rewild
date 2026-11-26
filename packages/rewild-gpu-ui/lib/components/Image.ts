import type { UIObjectFit } from '../image';
import { UIStyle } from '../style';
import { UIComponent, UINode } from '../UINode';

interface ImageBaseOptions {
  /** How the image fills the box. Defaults to `contain`. */
  fit?: UIObjectFit;
  /** Names the node in debug output. Defaults to `image`. */
  name?: string;
  /**
   * With no width or height, the node takes the image's size. With one of
   * them, the other keeps the image's aspect ratio.
   */
  style?: UIStyle;
}

/**
 * `src` is a key to load. The image holds it while it is on a surface, so it
 * loads and stays. `image` names an image that something else holds, such as
 * one code added.
 */
export type ImageOptions = ImageBaseOptions &
  ({ src: string; image?: never } | { image: string; src?: never });

/**
 * One image from `UIImages`. It does not shrink in a flex row, so it keeps
 * its size. Its children draw over it, so it can be a background.
 */
export class Image implements UIComponent {
  readonly node: UINode;

  constructor(options: ImageOptions) {
    this.node = new UINode({
      name: options.name ?? 'image',
      image: options.image,
      src: options.src,
      style: {
        flexShrink: 0,
        ...(options.fit && { objectFit: options.fit }),
        ...options.style,
      },
    });
  }

  /** The image's key or name. */
  get image(): string {
    return this.node.image!;
  }

  /** Shows an image that something else holds. The image gives back any `src` it held. */
  set image(name: string) {
    this.node.src = null;
    this.node.image = name;
  }

  /** The key the image holds and loads, or null. */
  get src(): string | null {
    return this.node.src;
  }

  set src(key: string | null) {
    this.node.src = key;
  }

  get fit(): UIObjectFit {
    return this.node.style.objectFit ?? 'contain';
  }

  set fit(fit: UIObjectFit) {
    this.node.style.objectFit = fit;
  }
}
