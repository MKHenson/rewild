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
import { World } from '@dimforge/rapier3d-compat';

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

  constructor(player: Player, onUnlock: () => void) {
    this.hasInitialized = false;
    this.renderer = new Renderer();
    this.stateMachine = new StateMachine();
    this.player = player;
    this.clock = new Clock();
    this.onUnlock = onUnlock;
    this.PointerLockChangedDelegate = this.handleOnPointerLockChange.bind(this);
  }

  lock() {
    this.camController.lock();
  }

  async init(pane3D: Pane3D) {
    try {
      if (this.hasInitialized) return false; // Prevent re-initialization
      this.hasInitialized = true;

      await this.renderer.init(pane3D.canvas()!, false);
      this.camController = new PointerLockController(
        this.renderer.perspectiveCam,
        document.body
      );

      this.renderer.setCamController(this.camController, document.body);
      this.player.setCamera(this.renderer.perspectiveCam);
      const stateMachine = await loadInitialLevels(this.player, this);

      if (!stateMachine) throw new Error('Could not load statemachine');

      this.stateMachine = stateMachine;
      this.clock.start();
      this.camController.lock();

      await this.initPhysics();

      this.camController.dispatcher.add(this.PointerLockChangedDelegate);
      return true;
    } catch (err: unknown) {
      console.error(err);
      return false;
    }
  }

  async initPhysics() {
    this.RAPIER = await import('@dimforge/rapier3d-compat');
    await this.RAPIER.init();

    // Use the RAPIER module here.
    let gravity = { x: 0.0, y: -9.81, z: 0.0 };
    this.physicsWorld = new this.RAPIER.World(gravity);

    // Create the ground
    let groundColliderDesc = this.RAPIER.ColliderDesc.cuboid(
      1000.0,
      0.1,
      1000.0
    );
    this.physicsWorld.createCollider(groundColliderDesc);

    // // Create a dynamic rigid-body.
    // let rigidBodyDesc = RigidBodyDesc.dynamic().setTranslation(
    //   0.0,
    //   1.0,
    //   0.0
    // );
    // let rigidBody = this.physicsWorld.createRigidBody(rigidBodyDesc);

    // // Create a cuboid collider attached to the dynamic rigidBody.
    // let colliderDesc = ColliderDesc.cuboid(0.5, 0.5, 0.5);
    // let collider = this.physicsWorld.createCollider(colliderDesc, rigidBody);
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
    this.camController.dispatcher.remove(this.PointerLockChangedDelegate);
    this.stateMachine?.dispose();
    this.renderer.dispose();
    this.camController.dispose();
  }
}
