import {
  Component,
  register,
  Pane3D,
  curDragAction,
  compelteDragDrop,
  theme,
} from 'rewild-ui';
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
import { sceneGraphStore } from 'src/ui/stores/SceneGraphStore';
import { ITreeNodeAction } from 'models';

interface Props {}

@register('x-editor-viewport')
export class EditorViewport extends Component<Props> {
  renderer: Renderer;
  hasInitialized = false;

  circle: Mesh;

  init() {
    this.renderer = new Renderer();
    const sceneGraphStoreProxy = this.observeStore(sceneGraphStore, (e) => {
      if (e === 'selectedContainerId') return true;
      if (e.includes('selectedResource.properties')) {
        if (sceneGraphStore.target.selectedResource?.id === 'SKY') {
          syncFromEditorResource(
            sceneGraphStore.target.selectedResource.id,
            this.renderer
          );
        }
      }

      return false; // Prevent further processing
    });

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
      const point = get3DCoords(event.clientX, event.clientY);
      if (point) {
        this.circle.transform.position.copy(point);
      }
    };

    const get3DCoords = (clientX: i32, clientY: i32) => {
      const pointer = new Vector2();
      const raycaster = new Raycaster();

      const rect = pane3D.getBoundingClientRect();

      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      raycaster.setFromCamera(pointer, this.renderer.perspectiveCam);
      const intersects = raycaster.intersectObjects(
        [this.renderer.scene],
        true
      );

      if (intersects.length > 0) {
        const intersection = intersects[0];
        return intersection.point;
      }

      return null;
    };

    const onDragOverEvent = (e: DragEvent) => {
      if (
        curDragAction?.type !== 'treenode' ||
        !(curDragAction as ITreeNodeAction).node.resource?.properties.find(
          (p) => p.type === 'templateId'
        )
      ) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const json = compelteDragDrop<ITreeNodeAction>(e);
      if (!json) return;

      if (sceneGraphStore.defaultProxy.selectedResource?.id) {
        const selectedNode = sceneGraphStore.findNodeById(
          sceneGraphStore.defaultProxy.selectedResource.id
        );

        if (selectedNode) {
          const position = json.node.resource?.properties.find(
            (p) => p.type === 'position'
          );

          if (position) {
            const point = get3DCoords(e.clientX, e.clientY);
            if (point) {
              position.value = [point.x, point.y, point.z];
            }

            selectedNode.children = selectedNode.children
              ? selectedNode.children.concat([{ ...json.node }])
              : [json.node];

            projectStore.defaultProxy.dirty = true;
          }
        }
      }
    };

    const pane3D = (<Pane3D onCanvasReady={onCanvasReady} />) as Pane3D;

    pane3D.ondragover = onDragOverEvent;
    pane3D.ondrop = onDrop;

    return () => {
      this.toggleAttribute(
        'activated',
        !!sceneGraphStoreProxy.selectedContainerId
      );
      return pane3D;
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
    box-sizing: border-box;
  }

  :host([activated]) {
    border: 2px dashed ${theme.colors.success400};
  }
`);
