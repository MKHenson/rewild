import { Component, register, Pane3D } from 'rewild-ui';
import { Renderer } from 'rewild-renderer';

interface Props {}

@register('x-editor-viewport')
export class EditorViewport extends Component<Props> {
  init() {
    const renderer = new Renderer();
    const onCanvasReady = async (pane3D: Pane3D) => {
      try {
        await renderer.init(pane3D.canvas()!);
      } catch (err: unknown) {}
    };

    const canvas = (<Pane3D onCanvasReady={onCanvasReady} />) as Pane3D;

    return () => {
      return canvas;
    };
  }

  getStyle() {
    return StyledContainer;
  }
}

const StyledContainer = cssStylesheet(css`
  :host {
    height: 100%;
    width: 100%;
    display: block;
  }
`);
