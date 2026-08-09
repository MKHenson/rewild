import { Component, register } from '../Component';
import { theme } from '../theme';

export type TabsOrientation = 'horizontal' | 'vertical';

interface TabProps {
  /** Text shown on the tab's button in the tab list. */
  label: string;
  disabled?: boolean;
}

/**
 * One pane of a `Tabs`. Only ever useful as a direct child of it — `Tabs` reads
 * the label off each child and toggles the `active` attribute this styles
 * itself from.
 *
 * Panes stay mounted while hidden rather than being torn down and rebuilt, so a
 * half-filled form in one tab survives a look at another.
 */
@register('x-tab')
export class Tab extends Component<TabProps> {
  init() {
    return () => (
      <div class="panel" role="tabpanel">
        <slot></slot>
      </div>
    );
  }

  getStyle() {
    return StyledTab;
  }
}

interface TabsProps {
  orientation?: TabsOrientation;
  /**
   * Index of the open tab. Supply it to drive the selection from outside, in
   * which case `Tabs` never changes it on its own and the owner is expected to
   * re-render with a new value from `onChange`. Omit it and `Tabs` tracks the
   * selection itself.
   */
  activeIndex?: number;
  onChange?: (index: number) => void;
  class?: string;
}

@register('x-tabs')
export class Tabs extends Component<TabsProps> {
  init() {
    // Children arrive with the element and are not replaced afterwards, so the
    // buttons are built once here. Rebuilding them per render would drop focus
    // mid keyboard-navigation, since the button that had it is a new node.
    const tabs = collectTabs(this.props.children);
    const [selfIndex, setSelfIndex] = this.useState(0);

    const orientation = (): TabsOrientation =>
      this.props.orientation || 'horizontal';

    // Clamped rather than trusted: a controlled index can outrun the children,
    // and -1 for an empty Tabs keeps the loops below from selecting anything.
    const resolveActive = (): number => {
      if (tabs.length === 0) return -1;
      const requested = this.props.activeIndex ?? selfIndex();
      return Math.min(Math.max(requested, 0), tabs.length - 1);
    };

    const select = (index: number) => {
      // A controlled Tabs must only move when its owner says so; moving the
      // internal index too would let the two disagree.
      if (this.props.activeIndex === undefined) setSelfIndex(index);
      this.props.onChange?.(index);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const current = resolveActive();
      if (current < 0) return;

      const vertical = orientation() === 'vertical';
      let next: number;

      // Arrows follow the axis the tabs are laid out on — pressing Down on a
      // row of tabs should do nothing rather than move sideways.
      if (e.key === (vertical ? 'ArrowDown' : 'ArrowRight')) {
        next = step(tabs, current, 1);
      } else if (e.key === (vertical ? 'ArrowUp' : 'ArrowLeft')) {
        next = step(tabs, current, -1);
      } else if (e.key === 'Home') {
        next = step(tabs, tabs.length - 1, 1);
      } else if (e.key === 'End') {
        next = step(tabs, 0, -1);
      } else return;

      // Held off until a key is actually handled, so Tab and typing still work.
      e.preventDefault();
      if (next !== current) select(next);
    };

    const buttons = tabs.map((tab, index) => {
      const button = (
        <button
          class="tab-button"
          type="button"
          role="tab"
          onclick={() => select(index)}>
          {tab.props.label}
        </button>
      ) as HTMLButtonElement;

      button.disabled = tab.props.disabled || false;
      return button;
    });

    const elm = (
      <div class="tabs">
        <div class="tab-list" role="tablist" onkeydown={onKeyDown}>
          {buttons}
        </div>
        <div class="tab-panels">
          <slot></slot>
        </div>
      </div>
    );

    return () => {
      const active = resolveActive();
      this.setAttribute('orientation', orientation());
      this.className = this.props.class || '';

      for (let i = 0; i < buttons.length; i++) {
        const isActive = i === active;
        buttons[i].classList.toggle('active', isActive);
        buttons[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
        buttons[i].tabIndex = isActive ? 0 : -1;
        tabs[i].toggleAttribute('active', isActive);
      }

      return elm;
    };
  }

  getStyle() {
    return StyledTabs;
  }
}

/** Direct `Tab` children, flattened — JSX hands nested arrays through as-is. */
function collectTabs(
  children: JSX.ChildElement | JSX.ChildElement[] | undefined
): Tab[] {
  const tabs: Tab[] = [];

  const visit = (child: JSX.ChildElement | JSX.ChildElement[]) => {
    if (Array.isArray(child)) child.forEach(visit);
    else if (child instanceof Tab) tabs.push(child);
  };

  if (children !== undefined) visit(children);
  return tabs;
}

/**
 * Index `delta` steps from `from`, wrapping and skipping disabled tabs. Returns
 * `from` when every other tab is disabled, so a caller can compare and do
 * nothing rather than firing a change that goes nowhere.
 */
function step(tabs: Tab[], from: number, delta: number): number {
  const count = tabs.length;

  for (let i = 1; i <= count; i++) {
    const index = (((from + delta * i) % count) + count) % count;
    if (!tabs[index].props.disabled) return index;
  }

  return from;
}

const StyledTab = cssStylesheet(css`
  :host {
    display: block;
    flex: 1;
    min-width: 0;
    overflow: auto;
  }

  :host(:not([active])) {
    display: none;
  }

  .panel {
    height: 100%;
  }
`);

const StyledTabs = cssStylesheet(css`
  :host {
    display: block;
  }

  .tabs {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  :host([orientation='vertical']) .tabs {
    flex-direction: row;
  }

  .tab-list {
    display: flex;
    flex-direction: row;
    border-bottom: 1px solid ${theme.colors.onSurfaceBorder};
    overflow-x: auto;
  }

  :host([orientation='vertical']) .tab-list {
    flex-direction: column;
    border-bottom: none;
    border-right: 1px solid ${theme.colors.onSurfaceBorder};
    overflow-x: hidden;
    overflow-y: auto;
    min-width: 10rem;
  }

  .tab-button {
    appearance: none;
    background: none;
    border: none;
    font-family: var(--font-family);
    font-size: ${theme.colors.fontSizeMedium};
    font-weight: 500;
    color: ${theme.colors.onSubtle};
    padding: 0.75rem 1rem;
    cursor: pointer;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    transition: color 0.15s ease, border-color 0.15s ease,
      background-color 0.15s ease;
  }

  :host([orientation='vertical']) .tab-button {
    text-align: left;
    border-bottom: none;
    border-right: 2px solid transparent;
    margin-right: -1px;
  }

  .tab-button:hover:not(:disabled) {
    color: ${theme.colors.onSurface};
    background: color-mix(in srgb, currentColor 8%, transparent);
  }

  .tab-button:disabled {
    opacity: 0.65;
    cursor: default;
  }

  .tab-button.active {
    color: ${theme.colors.primary400};
    border-color: ${theme.colors.primary400};
  }

  .tab-button:focus-visible {
    outline: 2px solid ${theme.colors.primary400};
    outline-offset: -2px;
  }

  .tab-panels {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }
`);
