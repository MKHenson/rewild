import type { UIStyle } from './style';
import type { UINode } from './UINode';

/**
 * Makes the white light on a glass box and its edge follow the pointer, as
 * on the DOM modal. The light starts at the top in the middle. The box must
 * take pointer input: on a surface whose root lets input through, it must
 * not be the root.
 */
export function followPointerLight(glass: UINode): void {
  glass.setEffectParams(0.5, 0, 1, 0);
  glass.on('pointermove', (e) => {
    const { x, y, width, height } = glass.rect;
    if (width > 0 && height > 0)
      glass.setEffectParams((e.x - x) / width, (e.y - y) / height, 1, 0);
  });
}

/**
 * Frosted glass for a box that floats over the game: a modal or a menu. What
 * is behind shows through, blurred. `opacity` is how much of the surface
 * colour covers it. It matches `glassSurface()` in rewild-ui. Pair it with a
 * 1 px edge in `glassEdge`.
 */
export function glassSurface(opacity = 0.6): UIStyle {
  return {
    backdrop: 'glass',
    backgroundColor: { theme: 'surface', alpha: opacity },
  };
}

/** The DOM glass's `blur(18px)`: the Gaussian's deviation in CSS pixels. */
export const GLASS_BLUR = 18;

/**
 * The Kawase levels and the tap offset that blur like a Gaussian of
 * deviation `sigma` device pixels, after the quarter size prefilter. A
 * simulation of the chain gives a deviation of about
 * 2^levels × (5 × offset + 0.75). The offset stays from 0.75 to 1.5, where
 * the taps leave no gaps.
 */
export function blurSteps(sigma: number): { levels: number; offset: number } {
  let levels = 1;
  while (2 ** levels * 8.25 < sigma) levels++;
  const offset = Math.max(0.5, (sigma / 2 ** levels - 0.75) / 5);
  return { levels, offset };
}
