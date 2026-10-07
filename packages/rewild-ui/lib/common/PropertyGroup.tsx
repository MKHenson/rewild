import { Component, register } from '../Component';
import { theme } from '../theme';

interface Props {
  title?: string;
}

/** A titled stack of PropertyRows. Successive groups space themselves apart. */
@register('x-property-group')
export class PropertyGroup extends Component<Props> {
  init() {
    return () => (
      <section>
        {this.props.title ? <h4>{this.props.title}</h4> : null}
        <div class="rows">
          <slot></slot>
        </div>
      </section>
    );
  }

  getStyle() {
    return StyledPropertyGroup;
  }
}

const StyledPropertyGroup = cssStylesheet(css`
  :host {
    display: block;
  }

  :host(:not(:first-of-type)) {
    margin-top: ${theme.space.xl};
  }

  h4 {
    margin: 0 0 ${theme.space.s} 0;
    font-family: var(--font-family);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${theme.colors.onSurfaceLight};
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: ${theme.space.s};
  }
`);
