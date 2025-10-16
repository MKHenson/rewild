import { PropValueObject } from 'models';
import { Button, Component, register } from 'rewild-ui';
import { ViewportEventDetails } from '../EditorViewport';

interface Props {
  readOnly?: boolean;
  value?: PropValueObject;
  onChange?: (val: PropValueObject) => void;
}

@register('x-camera-capture')
export class CameraCapture extends Component<Props> {
  init() {
    const onMouseClick = (e: MouseEvent) => {
      // Create an event on the document to request the renderer
      const details = { renderer: null } as ViewportEventDetails;
      const event = new CustomEvent('request-renderer', {
        detail: details,
      });

      document.dispatchEvent(event);

      const target = details.renderer?.camController.target;
      const position =
        details.renderer?.perspectiveCam.camera.transform.position;

      this.props.onChange?.({
        position: position ? [position.x, position.y, position.z] : [0, 0, 0],
        target: target ? [target.x, target.y, target.z] : [0, 0, 0],
      });
    };

    const elm = (
      <Button disabled={this.props.readOnly} onClick={onMouseClick}>
        Capture
      </Button>
    );

    return () => {
      return elm;
    };
  }

  getStyle() {
    return StyledInput;
  }
}

const StyledInput = cssStylesheet(css``);
