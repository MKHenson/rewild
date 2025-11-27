import { StateMachine } from 'rewild-routing';
import {
  PointerLockController,
  PointerLockEventType,
  Renderer,
} from 'rewild-renderer';
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
  camController: PointerLockController;
  clock: Clock;
  RAPIER: typeof import('@dimforge/rapier3d-compat');
  physicsWorld: World;
  onUnlock: () => void;
  PointerLockChangedDelegate: (event: PointerLockEventType) => void;
  TerrainEventDelegate: (event: TerrainEvent) => void;
  terrainRapierBodyMap: Map<string, RigidBody>;

  constructor(player: Player, onUnlock: () => void) {
    this.hasInitialized = false;
    this.renderer = new Renderer();
    this.stateMachine = new StateMachine();
    this.player = player;
    this.clock = new Clock();
    this.onUnlock = onUnlock;
    this.PointerLockChangedDelegate = this.handleOnPointerLockChange.bind(this);
    this.TerrainEventDelegate = this.onTerrainEvent.bind(this);
    this.terrainRapierBodyMap = new Map();
  }

  lock() {
    this.camController.lock();
  }

  async init(pane3D: Pane3D) {
    try {
      if (this.hasInitialized) return false; // Prevent re-initialization
      this.hasInitialized = true;

      await this.initPhysics();
      await this.renderer.init(pane3D.canvas()!, false);
      this.camController = new PointerLockController(
        this.renderer.perspectiveCam,
        document.body
      );

      this.renderer.setCamController(this.camController, document.body);
      this.player.setCamera(this.renderer.perspectiveCam);
      const stateMachine = await loadInitialLevels(this.player, this);

      this.renderer.terrainRenderer.dispatcher.add(this.TerrainEventDelegate);

      if (!stateMachine) throw new Error('Could not load statemachine');

      this.stateMachine = stateMachine;
      this.clock.start();
      this.camController.lock();
      this.camController.dispatcher.add(this.PointerLockChangedDelegate);
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
          // Create a stable trimesh collider for the ground using the loaded mesh
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
            // Tag this rigid body so hits can be identified as terrain later
            rb.userData = { isTerrain: true };
            const collider = this.physicsWorld.createCollider(triDesc, rb);

            const TERRAIN_BIT = 1;
            const TERRAIN_GROUPS = (TERRAIN_BIT << 16) | TERRAIN_BIT;
            collider.setCollisionGroups(TERRAIN_GROUPS);

            this.terrainRapierBodyMap.set(event.chunk.id, rb);
          }
        }
        break;
      case 'chunk-disposed':
        // Handle chunk disposed event if needed
        const rb = this.terrainRapierBodyMap.get(event.chunk.id);
        if (rb) {
          // Remove all colliders associated with this rigid body
          const numColliders = rb.numColliders();
          for (let i = 0; i < numColliders; i++) {
            const collider = rb.collider(i);
            this.physicsWorld.removeCollider(collider, false);
          }
          this.physicsWorld.removeRigidBody(rb);
          this.terrainRapierBodyMap.delete(
            `${event.chunk.position.x},${event.chunk.position.y}`
          );
        }
        break;
    }
  }

  async initPhysics() {
    this.RAPIER = await import('@dimforge/rapier3d-compat');
    await this.RAPIER.init();

    // Use the RAPIER module here.
    let gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.physicsWorld = new this.RAPIER.World(gravity);

    // THIS WORKS
    // let groundColliderDesc = this.RAPIER.ColliderDesc.cuboid(50.0, 0.1, 50.0);
    // this.physicsWorld.createCollider(groundColliderDesc);

    // THIS Doesnt WORK - but should
    // Inside your initialized GameManager (after `await this.RAPIER.init()` and world creation)
    // const R = this.RAPIER;

    // const rows = 2;
    // const cols = 2;
    // const heights = new Float32Array([0, 0, 0, 0]);
    // // Non-zero X/Z spacing; Y=1 for height scale.
    // const hfDesc = R.ColliderDesc.heightfield(
    //   rows,
    //   cols,
    //   heights,
    //   new R.Vector3(1, 1, 1)
    // );

    // // Attach to a fixed rigid body (safer than collider-only)
    // const rb = this.physicsWorld.createRigidBody(
    //   R.RigidBodyDesc.fixed().setTranslation(0, 0, 0)
    // );
    // this.physicsWorld.createCollider(hfDesc, rb);
  }

  handleOnPointerLockChange(event: PointerLockEventType) {
    switch (event.type) {
      case 'lock':
        break;
      case 'unlock':
        this.onUnlock();
        break;
      case 'change':
        // Handle pointer change
        break;
    }
  }

  onUpdate() {
    const clock = this.clock;
    const delta = clock.getDelta();
    const total = clock.getElapsedTime();

    // Step the simulation forward.
    this.physicsWorld.step();

    // // Get and print the rigid-body's position.
    // let position = rigidBody.translation();
    // console.log('Rigid-body position: ', position.x, position.y);

    this.stateMachine?.OnLoop(delta, total);
    this.renderer.onFrame();
  }

  dispose() {
    this.stateMachine?.dispose();
    this.renderer.dispose();
    this.camController.dispose();

    this.camController.dispatcher.remove(this.PointerLockChangedDelegate);
    this.renderer.terrainRenderer.dispatcher.remove(this.TerrainEventDelegate);
  }
}
