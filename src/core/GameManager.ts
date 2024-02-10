import { Pane3D } from 'rewild-ui';
import { Renderer } from './renderer/Renderer';
import { GameLoader } from './GameLoader';
import { UIEventManager } from './UIEventManager';
import { IBindable, Player, WasmManager, wasm } from 'packages/rewild-wasmtime';
import { terrainManager } from './renderer/AssetManagers/TerrainManager';
import { skyboxManager } from './renderer/AssetManagers/SkyboxManager';
import { ApplicationEventType } from 'packages/rewild-common';
import { StateMachine } from 'packages/rewild-routing';
import { Clock } from './Clock';

export type UpdateCallback = () => void;

export class GameManager {
  renderer: Renderer | null;
  gameLoader: GameLoader;
  eventManager: UIEventManager;
  wasmManager: WasmManager;
  stateMachine: StateMachine;
  updateCallbacks: UpdateCallback[];
  player: Player;

  private clock: Clock;
  private onFrameHandler: () => void;

  constructor() {
    this.renderer = null;
    this.clock = new Clock();
    this.onFrameHandler = this.onFrame.bind(this);
    this.updateCallbacks = [];
  }

  async applicationStarted(pane3D: Pane3D) {
    this.renderer = new Renderer(pane3D);
    this.gameLoader = new GameLoader(this.renderer);
    this.eventManager = new UIEventManager();
    this.wasmManager = new WasmManager();

    const bindables: IBindable[] = [
      this.renderer,
      this.eventManager,
      terrainManager,
      skyboxManager,
    ];

    await this.wasmManager.load(bindables);

    if (!this.renderer.hasWebGPU()) return false;

    await this.renderer.init();
    await this.gameLoader.loadSystemContainers();
    this.player = new Player();

    // Call the first frame so the containers can initialize
    this.renderer.onFrame();

    window.requestAnimationFrame(this.onFrameHandler);
    this.clock.start();

    return true;
  }

  onFrame() {
    const callbacks = this.updateCallbacks;
    for (const callback of callbacks) callback();

    const clock = this.clock;
    const delta = clock.getDelta();

    window.requestAnimationFrame(this.onFrameHandler);
    wasm.update(clock.elapsedTime, delta);

    this.renderer!.onFrame();
  }

  async onStartClick() {
    this.stateMachine = await this.gameLoader.loadInitialLevels(this.player);
    this.eventManager.triggerUIEvent(ApplicationEventType.StartGame);
  }

  async onQuitClick() {
    this.eventManager.triggerUIEvent(ApplicationEventType.Quit);
    this.gameLoader.unloadInitialLevels();
  }
}

export const gameManager = new GameManager();
