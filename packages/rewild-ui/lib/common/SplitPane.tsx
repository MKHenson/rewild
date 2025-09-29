import { Component, register } from '../Component';
import { theme } from '../theme';

interface Props {
  mode?: 'horizontal' | 'vertical';
  pane1: JSX.Element;
  pane2?: JSX.Element;
  initalRatio?: string;
  pane1Title?: string;
  pane2Title?: string;
}

@register('x-split-pane')
export class SplitPane extends Component<Props> {
  init() {
    const isHorizontal = this.props.mode === 'horizontal';

    const getClientXY = (e: MouseEvent) => {
      const bounding = container.getBoundingClientRect();
      const x = e.clientX - bounding.left;
      const y = e.clientY - bounding.top;
      return [x, y];
    };

    this.onMount = () => {
      divider.onmousedown = onMouseDown;
    };

    this.onCleanup = () => {
      container.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseDown = (e: MouseEvent) => {
      container.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      dragger.style.display = 'block';
      const [x, y] = getClientXY(e);

      dragger.style.left = !isHorizontal ? `${x}px` : '0px';
      dragger.style.top = isHorizontal ? `${y}px` : '0px';

      document.body.style.userSelect = 'none';
    };

    const onMouseUp = (e: MouseEvent) => {
      container.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      dragger.style.display = 'none';
      document.body.style.userSelect = '';

      const [x, y] = getClientXY(e);

      pane1.style.minWidth = isHorizontal ? '' : `${x}px`;
      pane1.style.minHeight = !isHorizontal ? '' : `${y}px`;
      pane1.style.flexGrow = '0'; // Prevent flex-grow from affecting the pane size
    };

    const onMouseMove = (e: MouseEvent) => {
      const [x, y] = getClientXY(e);

      dragger.style.left = !isHorizontal ? `${x}px` : '0px';
      dragger.style.top = isHorizontal ? `${y}px` : '0px';
    };

    const container = (
      <div>
        <div class="left">
          <div class="tabs">
            <div class="tab"></div>
          </div>
          <div class="content" />
        </div>
        <div class="divider" />
        <div class="right">
          <div class="tabs">
            <div class="tab"></div>
          </div>
          <div class="content" />
        </div>
        <div class="dragger" />
      </div>
    );

    const pane1 = container.children[0] as HTMLElement;
    const divider = container.children[1] as HTMLElement;
    const pane2 = container.children[2] as HTMLElement;
    const dragger = container.children[3] as HTMLElement;

    const pane1Content = pane1.querySelector('.content') as HTMLElement;
    const pane2Content = pane2.querySelector('.content') as HTMLElement;
    const pane1Tab = pane1.querySelector('.tab') as HTMLElement;
    const pane2Tab = pane2.querySelector('.tab') as HTMLElement;

    if (!this.props.pane2) {
      divider.style.display = 'none';
      pane2.style.display = 'none';
    }

    if (this.props.initalRatio) {
      pane1.style.minWidth = isHorizontal ? '' : this.props.initalRatio;
      pane1.style.minHeight = !isHorizontal ? '' : this.props.initalRatio;
      pane1.style.flexGrow = '0';
    }

    return () => {
      container.classList.toggle('vertical', !isHorizontal);
      container.classList.toggle('horizontal', isHorizontal);

      pane1Tab.textContent = this.props.pane1Title || '';
      pane2Tab.textContent = this.props.pane2Title || '';
      pane1Tab.toggleAttribute('empty', pane1Tab.textContent === '');
      pane2Tab.toggleAttribute('empty', pane2Tab.textContent === '');

      if (this.props.pane1 && this.props.pane1.parentElement !== pane1Content) {
        pane1Content.appendChild(this.props.pane1);
      }
      if (this.props.pane2 && this.props.pane2.parentElement !== pane2Content) {
        pane2Content.appendChild(this.props.pane2);
      }

      return container;
    };
  }

  getStyle() {
    return StyledPane3D;
  }
}

const StyledPane3D = cssStylesheet(css`
  :host,
  :host > div {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
  }

  :host .vertical {
    flex-direction: row;
  }

  :host .horizontal {
    flex-direction: column;
  }

  :host .horizontal .divider,
  :host .horizontal .dragger {
    height: 4px;
    width: 100%;
    background-color: #3b5db4;
    cursor: pointer;
  }

  :host .vertical .divider,
  :host .vertical .dragger {
    width: 4px;
    height: 100%;
    background-color: #3b5db4;
    cursor: pointer;
  }

  :host .left,
  :host .right {
    flex: 1;
    overflow: hidden;

    display: flex;
    flex-direction: column;
  }

  :host .dragger {
    position: absolute;
    background: red;
    display: none;
  }

  :host .left .content,
  :host .right .content {
    overflow: hidden;
    flex-grow: 1;
  }

  .tabs {
    background: ${theme.colors.subtle600};
    flex-grow: 0;
  }

  .tab {
    background: ${theme.colors.surface};
    display: inline-block;
    padding: 2px 6px;
    font-size: ${theme.colors.fontSizeMedium};
  }

  .tab[empty] {
    display: none;
  }
`);
