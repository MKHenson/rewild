import { StateMachine } from 'rewild-routing';
import { Renderer } from 'rewild-renderer';
import { Pane3D } from 'rewild-ui';
import { Player } from './routing/Player';
import { Clock } from './Clock';
import { loadInitialLevels } from './GameLoader';
import { RigidBody, World } from '@dimforge/rapier3d-compat';
import { TerrainEvent } from 'rewild-renderer/lib/renderers/terrain/TerrainRenderer';
import { ScatterColliderStreamer } from './physics/ScatterColliderStreamer';
import { registerScatterColliderCommands } from './debug/ScatterDebugCommands';

export class GameManager {
  renderer: Renderer;
  stateMachine: StateMachine;
  hasInitialized: boolean;
  player: Player;
  clock: Clock;
  RAPIER: typeof import('@dimforge/rapier3d-compat');
  physicsWorld: World;
  onUnlock: () => void;
  private _onPointerlockChange: () => void;
  TerrainEventDelegate: (event: TerrainEvent) => void;
  terrainRapierBodyMap: Map<string, RigidBody>;
  scatterColliders: ScatterColliderStreamer;

  constructor(player: Player, onUnlock: () => void) {
    this.hasInitialized = false;
    this.renderer = new Renderer();
    this.stateMachine = new StateMachine();
    this.player = player;
    this.clock = new Clock();
    this.onUnlock = onUnlock;
    this._onPointerlockChange = this._handlePointerlockChange.bind(this);
    this.TerrainEventDelegate = this.onTerrainEvent.bind(this);
    this.terrainRapierBodyMap = new Map();
  }

  lock() {
    this.player.requestLock();
  }

  async init(pane3D: Pane3D) {
    try {
      if (this.hasInitialized) return false;
      this.hasInitialized = true;

      await this.initPhysics();
      await this.renderer.init(pane3D.canvas()!, false);

      this.player.setCamera(this.renderer.camera);
      const stateMachine = await loadInitialLevels(this.player, this);

      this.renderer.terrainRenderer.dispatcher.add(this.TerrainEventDelegate);

      if (!stateMachine) throw new Error('Could not load statemachine');

      this.stateMachine = stateMachine;
      this.clock.start();

      document.addEventListener('pointerlockchange', this._onPointerlockChange);
      this.player.requestLock();

      return true;
    } catch (err: unknown) {
      console.error(err);
      return false;
    }
  }

  private onTerrainEvent(event: TerrainEvent) {
    switch (event.type) {
      case 'chunk-loaded':
        if (event.lod.lod === 0) {
          const mesh = event.lod.mesh;
          if (mesh?.geometry?.vertices && mesh?.geometry?.indices) {
            // An edit re-mesh replaces the chunk's geometry; drop the collider
            // built from the old mesh before creating the new one.
            this.removeTerrainBody(event.chunk.id);
            const verts = new Float32Array(mesh.geometry.vertices);
            const inds = new Uint32Array(mesh.geometry.indices);
            const triDesc = this.RAPIER.ColliderDesc.trimesh(verts, inds);
            const rb = this.physicsWorld.createRigidBody(
              this.RAPIER.RigidBodyDesc.fixed().setTranslation(
                event.chunk.position.x,
                0,
                event.chunk.position.y
              )
            );
            rb.userData = { isTerrain: true };
            const collider = this.physicsWorld.createCollider(triDesc, rb);

            const TERRAIN_BIT = 1;
            const TERRAIN_GROUPS = (TERRAIN_BIT << 16) | TERRAIN_BIT;
            collider.setCollisionGroups(TERRAIN_GROUPS);

            this.terrainRapierBodyMap.set(event.chunk.id, rb);
          }
        }
        break;
      case 'scatter-loaded':
        this.scatterColliders.setChunk(
          event.chunk.id,
          event.chunk.position.x,
          event.chunk.position.y,
          this.renderer.terrainRenderer.chunkSize / 2,
          event.instances
        );
        break;
      case 'chunk-unloaded':
        this.removeTerrainBody(event.chunk.id);
        break;
      // Scatter stays resident through a GPU unload — the chunk is far past
      // the band by then — and goes only when the chunk does.
      case 'chunk-disposed':
        this.removeTerrainBody(event.chunk.id);
        this.scatterColliders.removeChunk(event.chunk.id);
        break;
    }
  }

  private removeTerrainBody(chunkId: string) {
    const rb = this.terrainRapierBodyMap.get(chunkId);
    if (!rb) return;
    const numColliders = rb.numColliders();
    for (let i = 0; i < numColliders; i++) {
      this.physicsWorld.removeCollider(rb.collider(i), false);
    }
    this.physicsWorld.removeRigidBody(rb);
    this.terrainRapierBodyMap.delete(chunkId);
  }

  async initPhysics() {
    this.RAPIER = await import('@dimforge/rapier3d-compat');
    await this.RAPIER.init();

    let gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.physicsWorld = new this.RAPIER.World(gravity);
    this.scatterColliders = new ScatterColliderStreamer(
      this.RAPIER,
      this.physicsWorld
    );
    registerScatterColliderCommands(this.scatterColliders);
  }

  private _handlePointerlockChange() {
    if (!document.pointerLockElement) {
      this.onUnlock();
    }
  }

  onUpdate() {
    const clock = this.clock;
    const delta = clock.getDelta();
    const total = clock.getElapsedTime();

    const viewer = this.renderer.camera.camera.transform.position;
    this.scatterColliders.update(viewer.x, viewer.y, viewer.z);
    this.physicsWorld.step();

    this.stateMachine?.OnLoop(delta, total);
    this.renderer.onFrame();
  }

  dispose() {
    this.stateMachine?.dispose();
    this.scatterColliders?.dispose();
    this.renderer.dispose();
    document.removeEventListener('pointerlockchange', this._onPointerlockChange);
    this.renderer.terrainRenderer.dispatcher.remove(this.TerrainEventDelegate);
  }
}
