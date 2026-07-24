import { Component, ComponentOptions, register } from '../Component';
import {
  createElement,
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CirclePlus,
  House,
  Info,
  Minus,
  Mountain,
  Pencil,
  Save,
  Search,
  Settings,
  Sun,
  Tag,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  WavesHorizontal,
  Wrench,
  Box, 
  MountainSnow,
  TrendingUpDown,
  type IconNode,
} from 'lucide';

// Icons are imported one by one rather than as a namespace so the bundler only
// ships the ones we actually use — the full lucide set is well over 1000 icons.
// Keys are the kebab-case names from lucide.dev; add an entry here to make a new
// icon available to `IconType`.
const icons = {
  'arrow-down': ArrowDown,
  'arrow-up': ArrowUp,
  boxes: Boxes,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'circle-alert': CircleAlert,
  'circle-plus': CirclePlus,
  house: House,
  info: Info,
  minus: Minus,
  mountain: Mountain,
  'mountain-snow': MountainSnow,
  pencil: Pencil,
  save: Save,
  search: Search,
  settings: Settings,
  sun: Sun,
  tag: Tag,
  'trash-2': Trash2,
  'triangle-alert': TriangleAlert,
  upload: Upload,
  user: User,
  'waves-horizontal': WavesHorizontal,
  'trending-up-down': TrendingUpDown,
  wrench: Wrench,
  box: Box,
} satisfies Record<string, IconNode>;

export type IconType = keyof typeof icons;

const SIZES = { xs: 12, s: 18, m: 24, l: 36, xl: 48 } as const;

interface Props {
  icon: IconType;
  class?: string;
  size?: keyof typeof SIZES;
  style?: string;
  onClick?: (e: MouseEvent) => void;
}

@register('x-icon')
export class Icon extends Component<Props> {
  constructor(options?: ComponentOptions<Props>) {
    super(options);
  }

  init() {
    return () => {
      const size = SIZES[this.props.size ?? 'm'];

      // Lucide strokes with `currentColor`, so the glyph follows whatever colour
      // lands on the host — same behaviour the icon font had.
      const svg = createElement(icons[this.props.icon], {
        width: size,
        height: size,
      });

      return (
        <span
          onclick={this.props.onClick}
          style={this.props.style}
          class={`icon ${this.props.class || ''}`}>
          {svg}
        </span>
      );
    };
  }

  getStyle() {
    return StyledIconStylesheet;
  }
}

const iconCss = css`
  :host {
    display: inline-block;
    vertical-align: middle;
  }

  span {
    color: inherit;
    display: block;
    /* The svg is a block child, so the line box would otherwise add descender
       space below it and push the icon off-centre in a flex row. */
    line-height: 0;
  }

  svg {
    display: block;
  }
`;

const StyledIconStylesheet = cssStylesheet(iconCss);

// The muted default lives on :host, not on an inline style: an inline style is
// unbeatable from the outside, so the icon could never take its container's
// colour (a selected/hovered button changed its label but left the icon grey).
// :host is the lowest-priority source, so any outer rule — including Button's
// `color: inherit` for slotted icons — wins.
const MutedIconStylesheet = cssStylesheet(
  `${iconCss} :host { color: var(--on-surface-light); }`
);

@register('x-styled-icon')
export class StyledIcon extends Icon {
  getStyle() {
    return MutedIconStylesheet;
  }
}
