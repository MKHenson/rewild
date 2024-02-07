import { Pane3D } from 'rewild-ui';
import { Renderer } from '../renderer/Renderer';
import { GameLoader } from './GameLoader';
import { UIEventManager } from './UIEventManager';
import { IBindable, WasmManager } from 'packages/rewild-wasmtime';
import { terrainManager } from '../renderer/AssetManagers/TerrainManager';
import { skyboxManager } from '../renderer/AssetManagers/SkyboxManager';
import { ApplicationEventType } from 'packages/rewild-common';

export class GameManager {
  public renderer: Renderer | null;
  public gameLoader: GameLoader;
  public eventManager: UIEventManager;
  public wasmManager: WasmManager;

  constructor() {
    this.renderer = null;
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

    // Call the first frame so the containers can initialize
    this.renderer.onFrame();

    return true;
  }

  async onStart() {
    await this.gameLoader.loadInitialLevels();
    this.eventManager.triggerUIEvent(ApplicationEventType.StartGame);
  }

  async onQuit() {
    this.eventManager.triggerUIEvent(ApplicationEventType.Quit);
    this.gameLoader.unloadInitialLevels();
  }
}

export const gameManager = new GameManager();
