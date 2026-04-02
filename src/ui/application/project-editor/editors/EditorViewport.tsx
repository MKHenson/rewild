import {
  Component,
  register,
  Pane3D,
  curDragAction,
  compelteDragDrop,
  theme,
} from 'rewild-ui';
import { Mesh, Renderer, Transform } from 'rewild-renderer';
import { Gizmo } from 'rewild-renderer/lib/helpers/Gizmo';
import { projectStore, ProjectStoreEvents } from 'src/ui/stores/ProjectStore';
import { Quaternion, Subscriber, Vector2, Vector3 } from 'rewild-common';
import { ITransformObserver } from 'rewild-renderer/types/interfaces';
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
import { GizmoDragController } from './utils/GizmoDragController';
import {
  computeObjectHalfHeight,
  computeRotationFromNormal,
} from './utils/WorldPlacement';

interface Props {}

export interface ViewportEventDetails {
  renderer: Renderer | null;
}

@register('x-editor-viewport')
export class EditorViewport extends Component<Props> {
  renderer: Renderer;
  hasInitialized = false;
  templateLoader: TemplateLoader;
  gizmo: Gizmo;
  dragController: GizmoDragController;
  selectedTransform: Transform | null = null;
  private didDrag = false;
  private cameraObserver: ITransformObserver | null = null;

