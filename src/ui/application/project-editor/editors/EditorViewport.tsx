import {
  Component,
  register,
  Pane3D,
  curDragAction,
  compelteDragDrop,
  theme,
  Loading,
  InfoBox,
} from 'rewild-ui';
import { Mesh, Renderer, Sprite3D, Transform } from 'rewild-renderer';
import { TerrainEvent } from 'rewild-renderer/lib/renderers/terrain/TerrainRenderer';
import { OrbitController } from 'rewild-renderer/lib/input/OrbitController';
import { InteractionLayer } from 'src/core/InteractionLayer';
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
import { TerrainSculptController } from './utils/TerrainSculptController';
import {
  computeGroundOffset,
  computeRotationFromNormal,
  raycastToSurface,
} from './utils/WorldPlacement';
import { sculptStore } from 'src/ui/stores/SculptStore';
import { SculptToolbar } from './SculptToolbar';
import { biomePaintStore } from 'src/ui/stores/BiomePaintStore';
import { BiomePaintToolbar } from './BiomePaintToolbar';
import { TerrainBiomePaintController } from './utils/TerrainBiomePaintController';
import { loadCameraState, saveCameraState } from './utils/CameraPersistence';
import {
  resolvePlacement,
  writeBackPlacement,
} from 'src/core/placement/ConformedPlacement';

interface Props {}

// How far above/below the terrain reference the orbit camera's ground probe
// scans for placed objects — structures up to this tall are ridden over.
const SURFACE_PROBE_CLEARANCE = 500;

// Longest the loading overlay is held waiting for terrain before giving up.
//
// Armed only once the renderer has finished initializing, not on mount: renderer
// init pulls the whole texture library (~95MB cold) and legitimately outruns any
// terrain-shaped budget. Timing that too would dismiss the overlay mid-download,
// which looks exactly like a broken editor.
const TERRAIN_TIMEOUT_MS = 20000;

export interface ViewportEventDetails {
  renderer: Renderer | null;
  orbitController: OrbitController | null;
}

@register('x-editor-viewport')
export class EditorViewport extends Component<Props> {
  renderer: Renderer;
  orbitController: OrbitController | null = null;
  hasInitialized = false;
  // hasInitialized is set when init *starts*, to keep it from running twice.
  // This one means init finished, which is what gates the terrain timeout.
  rendererReady = false;
  templateLoader: TemplateLoader;
  gizmo: Gizmo;
  dragController: GizmoDragController;
  sculptController: TerrainSculptController | null = null;
  biomePaintController: TerrainBiomePaintController | null = null;
  selectedTransform: Transform | null = null;
  private didDrag = false;
  private mouseDownPos = { x: 0, y: 0 };
  private cameraObserver: ITransformObserver | null = null;
  private cameraSaveHandle: number | null = null;
  private loadingTimeout: number | null = null;
  private viewportCanvas: HTMLCanvasElement | null = null;

