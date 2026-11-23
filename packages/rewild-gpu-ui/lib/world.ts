import { Matrix4 } from 'rewild-common';

/** A world surface's size in metres. */
export interface UIWorldSize {
  width: number;
  height: number;
}

/** A world surface lays out at this many pixels per metre, so 1 pixel is 1 mm. */
export const DEFAULT_PIXELS_PER_METRE = 1000;

/**
 * CSS pixels the cull test grows a surface by on each side, so a box shadow
 * past the surface's edge still draws.
 */
const CULL_MARGIN = 64;

/**
 * Maps a screen surface's CSS pixels, with y down, to clip space over the
 * whole target.
 */
export function screenClip(
  out: Matrix4,
  width: number,
  height: number
): Matrix4 {
  // prettier-ignore
  return out.set(
    2 / width, 0, 0, -1,
    0, -2 / height, 0, 1,
    0, 0, 1, 0,
    0, 0, 0, 1
  );
}

/**
 * Maps a world surface's CSS pixels to its local space in metres. The local
 * origin is the centre of the surface, x points right, y points up and the
 * front faces +z.
 */
export function surfaceToLocal(
  out: Matrix4,
  size: UIWorldSize,
  pixelsPerMetre: number
): Matrix4 {
  const scale = 1 / pixelsPerMetre;
  // prettier-ignore
  return out.set(
    scale, 0, 0, -size.width / 2,
    0, -scale, 0, size.height / 2,
    0, 0, 1, 0,
    0, 0, 0, 1
  );
}

/**
 * Maps a world surface's CSS pixels to clip space: `viewProjection *
 * worldMatrix * surfaceToLocal`.
 */
export function worldClip(
  out: Matrix4,
  viewProjection: Matrix4,
  worldMatrix: Matrix4,
  size: UIWorldSize,
  pixelsPerMetre: number
): Matrix4 {
  return surfaceToLocal(out, size, pixelsPerMetre)
    .premultiply(worldMatrix)
    .premultiply(viewProjection);
}

/**
 * True when a surface `width` by `height` CSS pixels lies wholly outside one
 * side of the view, after `clip` maps it. The test grows the surface a little
 * for shadows past its edge.
 */
export function outsideView(
  clip: Matrix4,
  width: number,
  height: number
): boolean {
  const e = clip.elements;
  // Bits for each side a corner is outside: left, right, bottom, top, near, far.
  let all = 63;
  for (let i = 0; i < 4; i++) {
    const x = i & 1 ? width + CULL_MARGIN : -CULL_MARGIN;
    const y = i & 2 ? height + CULL_MARGIN : -CULL_MARGIN;
    const cx = e[0] * x + e[4] * y + e[12];
    const cy = e[1] * x + e[5] * y + e[13];
    const cz = e[2] * x + e[6] * y + e[14];
    const cw = e[3] * x + e[7] * y + e[15];
    let out = 0;
    if (cx < -cw) out |= 1;
    if (cx > cw) out |= 2;
    if (cy < -cw) out |= 4;
    if (cy > cw) out |= 8;
    if (cw <= 0) out |= 16;
    if (cz > cw) out |= 32;
    all &= out;
  }
  return all !== 0;
}
