import { PropValueObject, Vector3 } from 'models';
import { Button, Component, register } from 'rewild-ui';
import { getActiveRenderer } from '../utils/getActiveRenderer';
import { TrackballController } from 'node_modules/rewild-renderer/lib/input/TrackballController';

interface Props {
  readOnly?: boolean;
  value?: PropValueObject;
  onChange?: (val: PropValueObject) => void;
}

@register('x-camera-capture')
export class CameraCapture extends Component<Props> {
  init() {
    const onCaptureClick = (e: MouseEvent) => {
      const renderer = getActiveRenderer();
      const target = (renderer?.camController as TrackballController).target;
      const position = renderer?.perspectiveCam.camera.transform.position;
      const up = renderer?.perspectiveCam.camera.transform.up;

      this.props.onChange?.({
        position: position ? [position.x, position.y, position.z] : [0, 0, 0],
        up: up ? [up.x, up.y, up.z] : [0, 0, 0],
        target: target ? [target.x, target.y, target.z] : [0, 0, 0],
      });
    };

    const onRestoreClick = (e: MouseEvent) => {
      const renderer = getActiveRenderer();
      const target = (renderer?.camController as TrackballController).target;
      const position = renderer?.perspectiveCam.camera.transform.position;
      const up = renderer?.perspectiveCam.camera.transform.up;
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
