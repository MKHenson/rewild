import { Breadcrumbs, BreadcrumbItem, Component, register, theme } from 'rewild-ui';

interface Props {
  breadcrumbs: BreadcrumbItem[];
}

/**
 * Layout for a single item opened from a list: a fixed header with breadcrumbs
 * on the left and anything given `slot="actions"` on the right, over a
 * scrolling body. Fills its container's height.
 */
@register('x-detail-page')
export class DetailPage extends Component<Props> {
  init() {
    return () => (
      <div class="page">
        <header>
          <Breadcrumbs items={this.props.breadcrumbs} />
          <div class="actions">
            <slot name="actions"></slot>
          </div>
        </header>
        <div class="content">
          <slot></slot>
        </div>
      </div>
    );
  }

  getStyle() {
    return StyledDetailPage;
  }
}

const StyledDetailPage = cssStylesheet(css`
  :host {
    display: block;
    height: 100%;
    min-height: 0;
  }

  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  header {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${theme.space.l};
    min-height: ${theme.sizes.control};
    padding: 0 0 ${theme.space.m} 0;
    border-bottom: 1px solid ${theme.colors.subtle500};
  }

  .actions {
    flex: none;
    display: flex;
    gap: ${theme.space.s};
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: ${theme.space.xl} 0 0 0;
  }
`);
