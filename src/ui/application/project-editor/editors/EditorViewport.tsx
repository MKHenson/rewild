import { Component, register, Pane3D } from 'rewild-ui';
import { Renderer } from 'rewild-renderer';
import { projectStore } from 'src/ui/stores/ProjectStore';

interface Props {}

@register('x-editor-viewport')
export class EditorViewport extends Component<Props> {
  renderer: Renderer;

  init() {
    this.renderer = new Renderer();

    this.observeStore(projectStore, (e) => {
      if (e.includes('selectedResource.properties')) {
        if (projectStore.target.selectedResource?.id === 'SKY') {
          const cloudiness =
            projectStore.target.selectedResource.properties.find(
              (p) => p.type === 'cloudiness'
            );

          const foginess = projectStore.target.selectedResource.properties.find(
            (p) => p.type === 'foginess'
          );

          const elevation =
            projectStore.target.selectedResource.properties.find(
              (p) => p.type === 'sun_elevation'
            );

          const dayNightCycle =
            projectStore.target.selectedResource.properties.find(
              (p) => p.type === 'day_night_cycle'
            );

          if (cloudiness) {
            this.renderer.atmosphere.skyRenderer.cloudiness =
              cloudiness.value as number;
          }

          if (foginess) {
            this.renderer.atmosphere.skyRenderer.foginess =
              foginess.value as number;
          }

          if (elevation) {
            this.renderer.atmosphere.skyRenderer.elevation =
              elevation.value as number;
          }

          this.renderer.atmosphere.skyRenderer.dayNightCycle =
            dayNightCycle?.value as boolean;
        }
      }

      return false; // Prevent further processing
    });

    const onCanvasReady = async (pane3D: Pane3D) => {
      try {
        await this.renderer.init(pane3D.canvas()!);
      } catch (err: unknown) {
        console.error(err);
      }
    };

    const canvas = (<Pane3D onCanvasReady={onCanvasReady} />) as Pane3D;

    return () => {
      return canvas;
    };
  }

  getStyle() {
    return StyledContainer;
  }

  dispose() {
    this.renderer.dispose();
  }
}

const StyledContainer = cssStylesheet(css`
  :host {
    height: 100%;
    width: 100%;
    display: block;
  }
`);
