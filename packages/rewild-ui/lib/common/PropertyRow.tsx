import { Component, register } from '../Component';
import { theme } from '../theme';

interface Props {
  label: string;
}

/**
 * A label beside its value. Rows are at least one control tall, so a row of
 * plain text lines up with a row holding an input or button.
 */
@register('x-property-row')
export class PropertyRow extends Component<Props> {
  init() {
    return () => (
      <div class="row">
        <div class="label">{this.props.label}</div>
        <div class="value">
          <slot></slot>
        </div>
      </div>
    );
  }

  getStyle() {
    return StyledPropertyRow;
  }
}

const StyledPropertyRow = cssStylesheet(css`
  :host {
    display: block;
  }

  .row {
    display: grid;
    grid-template-columns: 10rem 1fr;
    column-gap: ${theme.space.l};
    align-items: center;
    min-height: ${theme.sizes.control};
    font-family: var(--font-family);
  }

  .label {
    font-size: 13px;
    font-weight: 500;
    color: ${theme.colors.onSurfaceLight};
  }

  .value {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: ${theme.space.s};
    font-size: ${theme.colors.fontSizeMedium};
    font-weight: 400;
    color: ${theme.colors.onSurface};
  }
`);
