import { Component, register, Pane3D } from 'rewild-ui';
import { Mesh, Renderer } from 'rewild-renderer';
import { projectStore, ProjectStoreEvents } from 'src/ui/stores/ProjectStore';
import { Subscriber, Vector2 } from 'rewild-common';
import {
  syncFromEditorResource,
  SyncRendererFromProject,
} from './utils/RendererSync';
import { SphereGeometryFactory } from 'rewild-renderer/lib/geometry/SphereGeometryFactory';
import { DiffusePass } from 'rewild-renderer/lib/materials/DiffusePass';
import { Raycaster } from 'rewild-renderer/lib/core/Raycaster';

interface Props {}

@register('x-editor-viewport')
export class EditorViewport extends Component<Props> {
  renderer: Renderer;
  hasInitialized = false;

  circle: Mesh;

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

        pane3D.onclick = onClick;

        this.circle = new Mesh(SphereGeometryFactory.new(), new DiffusePass());
        this.renderer.scene.addChild(this.circle.transform);
      } catch (err: unknown) {
        console.error(err);
      }
    };

    const onClick = (event: MouseEvent) => {
      const pointer = new Vector2();
      const raycaster = new Raycaster();

      const rect = canvas.getBoundingClientRect();

      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(pointer, this.renderer.perspectiveCam);
      const intersects = raycaster.intersectObjects(
        [this.renderer.scene],
        true
      );

      if (intersects.length > 0) {
        const intersection = intersects[0];
        console.log('Intersection:', intersection);
        this.circle.transform.position.copy(intersection.point);
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
