import type { Rect } from './UINode';

/** How an image fills its node's content box, as CSS's `object-fit`. */
export type UIObjectFit = 'fill' | 'contain' | 'cover';

/** Where a loaded image is, for layout and drawing. */
export interface UIImage {
  /** The image's size in texels. */
  width: number;
  height: number;
  /** Texels per CSS pixel, so the node's natural size is the texel size over it. */
  pixelRatio: number;
  /**
   * The texture the image is in, for the draw runs: 1 for the atlas of small
   * images, and a number of 2 or more for a large image's own texture.
   */
  texture: number;
  /** The layer of the texture array. */
  layer: number;
  /** Left, top, right and bottom of the image in its texture, from 0 to 1. */
  uv: [number, number, number, number];
}

/**
 * Finds loaded images by key. `UIImages` is one. With `hold` and `release`,
 * nodes with a `src` hold their images while they are on a surface.
 */
export interface UIImageLookup {
  image(key: string): UIImage | undefined;
  /** Holds the image, and loads it when it is not loaded. */
  hold?(key: string): void;
  /** Gives back a hold from `hold`. */
  release?(key: string): void;
}

/** The texture of a primitive that is not an image. Any texture can draw it. */
export const NO_TEXTURE = 0;
/** The texture of the atlas of small images. */
export const ATLAS_TEXTURE = 1;

/** An image's size in CSS pixels, when its node takes it. */
export function naturalSize(image: UIImage): { width: number; height: number } {
  return {
    width: image.width / image.pixelRatio,
    height: image.height / image.pixelRatio,
  };
}

/** The part of an image that shows in a box, and where. */
export interface FittedImage {
  /** Where the image shows, inside the box. */
  rect: Rect;
  /** The part of the image that shows, from 0 to 1 of its width and height. */
  crop: [number, number, number, number];
}

/**
 * Places an image of `width` by `height` in `box`, as CSS's `object-fit` with
 * the default `object-position` of the centre. `cover` crops the image, so
 * the rect never leaves the box. Returns null when nothing shows.
 */
export function fitImage(
  box: Rect,
  width: number,
  height: number,
  fit: UIObjectFit
): FittedImage | null {
  if (box.width <= 0 || box.height <= 0 || width <= 0 || height <= 0)
    return null;
  if (fit === 'fill') return { rect: { ...box }, crop: [0, 0, 1, 1] };
  const scale =
    fit === 'contain'
      ? Math.min(box.width / width, box.height / height)
      : Math.max(box.width / width, box.height / height);
  const w = width * scale;
  const h = height * scale;
  const x = box.x + (box.width - w) / 2;
  const y = box.y + (box.height - h) / 2;
  if (fit === 'contain')
    return { rect: { x, y, width: w, height: h }, crop: [0, 0, 1, 1] };
  // `cover` overflows the box on one axis. Show only the part inside it.
  const left = Math.max(x, box.x);
  const top = Math.max(y, box.y);
  const right = Math.min(x + w, box.x + box.width);
  const bottom = Math.min(y + h, box.y + box.height);
  return {
    rect: { x: left, y: top, width: right - left, height: bottom - top },
    crop: [(left - x) / w, (top - y) / h, (right - x) / w, (bottom - y) / h],
  };
}

/** The part `crop` of an image at `uv` in its texture. */
export function cropUv(
  uv: [number, number, number, number],
  crop: [number, number, number, number]
): [number, number, number, number] {
  const [u0, v0, u1, v1] = uv;
  const du = u1 - u0;
  const dv = v1 - v0;
  return [
    u0 + crop[0] * du,
    v0 + crop[1] * dv,
    u0 + crop[2] * du,
    v0 + crop[3] * dv,
  ];
}
