import {
  Component,
  register,
  Pane3D,
  curDragAction,
  compelteDragDrop,
  theme,
} from 'rewild-ui';
import { Renderer } from 'rewild-renderer';
import { projectStore, ProjectStoreEvents } from 'src/ui/stores/ProjectStore';
import { Subscriber, Vector2 } from 'rewild-common';
import {
  syncFromEditorResource,
  SyncRendererFromProject,
} from './utils/RendererSync';
import { Raycaster } from 'rewild-renderer/lib/core/Raycaster';
import {
  SceneGraphEvents,
  sceneGraphStore,
} from 'src/ui/stores/SceneGraphStore';
import { ITreeNodeAction } from 'models';
import { TemplateLoader } from 'src/core/TemplateLoader';
import { Asset3D } from 'src/core/routing/Asset3D';

interface Props {}

@register('x-editor-viewport')
export class EditorViewport extends Component<Props> {
  renderer: Renderer;
  hasInitialized = false;
  templateLoader: TemplateLoader;

  init() {
    this.renderer = new Renderer();
    this.templateLoader = new TemplateLoader();

    const sceneGraphStoreProxy = this.observeStore(sceneGraphStore, (e) => {
      if (e === 'selectedContainerId') return this.render();
      if (e.includes('selectedResource.properties')) {
        if (sceneGraphStore.target.selectedResource?.id === 'SKY') {
          syncFromEditorResource(
            sceneGraphStore.target.selectedResource.id,
            this.renderer
          );
        }
      }
    });

    const onProjectEvent: Subscriber<ProjectStoreEvents> = (event) => {
      if (event.kind === 'loading-completed') {
        SyncRendererFromProject(this.renderer, event.project);
      }
    };

    const onSceneGraphEvent: Subscriber<SceneGraphEvents> = async (event) => {
      if (event.kind === 'container-activated') {
        const containerNode = event.container;
        const container = event.container!.resource!;

        if (!projectStore.containerPods[container.id])
          projectStore.containerPods[container.id] = {
            asset3D: [],
          };

        // Add the node to the scene graph
        if (containerNode.children) {
          for (const childNode of containerNode.children) {
            const createdResource = (await this.templateLoader.createResource(
              childNode.resource!,
              this.renderer
            )) as Asset3D;

            const assetPodData = projectStore.containerPods[
              container.id
            ].asset3D.find((asset) => asset.id === childNode.resource!.id);

            if (assetPodData) {
              createdResource.transform.position.set(
                assetPodData.position[0],
                assetPodData.position[1],
                assetPodData.position[2]
              );
              this.renderer.scene.addChild(createdResource.transform);
            }
          }
        }
      } else if (event.kind === 'container-deactivated') {
        const containerNode = event.container;
        if (containerNode.children) {
          for (const childNode of containerNode.children) {
            const toRemove = this.renderer.scene.children.find(
              (c) => c.id === childNode.resource!.id
            );
            if (toRemove) this.renderer.scene.removeChild(toRemove);
          }
        }
      }
    };

    this.onMount = () => {
      projectStore.dispatcher.add(onProjectEvent);
      sceneGraphStore.dispatcher.add(onSceneGraphEvent);
    };

    this.onCleanup = () => {
      projectStore.dispatcher.remove(onProjectEvent);
      sceneGraphStore.dispatcher.remove(onSceneGraphEvent);
    };

    const onCanvasReady = async (pane3D: Pane3D) => {
      try {
        if (this.hasInitialized) return; // Prevent re-initialization
        this.hasInitialized = true;

        await this.renderer.init(pane3D.canvas()!);
        await this.templateLoader.load();

        pane3D.onclick = onClick;
      } catch (err: unknown) {
        console.error(err);
      }
    };

    const onClick = (event: MouseEvent) => {
      const point = get3DCoords(event.clientX, event.clientY);
      if (point) {
        // Check if we're clicking something?
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

    const onDragLeave = (e: DragEvent) => {
      this.toggleAttribute('container-not-activated', false);
    };

    const onDragOverEvent = (e: DragEvent) => {
      if (!sceneGraphStore.target.selectedContainerId) {
        this.toggleAttribute('container-not-activated', true);
      }
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

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleAttribute('container-not-activated', false);

      const activeContainerId = sceneGraphStore.target.selectedContainerId;

      // No container is active - exit early
      if (!activeContainerId) return;

      const json = compelteDragDrop<ITreeNodeAction>(e);
      if (!json) return;

      const point = get3DCoords(e.clientX, e.clientY);

      if (point && json.node.resource) {
        // Update the container pod with the transform position
        projectStore.containerPods[activeContainerId].asset3D.push({
          id: json.node.resource.id,
          position: [point.x, point.y, point.z],
        });

        // Add the node to the scene graph
        const newNode = sceneGraphStore.addNode(
          json.node,
          sceneGraphStore.findNodeById(activeContainerId)
        );

        sceneGraphStoreProxy.selectedResource = newNode.resource || null;

        const createdResource = (await this.templateLoader.createResource(
          json.node.resource,
          this.renderer
        )) as Asset3D;
        createdResource.transform.position.set(point.x, point.y, point.z);
        this.renderer.scene.addChild(createdResource.transform);
      }
    };

    const pane3D = (<Pane3D onCanvasReady={onCanvasReady} />) as Pane3D;

    pane3D.ondragover = onDragOverEvent;
    pane3D.ondragleave = onDragLeave;
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
    position: relative;
  }

  :host([activated])::after {
    content: '';
    border: 2px dashed ${theme.colors.onSurfaceBorder};
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    pointer-events: none;
    box-sizing: border-box;
  }

  :host([container-not-activated])::after {
    content: 'No active container. Double click a container in the scene graph to activate one.';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: ${theme.colors.surface};
    color: ${theme.colors.onSurface};
    padding: 0.5rem 1rem;
    border-radius: 5px;
    text-align: center;
    z-index: 10;
    pointer-events: none;
  }
`);
