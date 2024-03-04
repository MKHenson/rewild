import { Pane3D } from 'rewild-ui';
import { Renderer } from './renderer/Renderer';
import { loadInitialLevels } from './GameLoader';
import { UIEventManager } from './UIEventManager';
import { IBindable, Player, WasmManager, wasm } from 'rewild-wasmtime';
import { terrainManager } from './renderer/AssetManagers/TerrainManager';
import { skyboxManager } from './renderer/AssetManagers/SkyboxManager';
import { ApplicationEventType } from 'rewild-common';
import { StateMachine } from 'rewild-routing';
import { Clock } from './Clock';
import { MainMenuStateMachine } from './routing/MainMenuStateMachine';

export type UpdateCallback = () => void;

export class GameManager {
  renderer: Renderer | null;
  eventManager: UIEventManager;
  wasmManager: WasmManager;
  mainMenu: MainMenuStateMachine | null;
  stateMachine: StateMachine | null;
  activeStateMachine: StateMachine | null;
  updateCallbacks: UpdateCallback[];
  player: Player;

  private clock: Clock;
  private onFrameHandler: () => void;

  constructor() {
    this.renderer = null;
    this.mainMenu = new MainMenuStateMachine();
    this.stateMachine = null;
    this.clock = new Clock();
    this.onFrameHandler = this.onFrame.bind(this);
    this.updateCallbacks = [];
  }

  async applicationStarted(pane3D: Pane3D) {
    this.renderer = new Renderer(pane3D);
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

    this.activeStateMachine = this.mainMenu;
    this.player = new Player();

    await this.mainMenu!.init(this.renderer);
    this.mainMenu!.activate();

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

    this.activeStateMachine?.OnLoop(delta, clock.elapsedTime);
    this.renderer!.onFrame();
  }

  onEnterEditorMode() {
    this.activeStateMachine?.OnLoop;
    this.mainMenu!.deactivate();
    this.eventManager.triggerUIEvent(ApplicationEventType.StartEditor);
  }

  async onStartClick() {
    this.activeStateMachine?.OnLoop;
    this.mainMenu!.deactivate();
    this.stateMachine = await loadInitialLevels(this.player, this.renderer!);
    this.activeStateMachine = this.stateMachine;

    this.eventManager.triggerUIEvent(ApplicationEventType.StartGame);
  }

  onQuitClick() {
    this.stateMachine?.dispose();
    this.stateMachine = null;
    this.activeStateMachine = this.mainMenu;
    this.mainMenu!.activate();
    this.eventManager.triggerUIEvent(ApplicationEventType.Quit);
    wasm.__collect();
  }
}

export const gameManager = new GameManager();
