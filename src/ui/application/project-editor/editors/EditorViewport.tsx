import { Component, register, Pane3D } from 'rewild-ui';
import { Renderer } from 'rewild-renderer';
import { projectStore, ProjectStoreEvents } from 'src/ui/stores/ProjectStore';
import { Subscriber } from 'node_modules/rewild-common';
import {
  syncFromEditorResource,
  SyncRendererFromProject,
} from './utils/RendererSync';

interface Props {}

@register('x-editor-viewport')
export class EditorViewport extends Component<Props> {
  renderer: Renderer;
  hasInitialized = false;

  init() {
    this.renderer = new Renderer();

    const onProjectLoaded: Subscriber<ProjectStoreEvents> = (event) => {
      if (event.kind === 'loading-completed') {
        SyncRendererFromProject(this.renderer, event.project);
      }
    };

    this.onMount = () => {
      projectStore.dispatcher.add(onProjectLoaded);
    };

    this.onCleanup = () => {
      projectStore.dispatcher.remove(onProjectLoaded);
    };

    this.observeStore(projectStore, (e) => {
      if (e.includes('selectedResource.properties')) {
        if (projectStore.target.selectedResource?.id === 'SKY') {
          syncFromEditorResource(
            projectStore.target.selectedResource.id,
            this.renderer
          );
        }
      }

      return false; // Prevent further processing
    });

    const onCanvasReady = async (pane3D: Pane3D) => {
      try {
        if (this.hasInitialized) return; // Prevent re-initialization
        this.hasInitialized = true;

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
