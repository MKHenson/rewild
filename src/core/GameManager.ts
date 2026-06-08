import { StateMachine } from 'rewild-routing';
import { Renderer } from 'rewild-renderer';
import { Pane3D } from 'rewild-ui';
import { Player } from './routing/Player';
import { Clock } from './Clock';
import { loadInitialLevels } from './GameLoader';
import { RigidBody, World } from '@dimforge/rapier3d-compat';
import { TerrainEvent } from 'rewild-renderer/lib/renderers/terrain/TerrainRenderer';

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
      case 'chunk-unloaded':
      case 'chunk-disposed': {
        const rb = this.terrainRapierBodyMap.get(event.chunk.id);
        if (rb) {
          const numColliders = rb.numColliders();
          for (let i = 0; i < numColliders; i++) {
            this.physicsWorld.removeCollider(rb.collider(i), false);
          }
          this.physicsWorld.removeRigidBody(rb);
          this.terrainRapierBodyMap.delete(event.chunk.id);
        }
        break;
      }
    }
  }

  async initPhysics() {
    this.RAPIER = await import('@dimforge/rapier3d-compat');
    await this.RAPIER.init();

    let gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.physicsWorld = new this.RAPIER.World(gravity);
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

    this.physicsWorld.step();

    this.stateMachine?.OnLoop(delta, total);
    this.renderer.onFrame();
  }

  dispose() {
    this.stateMachine?.dispose();
    this.renderer.dispose();
    document.removeEventListener('pointerlockchange', this._onPointerlockChange);
    this.renderer.terrainRenderer.dispatcher.remove(this.TerrainEventDelegate);
  }
}