  init() {
    this.renderer = new Renderer();
    this.templateLoader = new TemplateLoader();

    // The scene is only really "open" once terrain is on screen, which lands
    // well after the project record does — so the overlay is held until the
    // first chunk arrives rather than until the store finishes fetching.
    const [levelLoading, setLevelLoading] = this.useState(true);
    const [loadError, setLoadError] = this.useState<string | null>(null);

    const beginLevelLoad = () => {
      setLoadError(null);
      setLevelLoading(true);
      if (this.loadingTimeout !== null) {
        window.clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      // No timeout armed here. Until the renderer is up there is nothing to time
      // out *of* — the wait is asset downloads, whose length is the user's
      // bandwidth, not a fault. armTerrainTimeout takes over once init lands.
      if (this.rendererReady) armTerrainTimeout();
    };

    // Terrain generation can fail outright; never trap the editor behind it.
    const armTerrainTimeout = () => {
      if (this.loadingTimeout !== null) {
        window.clearTimeout(this.loadingTimeout);
      }
      this.loadingTimeout = window.setTimeout(
        endLevelLoad,
        TERRAIN_TIMEOUT_MS
      );
    };

    const endLevelLoad = () => {
      if (this.loadingTimeout !== null) {
        window.clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      setLevelLoading(false);
    };

    // A dead renderer never raises chunk-loaded, so nothing else would ever
    // clear the overlay. Say what happened rather than dropping the user into an
    // editor that looks fine and cannot draw.
    const failLevelLoad = (err: unknown) => {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : String(err));
      endLevelLoad();
    };

    const onProjectEvent: Subscriber<ProjectStoreEvents> = (event) => {
      if (event.kind === 'loading-initiated') beginLevelLoad();

      if (event.kind === 'loading-completed') {
        SyncRendererFromProject(this.renderer, event.project);
        // Reloading a scene should keep the last viewpoint rather than snap
        // back to the default camera. The orbit controller may not exist yet
        // on the very first load — onCanvasReady restores in that case.
        this.restoreSavedCamera();
      }
    };

    this.on(projectStore.dispatcher, onProjectEvent);

    // After terrain (re)generates — a seed change or a map load — the surface
    // under the camera may now sit above it. The orbit clamp that keeps the
    // camera above ground only runs during interaction, so re-run it once the
    // chunk beneath the camera becomes available to lift the camera clear.
    const onTerrainEvent: Subscriber<TerrainEvent> = (event) => {
      // First chunk on screen is the earliest point the scene is worth showing.
      if (event.type === 'chunk-loaded') endLevelLoad();

      if (event.type !== 'chunk-loaded' || !this.orbitController) return;
      const cam = this.renderer.camera.camera.transform.position;
      const b = event.chunk.bounds;
      if (
        cam.x >= b.min.x &&
        cam.x <= b.max.x &&
        cam.z >= b.min.z &&
        cam.z <= b.max.z
      ) {
        this.orbitController.update();
      }
    };

    this.on(this.renderer.terrainRenderer.dispatcher, onTerrainEvent);

    // Sculpt mode toggling (ribbon button / Esc). Turning it off mid-stroke
    // ends the stroke cleanly (saving touched chunks) and restores the orbit
    // camera; re-render shows/hides the brush toolbar overlay.
    this.on(sculptStore.dispatcher, () => {
      if (!sculptStore.enabled) {
        endSculptStroke();
        this.sculptController?.hideCursor();
      }
      this.render();
    });

    // Biome paint mode toggling — the same lifecycle as sculpt above. The two
    // brushes are mutually exclusive (the ribbon disarms one when the other is
    // armed), so they never both own the pointer.
    this.on(biomePaintStore.dispatcher, () => {
      if (!biomePaintStore.enabled) {
        endPaintStroke();
        this.biomePaintController?.hideCursor();
      }
      this.render();
    });

    const endSculptStroke = () => {
      if (!this.sculptController?.isSculpting) return;
      this.sculptController.endStroke().catch((err) => {
        console.error('Failed to save sculpted chunks:', err);
      });
      if (this.orbitController) this.orbitController.enabled = true;
    };

    const endPaintStroke = () => {
      if (!this.biomePaintController?.isPainting) return;
      this.biomePaintController.endStroke().catch((err) => {
        console.error('Failed to save painted biome masks:', err);
      });
      if (this.orbitController) this.orbitController.enabled = true;
    };

    const setTransformSelected = (transform: Transform, value: boolean) => {
      transform.selected = value;
      transform.traverse((child) => {
        child.selected = value;
        if (child.userData.isHelper) {
          child.visible = value;
        }
      });
    };

    const onSceneGraphEvent: Subscriber<SceneGraphEvents> = async (event) => {
      if (event.kind === 'resource-selected') {
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
              resolvePlacement(
                assetPodData,
                this.renderer.terrainRenderer,
                createdResource.transform.position,
                this._placementRotation
              );
              createdResource.transform.rotation.setFromQuaternion(
                this._placementRotation
              );

              this.renderer.scene.addChild(createdResource.transform);
              syncFromEditorResource(createdResource.id, this.renderer);
            }
          }
        }
        this.render();
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
        this.render();
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
      } else if (event.kind === 'nodes-updated') {
        if (sceneGraphStore.selectedResource?.id) {
          syncFromEditorResource(
            sceneGraphStore.selectedResource.id,
            this.renderer
          );
        }
      }
    };

    this.on(sceneGraphStore.dispatcher, onSceneGraphEvent);

    const onRequestRendererEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail as ViewportEventDetails;
      detail.renderer = this.renderer;
      detail.orbitController = this.orbitController;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && sculptStore.enabled) {
        sculptStore.setEnabled(false);
      } else if (event.code === 'Escape' && biomePaintStore.enabled) {
        biomePaintStore.setEnabled(false);
      } else if (event.code === 'Equal' || event.code === 'NumpadAdd') {
        this.gizmo?.increaseSize();
        this.updateGizmoScale();
      } else if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
        this.gizmo?.decreaseSize();
        this.updateGizmoScale();
      } else if (event.code === 'NumpadDecimal') {
        this.focusCameraOnSelected();
      }
    };

    this.onMount = () => {
      document.addEventListener('request-renderer', onRequestRendererEvent);
      document.addEventListener('keydown', onKeyDown);
      beginLevelLoad();
    };

    this.onCleanup = () => {
      document.removeEventListener('request-renderer', onRequestRendererEvent);
      document.removeEventListener('keydown', onKeyDown);
      if (this.loadingTimeout !== null) {
        window.clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
      this.removeCameraObserver();
    };

    const onCanvasReady = async (pane3D: Pane3D) => {
      try {
        if (this.hasInitialized) return;
        this.hasInitialized = true;

        await this.renderer.init(pane3D.canvas()!);
        this.orbitController = new OrbitController(
          this.renderer.camera,
          pane3D.canvas()!
        );
        this.orbitController.minCameraY = 0.5;
        // Ground clamp: the camera rides over everything in the world —
        // terrain AND placed objects. Terrain height comes from the in-memory
        // heightfield (exact at any altitude, tracks live sculpt edits before
        // the re-mesh lands); a scene probe anchored to it catches whatever
        // sits on top. The old fixed ray window (y ∈ [-100, 100]) let the
        // camera fly through sculpted hills taller than 100m.
        this.orbitController.getTerrainHeight = (x, z) => {
          const terrainH = this.renderer.terrainRenderer.sampleHeight(x, z);
          const refY =
            terrainH ?? this.renderer.camera.camera.transform.position.y;
          const hit = raycastToSurface(
            this.renderer,
            this._surfaceProbePos.set(x, refY, z),
            undefined,
            SURFACE_PROBE_CLEARANCE,
            SURFACE_PROBE_CLEARANCE * 2
          );
          if (hit && terrainH !== null)
            return Math.max(hit.point.y, terrainH);
          return hit?.point.y ?? terrainH;
        };
        await this.templateLoader.load();

        // Everything above — GPU device, ~95MB of textures, geometry, templates —
        // is what the overlay is really covering on a cold load. Only now does a
        // terrain chunk become possible, so only now is a terrain timeout
        // meaningful.
        this.rendererReady = true;
        if (levelLoading()) armTerrainTimeout();

        this.gizmo = new Gizmo();
        this.dragController = new GizmoDragController(
          this.renderer,
          this.gizmo
        );
        this.sculptController = new TerrainSculptController(this.renderer);
        this.biomePaintController = new TerrainBiomePaintController(
          this.renderer
        );

        this.installCameraObserver();

        // Persist the camera after any orbit/pan/zoom interaction so the next
        // scene reload restores this viewpoint. Debounced so a burst of wheel
        // ticks or a drag collapses into a single write.
        this.viewportCanvas = pane3D.canvas()!;
        this.viewportCanvas.addEventListener(
          'pointerup',
          this.scheduleCameraSave
        );
        this.viewportCanvas.addEventListener('wheel', this.scheduleCameraSave, {
          passive: true,
        });

        // If the project loaded before the canvas was ready, the earlier
        // loading-completed restore was a no-op — apply the saved camera now.
        this.restoreSavedCamera();

        pane3D.onclick = onClick;
        pane3D.onmousedown = onMouseDown;
        pane3D.onmousemove = onMouseMove;
        pane3D.onmouseup = onMouseUp;
      } catch (err: unknown) {
        failLevelLoad(err);
      }
    };

    const onClick = (event: MouseEvent) => {
      // A terrain brush owns the pointer — clicks never select/deselect.
      if (sculptStore.enabled || biomePaintStore.enabled) return;
      if (this.didDrag) {
        this.didDrag = false;
        return;
      }

      const intersection = get3DCoords(event.clientX, event.clientY);
      if (
        intersection &&
        (intersection.object.component instanceof Mesh ||
          intersection.object.component instanceof Sprite3D)
      ) {
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
        sceneGraphStore.setSelectedNode(null);
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;

      if (sculptStore.enabled && this.sculptController) {
        // Alt+drag is the camera escape hatch: the brush owns left-drag, which
        // would otherwise leave orbit-rotate unreachable in sculpt mode (pan
        // and zoom still have their own buttons). Bailing here leaves the
        // orbit controller enabled, and its own pointer handler — which reads
        // Alt as a plain rotate — takes the drag.
        if (event.altKey) return;

        const hit = this.sculptController.pickTerrain(
          createRaycaster(event.clientX, event.clientY)
        );
        if (hit) {
          // Suspend orbit for the stroke so the camera and the brush don't
          // fight over left-drag; right-drag/wheel keep working on release.
          this.orbitController?.cancelInteraction();
          if (this.orbitController) this.orbitController.enabled = false;
          this.sculptController.beginStroke(hit.point, event.shiftKey);
          // The stroke must end even when the pointer is released off-canvas.
          document.addEventListener('mouseup', onSculptDocumentMouseUp);
        }
        return;
      }

      if (biomePaintStore.enabled && this.biomePaintController) {
        // Alt+drag is the camera escape hatch, exactly as in sculpt mode.
        if (event.altKey) return;

        const hit = this.biomePaintController.pickTerrain(
          createRaycaster(event.clientX, event.clientY)
        );
        if (hit) {
          this.orbitController?.cancelInteraction();
          if (this.orbitController) this.orbitController.enabled = false;
          // Shift erases, mirroring Shift-inverts on the sculpt brush.
          this.biomePaintController.beginStroke(hit.point, event.shiftKey);
          document.addEventListener('mouseup', onPaintDocumentMouseUp);
        }
        return;
      }

      this.mouseDownPos.x = event.clientX;
      this.mouseDownPos.y = event.clientY;
      this.didDrag = false;
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
        this.renderer.camera.camera.transform
      );
      if (started) {
        this.didDrag = true;
        this.orbitController?.cancelInteraction();
        if (this.orbitController) this.orbitController.enabled = false;
      }
    };

    const onSculptDocumentMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) return;
      document.removeEventListener('mouseup', onSculptDocumentMouseUp);
      endSculptStroke();
    };

    const onPaintDocumentMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) return;
      document.removeEventListener('mouseup', onPaintDocumentMouseUp);
      endPaintStroke();
    };

    const onMouseMove = (event: MouseEvent) => {
      if (sculptStore.enabled && this.sculptController) {
        // Alt means the camera has the drag — the brush is inactive, so drop
        // the ring rather than have it chase the cursor across a swinging
        // view, and skip the picking/warm-up work behind it.
        if (event.altKey && !this.sculptController.isSculpting) {
          this.sculptController.hideCursor();
          return;
        }

        const hit = this.sculptController.pickTerrain(
          createRaycaster(event.clientX, event.clientY)
        );
        if (this.sculptController.isSculpting) {
          if (hit) this.sculptController.moveStroke(hit.point);
        } else if (hit) {
          // Warm up chunks under the brush so they are editable the moment a
          // stroke reaches them (snapshot lookup / baseline generation).
          this.sculptController.prefetchHeights(
            hit.point.x,
            hit.point.z,
            sculptStore.radius
          );
        }
        this.sculptController.updateCursor(hit?.point ?? null);
        return;
      }

      if (biomePaintStore.enabled && this.biomePaintController) {
        if (event.altKey && !this.biomePaintController.isPainting) {
          this.biomePaintController.hideCursor();
          return;
        }

        const hit = this.biomePaintController.pickTerrain(
          createRaycaster(event.clientX, event.clientY)
        );
        if (this.biomePaintController.isPainting) {
          if (hit) this.biomePaintController.moveStroke(hit.point);
        } else if (hit) {
          // Warm up chunks under the brush so they are paintable the moment a
          // stroke reaches them (saved-mask lookup).
          this.biomePaintController.prefetchMasks(
            hit.point.x,
            hit.point.z,
            biomePaintStore.radius
          );
        }
        this.biomePaintController.updateCursor(hit?.point ?? null);
        return;
      }

      if (event.buttons & 1 && !this.dragController.isDragging) {
        const dx = event.clientX - this.mouseDownPos.x;
        const dy = event.clientY - this.mouseDownPos.y;
        if (dx * dx + dy * dy > 25) this.didDrag = true;
      }

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
      // Brush strokes end via their document-level listeners (which also fire
      // for on-canvas releases), so nothing to do here for them.
      if (this.sculptController?.isSculpting) return;
      if (this.biomePaintController?.isPainting) return;
      if (!this.dragController.isDragging) return;

      if (this.orbitController) this.orbitController.enabled = true;
      const result = this.dragController.endDrag();
      if (result && this.selectedTransform) {
        const node = sceneGraphStore.findNodeById(this.selectedTransform.id);
        const containerId = node?.parent?.resource?.id;
        if (containerId && projectStore.containerPods[containerId]) {
          const asset = projectStore.containerPods[containerId].asset3D.find(
            (a) => a.id === this.selectedTransform!.id
          );
          if (asset) {
            // Conformed assets store the drag as an offset above the ground,
            // so the move survives the next sculpt instead of being overwritten.
            writeBackPlacement(
              asset,
              this.renderer.terrainRenderer,
              this._placementPosition.fromArray(result.position),
              result.rotation
            );
          }
        }
        projectStore.dirty = true;
        projectStore.dispatcher.dispatch({ kind: 'changed' });
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
      raycaster.setFromCamera(pointer, this.renderer.camera);
      raycaster.layers.enable(InteractionLayer.Helper);
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
      if (!sceneGraphStore.selectedContainerId) {
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

      const activeContainerId = sceneGraphStore.selectedContainerId;

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

        point.y += computeGroundOffset(createdResource.transform);

        const normal = intersection!.face!.normal;
        const rotation = computeRotationFromNormal(normal);

        projectStore.containerPods[activeContainerId].asset3D.push({
          id: json.node.resource.id,
          position: [point.x, point.y, point.z],
          rotation,
        });

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

    // Persistent wrapper so the canvas is never re-parented on re-render; each
    // brush toolbar overlay is attached/detached as its mode toggles. The two
    // modes are mutually exclusive, so at most one is ever mounted.
    const sculptToolbar = (<SculptToolbar />) as SculptToolbar;
    const biomePaintToolbar = (<BiomePaintToolbar />) as BiomePaintToolbar;
    const loadingOverlay = (
      <Loading overlay label="Loading level" />
    ) as Loading;
    const errorBox = (
      <InfoBox variant="error" title="Could not open the level" />
    ) as InfoBox;
    const container = (
      <div class="viewport-container">{pane3D}</div>
    ) as HTMLDivElement;

    return () => {
      this.toggleAttribute('activated', !!sceneGraphStore.selectedContainerId);
      if (levelLoading()) {
        if (!loadingOverlay.parentElement)
          container.appendChild(loadingOverlay);
      } else {
        loadingOverlay.remove();
      }
      const error = loadError();
      if (error) {
        errorBox.textContent = error;
        if (!errorBox.parentElement) container.appendChild(errorBox);
      } else {
        errorBox.remove();
      }
      if (sculptStore.enabled) {
        if (!sculptToolbar.parentElement) container.appendChild(sculptToolbar);
      } else {
        sculptToolbar.remove();
      }
      if (biomePaintStore.enabled) {
        if (!biomePaintToolbar.parentElement)
          container.appendChild(biomePaintToolbar);
      } else {
        biomePaintToolbar.remove();
      }
      return container;
    };
  }

  getStyle() {
    return StyledContainer;
  }

  private _cameraWorldPos = new Vector3();
  private _surfaceProbePos = new Vector3();
  private _placementRotation = new Quaternion();
  private _placementPosition = new Vector3();
  private _updatingGizmoScale = false;
  private _focusCenter = new Vector3();
  private _focusDir = new Vector3();
  private _focusSize = new Vector3();

  private updateGizmoScale(): void {
    if (this._updatingGizmoScale) return;
    if (!this.gizmo || !this.gizmo.transform.parent) return;
    this._updatingGizmoScale = true;
    this.renderer.camera.camera.transform.getWorldPosition(
      this._cameraWorldPos
    );
    this.gizmo.updateScale(this._cameraWorldPos);
    this._updatingGizmoScale = false;
  }

  private scheduleCameraSave = (): void => {
    if (this.cameraSaveHandle !== null) {
      window.clearTimeout(this.cameraSaveHandle);
    }
    this.cameraSaveHandle = window.setTimeout(() => {
      this.cameraSaveHandle = null;
      const projectId = projectStore.project?.id;
      if (!projectId || !this.orbitController) return;
      saveCameraState(
        projectId,
        this.renderer.camera.camera.transform.position,
        this.orbitController.target
      );
    }, 400);
  };

  private restoreSavedCamera(): void {
    const projectId = projectStore.project?.id;
    if (!projectId || !this.orbitController) return;

    const state = loadCameraState(projectId);
    if (!state) return;

    this.renderer.camera.camera.transform.position.set(
      state.position[0],
      state.position[1],
      state.position[2]
    );
    this.orbitController.target.set(
      state.target[0],
      state.target[1],
      state.target[2]
    );
    // Rebuild the camera's spherical state and orientation from the restored
    // position/target so the next drag continues smoothly from here.
    this.orbitController.update();
  }

  private installCameraObserver(): void {
    this.cameraObserver = {
      worldMatrixUpdated: () => this.updateGizmoScale(),
    };
    this.renderer.camera.camera.transform.observers.push(this.cameraObserver);
  }

  private removeCameraObserver(): void {
    if (!this.cameraObserver) return;
    const observers = this.renderer.camera.camera.transform.observers;
    const idx = observers.indexOf(this.cameraObserver);
    if (idx !== -1) observers.splice(idx, 1);
    this.cameraObserver = null;
  }

  focusCameraOnSelected(): void {
    if (!this.selectedTransform || !this.orbitController) return;

    this.selectedTransform.getWorldPosition(this._focusCenter);

    let boundingRadius = 1;
    if (this.selectedTransform.component instanceof Mesh) {
      this.selectedTransform.component.geometry.computeBoundingBox();
      const bbox = this.selectedTransform.component.geometry.boundingBox;
      if (bbox) {
        bbox.getSize(this._focusSize);
        boundingRadius =
          Math.max(this._focusSize.x, this._focusSize.y, this._focusSize.z) *
          0.5;
      }
    }

    const desiredDistance = Math.max(boundingRadius * 2.5, 4.5);
    const camPos = this.renderer.camera.camera.transform.position;

    this._focusDir.copy(camPos).sub(this._focusCenter);
    const currentDist = this._focusDir.length();
    if (currentDist > 0.0001) {
      this._focusDir.multiplyScalar(desiredDistance / currentDist);
    } else {
      this._focusDir.set(0, desiredDistance * 0.5, desiredDistance);
    }

    this.orbitController.target.copy(this._focusCenter);
    camPos.copy(this._focusCenter).add(this._focusDir);
    this.orbitController.update();
  }

  dispose() {
    if (this.cameraSaveHandle !== null) {
      window.clearTimeout(this.cameraSaveHandle);
      this.cameraSaveHandle = null;
    }
    if (this.loadingTimeout !== null) {
      window.clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
    if (this.viewportCanvas) {
      this.viewportCanvas.removeEventListener(
        'pointerup',
        this.scheduleCameraSave
      );
      this.viewportCanvas.removeEventListener(
        'wheel',
        this.scheduleCameraSave
      );
      this.viewportCanvas = null;
    }
    this.removeCameraObserver();
    this.orbitController?.dispose();
    this.gizmo?.dispose();
    this.sculptController?.dispose();
    this.biomePaintController?.dispose();
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

  .viewport-container {
    height: 100%;
    width: 100%;
    position: relative;
  }

  x-info-box {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    max-width: min(32rem, 80%);
    z-index: 10;
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
