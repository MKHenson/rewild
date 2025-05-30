import { Component, register } from '../Component';

interface Props {
  mode?: 'horizontal' | 'vertical';
  pane1: JSX.Element;
  pane2?: JSX.Element;
  initalRatio?: string;
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
        <div class="left" />
        <div class="divider" />
        <div class="right" />
        <div class="dragger" />
      </div>
    );

    const pane1 = container.children[0] as HTMLElement;
    const divider = container.children[1] as HTMLElement;
    const pane2 = container.children[2] as HTMLElement;
    const dragger = container.children[3] as HTMLElement;

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

      if (this.props.pane1 && this.props.pane1.parentElement !== pane1) {
        pane1.appendChild(this.props.pane1);
      }
      if (this.props.pane2 && this.props.pane2.parentElement !== pane2) {
        pane2.appendChild(this.props.pane2);
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
  }

  :host .dragger {
    position: absolute;
    background: red;
    display: none;
  }
`);