  init() {
    this.renderer = new Renderer();
    this.templateLoader = new TemplateLoader();

    const sceneGraphStoreProxy = this.observeStore(sceneGraphStore, (e) => {
      if (e === 'selectedContainerId') return this.render();
      if (e.includes('selectedResource.properties')) {
        if (sceneGraphStore.target.selectedResource?.id) {
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

    const setTransformSelected = (transform: Transform, value: boolean) => {
      transform.selected = value;
      transform.traverse((child) => {
        child.selected = value;
      });
    };

    const onSceneGraphEvent: Subscriber<SceneGraphEvents> = async (event) => {
      if (event.kind === 'resource-selected') {
        // Clear previous selection tint
        if (this.selectedTransform) {
          setTransformSelected(this.selectedTransform, false);
          this.selectedTransform = null;
        }

        if (event.node?.resource) {
          const selectedTransform = this.renderer.scene.findObjectById(
            event.node.resource.id
          );
          if (selectedTransform) {
            setTransformSelected(selectedTransform, true);
            this.selectedTransform = selectedTransform;

            if (this.gizmo) {
              this.gizmo.transform.position.copy(selectedTransform.position);
              if (!this.gizmo.transform.parent) {
                this.renderer.scene.addChild(this.gizmo.transform);
              }
              this.updateGizmoScale();
            }
          }
        } else if (this.gizmo?.transform.parent) {
          this.renderer.scene.removeChild(this.gizmo.transform);
        }
      } else if (event.kind === 'container-activated') {
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
              if (assetPodData.rotation) {
                createdResource.transform.rotation.setFromQuaternion(
                  new Quaternion(
                    assetPodData.rotation[0],
                    assetPodData.rotation[1],
                    assetPodData.rotation[2],
                    assetPodData.rotation[3]
                  )
                );
              }

              this.renderer.scene.addChild(createdResource.transform);
              syncFromEditorResource(createdResource.id, this.renderer);
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
      } else if (event.kind === 'node-removed') {
        if (event.node.resource?.type === 'actor') {
          const container = event.node.parent!;
          projectStore.containerPods[container.resource!.id].asset3D =
            projectStore.containerPods[container.resource!.id].asset3D.filter(
              (asset) => asset.id !== event.node.resource!.id
            );

          const toRemove = this.renderer.scene.children.find(
            (c) => c.id === event.node.resource!.id
          );

          if (toRemove) this.renderer.scene.removeChild(toRemove);
        }
      }
    };

    const onRequestRendererEvent = (event: Event) => {
      ((event as CustomEvent).detail as ViewportEventDetails).renderer =
        this.renderer;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Equal' || event.code === 'NumpadAdd') {
        this.gizmo?.increaseSize();
        this.updateGizmoScale();
      } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
        this.gizmo?.decreaseSize();
        this.updateGizmoScale();
      }
    };

    this.onMount = () => {
      projectStore.dispatcher.add(onProjectEvent);
      sceneGraphStore.dispatcher.add(onSceneGraphEvent);

      // Listen for custom event to get the renderer
      document.addEventListener('request-renderer', onRequestRendererEvent);
      document.addEventListener('keydown', onKeyDown);
    };

    this.onCleanup = () => {
      projectStore.dispatcher.remove(onProjectEvent);
      sceneGraphStore.dispatcher.remove(onSceneGraphEvent);
      document.removeEventListener('request-renderer', onRequestRendererEvent);
      document.removeEventListener('keydown', onKeyDown);
      this.removeCameraObserver();
    };

    const onCanvasReady = async (pane3D: Pane3D) => {
      try {
        if (this.hasInitialized) return; // Prevent re-initialization
        this.hasInitialized = true;

        await this.renderer.init(pane3D.canvas()!);
        await this.templateLoader.load();

        this.gizmo = new Gizmo();
        this.dragController = new GizmoDragController(
          this.renderer,
          this.gizmo
        );

        this.installCameraObserver();

        pane3D.onclick = onClick;
        pane3D.onmousedown = onMouseDown;
        pane3D.onmousemove = onMouseMove;
        pane3D.onmouseup = onMouseUp;
      } catch (err: unknown) {
        console.error(err);
      }
    };

    const onClick = (event: MouseEvent) => {
      // Suppress selection when a drag just completed
      if (this.didDrag) {
        this.didDrag = false;
        return;
      }

      const intersection = get3DCoords(event.clientX, event.clientY);
      if (intersection && intersection.object.component instanceof Mesh) {
        // Walk up the Transform parent chain to find the root scene graph node
        let current: Transform | null = intersection.object;
        let clickedNode = null;
        while (current && current !== this.renderer.scene) {
          clickedNode = sceneGraphStore.findNodeById(current.id);
          if (clickedNode) break;
          current = current.parent;
        }
        if (clickedNode) {
          sceneGraphStore.setSelectedNode(clickedNode);
        } else sceneGraphStore.setSelectedNode(null);
      } else {
        // Clicked empty space — deselect
        sceneGraphStore.setSelectedNode(null);
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (
        !this.gizmo ||
        !this.gizmo.transform.parent ||
        !this.selectedTransform
      )
        return;

      const intersection = get3DCoords(event.clientX, event.clientY, [
        this.gizmo.transform,
      ]);
      if (!intersection) return;

      const started = this.dragController.tryStartDrag(
        intersection,
        this.selectedTransform,
        this.renderer.perspectiveCam.camera.transform
      );
      if (started) {
        this.didDrag = true;
        this.renderer.camController.cancelInteraction();
        this.renderer.camController.enabled = false;
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!this.gizmo || !this.gizmo.transform.parent) return;

      if (this.dragController.isDragging) {
        const raycaster = createRaycaster(event.clientX, event.clientY);
        this.dragController.updateDrag(raycaster.ray, event.altKey);
        return;
      }

      const intersection = get3DCoords(event.clientX, event.clientY, [
        this.gizmo.transform,
      ]);
      const hoveredMesh =
        intersection?.object.component instanceof Mesh
          ? (intersection.object.component as Mesh)
          : null;
      this.gizmo.updateHover(hoveredMesh);
    };

    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!this.dragController.isDragging) return;

      this.renderer.camController.enabled = true;
      const result = this.dragController.endDrag();
      if (result && this.selectedTransform) {
        // Find the container that owns this node
        const node = sceneGraphStore.findNodeById(this.selectedTransform.id);
        const containerId = node?.parent?.resource?.id;
        if (containerId && projectStore.containerPods[containerId]) {
          const asset = projectStore.containerPods[containerId].asset3D.find(
            (a) => a.id === this.selectedTransform!.id
          );
          if (asset) {
            asset.position = result.position;
            asset.rotation = result.rotation;
          }
        }
        projectStore.defaultProxy.dirty = true;
      }
    };

    const createRaycaster = (clientX: i32, clientY: i32): Raycaster => {
      const pointer = new Vector2();
      const raycaster = new Raycaster();
      const rect = pane3D.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, this.renderer.perspectiveCam);
      return raycaster;
    };

    const get3DCoords = (clientX: i32, clientY: i32, targets?: Transform[]) => {
      const raycaster = createRaycaster(clientX, clientY);
      const intersects = raycaster.intersectObjects(
        targets ?? [this.renderer.scene],
        true
      );

      if (intersects.length > 0) {
        const intersection = intersects[0];
        return intersection;
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

      const node = (curDragAction as ITreeNodeAction).node;

      if (curDragAction?.type !== 'treenode') return;
      if (node.resource?.type === 'actor' && !node.resource?.templateId) {
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

      const intersection = get3DCoords(e.clientX, e.clientY);
      const point = intersection?.point;

      if (point && json.node.resource) {
        const createdResource = (await this.templateLoader.createResource(
          json.node.resource,
          this.renderer
        )) as Asset3D;

        const halfHeight = computeObjectHalfHeight(createdResource.transform);
        point.y += halfHeight;

        const normal = intersection!.face!.normal;
        const rotation = computeRotationFromNormal(normal);

        // Update the container pod with the transform position
        projectStore.containerPods[activeContainerId].asset3D.push({
          id: json.node.resource.id,
          position: [point.x, point.y, point.z],
          rotation,
        });

        // Add the node to the scene graph
        const newNode = sceneGraphStore.addNode(
          json.node,
          sceneGraphStore.findNodeById(activeContainerId)
        );

        sceneGraphStore.setSelectedNode(newNode || null);

        createdResource.transform.position.set(point.x, point.y, point.z);
        createdResource.transform.rotation.setFromQuaternion(
          new Quaternion(rotation[0], rotation[1], rotation[2], rotation[3])
        );
        this.renderer.scene.addChild(createdResource.transform);
      }
    };

    const pane3D = (<Pane3D onCanvasReady={onCanvasReady} />) as Pane3D;

    pane3D.ondragover = onDragOverEvent;
    pane3D.ondragleave = onDragLeave;
    pane3D.ondrop = onDrop;
    pane3D.onclick = onClick;

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

  private _cameraWorldPos = new Vector3();
  private _updatingGizmoScale = false;

  private updateGizmoScale(): void {
    if (this._updatingGizmoScale) return;
    if (!this.gizmo || !this.gizmo.transform.parent) return;
    this._updatingGizmoScale = true;
    this.renderer.perspectiveCam.camera.transform.getWorldPosition(
      this._cameraWorldPos
    );
    this.gizmo.updateScale(this._cameraWorldPos);
    this._updatingGizmoScale = false;
  }

  private installCameraObserver(): void {
    this.cameraObserver = {
      worldMatrixUpdated: () => this.updateGizmoScale(),
    };
    this.renderer.perspectiveCam.camera.transform.observers.push(
      this.cameraObserver
    );
  }

  private removeCameraObserver(): void {
    if (!this.cameraObserver) return;
    const observers = this.renderer.perspectiveCam.camera.transform.observers;
    const idx = observers.indexOf(this.cameraObserver);
    if (idx !== -1) observers.splice(idx, 1);
    this.cameraObserver = null;
  }

  dispose() {
    this.removeCameraObserver();
    this.gizmo?.dispose();
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
