import { PropValueObject, Vector3 } from 'models';
import { Button, Component, register } from 'rewild-ui';
import { getActiveRenderer } from 'src/ui/utils/getActiveRenderer';
import { OrbitController } from 'rewild-renderer';
import { ViewportEventDetails } from '../EditorViewport';
import { bakePortalView } from 'src/core/PortalViewBake';
import {
  PORTAL_VIEW_ASSET_TYPE,
  PORTAL_VIEW_FILENAME,
} from 'src/core/routing/PortalAsset';
import { projectStore } from 'src/ui/stores/ProjectStore';
import { db } from 'src/database/database';

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
    const [baking, setBaking] = this.useState(false);

    // Portals that lead to this level show it from here.
    const onBakeClick = async () => {
      const renderer = getActiveRenderer();
      const level = projectStore.levelRef;
      const position = this.props.value?.position as Vector3 | undefined;
      if (!renderer || !level || !position || baking()) return;

      setBaking(true);
      const orbit = getActiveOrbitController();
      if (orbit) orbit.enabled = false;
      try {
        const view = await bakePortalView(renderer, position);
        await db.assets.write(
          {
            ...level,
            assetType: PORTAL_VIEW_ASSET_TYPE,
            filename: PORTAL_VIEW_FILENAME,
            contentType: view.type,
          },
          view
        );
      } catch (err) {
        console.error('Portal view bake failed', err);
      } finally {
        if (orbit) orbit.enabled = true;
        setBaking(false);
      }
    };

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

    return () => (
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
        <Button
          variant="text"
          disabled={this.props.readOnly || baking()}
          onClick={onBakeClick}>
          {baking() ? 'Baking…' : 'Bake Portal View'}
        </Button>
      </div>
    );
  }

  getStyle() {
    return StyledInput;
  }
}

const StyledInput = cssStylesheet(css``);
