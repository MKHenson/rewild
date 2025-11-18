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

export class GameManager {
  renderer: Renderer;
  stateMachine: StateMachine;
  hasInitialized: boolean;
  player: Player;
  camController: PointerLockController;
  clock: Clock;
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
      const stateMachine = await loadInitialLevels(this.player, this.renderer);

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
