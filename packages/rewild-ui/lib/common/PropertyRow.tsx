import { Component, register } from '../Component';
import { theme } from '../theme';

interface Props {
  label: string;
}

/** A label beside its value. Stacked rows line their labels up in one column. */
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
    grid-template-columns: minmax(8rem, 14rem) 1fr;
    gap: 1rem;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid ${theme.colors.onSurfaceBorder};
    font-family: var(--font-family);
  }

  .label {
    font-weight: 500;
    font-size: 0.9rem;
    color: ${theme.colors.onSubtle};
  }

  .value {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 0.875rem;
  }
`);
