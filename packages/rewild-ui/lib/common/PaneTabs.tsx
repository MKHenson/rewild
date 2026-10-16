import { Component, register } from '../Component';
import { theme } from '../theme';

export interface PaneTab {
  title: string;
  content: JSX.Element;
}

interface Props {
  tabs: PaneTab[];
}

/**
 * Several panes that share one area, with a tab strip styled like a
 * `SplitPane` title. Hidden panes stay mounted, so they keep their state.
 */
@register('x-pane-tabs')
export class PaneTabs extends Component<Props> {
  init() {
    const [active, setActive] = this.useState(0);

    const contents = this.props.tabs.map((tab) => (
      <div class="content">{tab.content}</div>
    )) as HTMLElement[];

    return () => (
      <div class="pane-tabs">
        <div class="tabs" role="tablist">
          {this.props.tabs.map((tab, i) => (
            <button
              class="tab"
              role="tab"
              aria-selected={i === active() ? 'true' : 'false'}
              onclick={() => setActive(i)}>
              {tab.title}
            </button>
          ))}
        </div>
        {contents.map((content, i) => {
          content.toggleAttribute('hidden', i !== active());
          return content;
        })}
      </div>
    );
  }

  getStyle() {
    return StyledPaneTabs;
  }
}

const StyledPaneTabs = cssStylesheet(css`
  :host {
    display: block;
    width: 100%;
    height: 100%;
  }

  .pane-tabs {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .tabs {
    background: ${theme.colors.subtle600};
    flex-grow: 0;
  }

  .tab {
    background: transparent;
    color: ${theme.colors.onSubtle};
    border: none;
    cursor: pointer;
    font: inherit;
    font-size: ${theme.colors.fontSizeMedium};
    padding: 2px 6px;
  }

  .tab[aria-selected='true'] {
    background: ${theme.colors.surface};
    color: ${theme.colors.onSurface};
  }

  .content {
    flex-grow: 1;
    overflow: hidden;
    min-height: 0;
  }

  .content[hidden] {
    display: none;
  }
`);
