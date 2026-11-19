import { theme } from '../theme';

/**
 * Frosted glass for a surface that floats over other content: a modal or an
 * editor toolbar over the scene. What is behind shows through, blurred.
 * `opacity` is how much of the surface colour covers it. Pair it with a 1px
 * edge in `theme.colors.glassEdge`.
 */
export function glassSurface(opacity = '60%'): string {
  return css`
    background-color: color-mix(
      in srgb,
      ${theme.colors.surface} ${opacity},
      transparent
    );
    backdrop-filter: blur(18px) saturate(150%);
  `;
}
