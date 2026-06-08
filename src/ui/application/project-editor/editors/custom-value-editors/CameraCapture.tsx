import { PropValueObject, Vector3 } from 'models';
import { Button, Component, register } from 'rewild-ui';
import { getActiveRenderer } from '../utils/getActiveRenderer';
import { OrbitController } from 'rewild-renderer';
import { ViewportEventDetails } from '../EditorViewport';

interface Props {
  readOnly?: boolean;
  value?: PropValueObject;
  onChange?: (val: PropValueObject) => void;
}

const details: ViewportEventDetails = { renderer: null, orbitController: null };
const event = new CustomEvent('request-renderer', { detail: details });

function getActiveOrbitController(): OrbitController | null {
  document.dispatchEvent(event);
  return event.detail.orbitController;
}

@register('x-camera-capture')
export class CameraCapture extends Component<Props> {
  init() {
    const onCaptureClick = (e: MouseEvent) => {
      const renderer = getActiveRenderer();
      const target = getActiveOrbitController()?.target;
      const position = renderer?.camera.camera.transform.position;
      const up = renderer?.camera.camera.transform.up;

      this.props.onChange?.({
        position: position ? [position.x, position.y, position.z] : [0, 0, 0],
        up: up ? [up.x, up.y, up.z] : [0, 0, 0],
        target: target ? [target.x, target.y, target.z] : [0, 0, 0],
      });
    };

    const onRestoreClick = (e: MouseEvent) => {
      const renderer = getActiveRenderer();
      const target = getActiveOrbitController()?.target;
      const position = renderer?.camera.camera.transform.position;
      const up = renderer?.camera.camera.transform.up;
      position?.fromArray(this.props.value?.position as Vector3);
      up?.fromArray(this.props.value?.up as Vector3);
      target?.fromArray(this.props.value?.target as Vector3);
    };

    const elm = (
      <div>
        <Button disabled={this.props.readOnly} onClick={onCaptureClick}>
          Capture
        </Button>
        <Button
          variant="text"
          disabled={this.props.readOnly}
          onClick={onRestoreClick}>
          Restore
        </Button>
      </div>
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
