import { Icon } from './Icon';
import { Component, register } from '../Component';
import { theme } from '../theme';

export interface BreadcrumbItem {
  label: string;
  /** Omit for a crumb that cannot be navigated to. The last crumb is always the current page. */
  onClick?: () => void;
}

interface Props {
  items: BreadcrumbItem[];
}

@register('x-breadcrumbs')
export class Breadcrumbs extends Component<Props> {
  init() {
    return () => {
      const items = this.props.items;
      const last = items.length - 1;

      return (
        <nav aria-label="Breadcrumb">
          <ol>
            {items.map((item, index) => {
              const isCurrent = index === last;
              const crumb =
                isCurrent || !item.onClick ? (
                  <span class={isCurrent ? 'current' : ''}>{item.label}</span>
                ) : (
                  <button type="button" onclick={item.onClick}>
                    {item.label}
                  </button>
                );

              if (isCurrent) crumb.setAttribute('aria-current', 'page');

              return (
                <li>
                  {crumb}
                  {isCurrent ? null : <Icon icon="chevron-right" size="s" />}
                </li>
              );
            })}
          </ol>
        </nav>
      );
    };
  }

  getStyle() {
    return StyledBreadcrumbs;
  }
}

const StyledBreadcrumbs = cssStylesheet(css`
  :host {
    display: block;
    min-width: 0;
  }

  ol {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    list-style: none;
    margin: 0;
    padding: 0;
    font-family: var(--font-family);
    font-size: ${theme.colors.fontSizeMedium};
  }

  li {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  x-icon {
    margin: 0 ${theme.space.xs};
    color: ${theme.colors.onSurfaceLight};
  }

  button {
    appearance: none;
    background: none;
    border: none;
    padding: ${theme.space.xs};
    border-radius: ${theme.sizes.radius};
    font: inherit;
    font-weight: 400;
    color: ${theme.colors.primary400};
    cursor: pointer;
  }

  button:hover {
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  button:focus-visible {
    outline: 2px solid ${theme.colors.primary400};
  }

  span {
    padding: ${theme.space.xs};
    font-weight: 400;
    color: ${theme.colors.onSubtle};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span.current {
    color: ${theme.colors.onSurface};
    font-weight: 500;
  }
`);
