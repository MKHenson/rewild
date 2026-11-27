import type { icons } from 'lucide';

/** `chevron-down` to `ChevronDown`, the name lucide exports an icon under. */
type PascalCase<S extends string> = S extends `${infer Head}-${infer Tail}`
  ? `${Capitalize<Head>}${PascalCase<Tail>}`
  : Capitalize<S>;

/** The name, or an error that names it when lucide has no such icon. */
type LucideName<S extends string> =
  PascalCase<S> extends keyof typeof icons ? S : `"${S}" is not a lucide icon`;

/** Returns the names as they are. Each name must be a lucide icon, or it does not compile. */
function lucideNames<const T extends readonly string[]>(
  names: { readonly [I in keyof T]: LucideName<T[I]> }
): T {
  return names as T;
}

/**
 * The lucide icons in the icon atlas, by their kebab-case names from
 * lucide.dev. `scripts/build-icon-atlas.mjs` reads this list. After a change,
 * run `npm run ui-icons` to build the atlas again.
 */
export const UI_ICON_NAMES = lucideNames([
  'chevron-down',
  'circle-alert',
  'heart',
  'info',
  'play',
  'settings',
  'thermometer',
  'triangle-alert',
  'utensils',
  'wind',
  'x',
  'zap',
]);

export type UIIconName = (typeof UI_ICON_NAMES)[number];
