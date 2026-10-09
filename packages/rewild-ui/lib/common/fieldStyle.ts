import { theme } from '../theme';

/**
 * The look every text field, number field and dropdown shares: no box, a
 * bottom line that darkens on hover and turns a thicker blue while the field
 * has the interaction, dashed and dimmed when disabled. `box` is the element
 * drawn as the field; `active` its focused or open state; `disabled` its
 * disabled state. The thicker line is an inset shadow, so it adds no height.
 */
export function underlineField(
  box: string,
  active: string,
  disabled: string
): string {
  return css`
    ${box} {
      box-sizing: border-box;
      height: ${theme.sizes.control};
      padding: 0 ${theme.space.xs};
      font-family: var(--font-family);
      font-size: ${theme.colors.fontSizeMedium};
      font-weight: 400;
      color: ${theme.colors.onField};
      background: transparent;
      border: none;
      border-bottom: 1px solid ${theme.colors.onSurfaceBorder};
      border-radius: 0;
      outline: none;
      box-shadow: inset 0 -1px 0 transparent;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    ${box}:hover {
      border-bottom-color: ${theme.colors.onSurfaceLight};
    }

    ${active} {
      border-bottom-color: ${theme.colors.primary400};
      box-shadow: inset 0 -1px 0 ${theme.colors.primary400};
    }

    ${disabled}, ${disabled}:hover {
      cursor: default;
      opacity: 0.5;
      border-bottom-style: dashed;
      border-bottom-color: ${theme.colors.onSurfaceBorder};
      box-shadow: none;
    }
  `;
}
