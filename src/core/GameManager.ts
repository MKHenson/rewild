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
import { bindScreenshotHotkey } from './ScreenshotHotkey';
import { audio, closeSceneScope, openSceneScope } from './audio/audio';
import { AudioScope } from 'rewild-audio';
import { WorldSound } from './audio/WorldSound';
import { Gamepad, GamepadButton } from './input/Gamepad';
import { GameMenus, GameMenusTheme } from './menus/GameMenus';

export class GameManager {
  renderer: Renderer;
  stateMachine: StateMachine;
  hasInitialized: boolean;
  /** Why init() failed, or null. */
  loadError: Error | null = null;
  player: Player;
  readonly gamepad = new Gamepad();
  /**
   * True when the player acts on the gamepad. While a UI surface holds focus,
   * such as a menu, the UI gets the pad instead.
   */
  playerHasPad = true;
  clock: Clock;
  /** Every sound this game plays; it fades out when the game is disposed. */
  sound: AudioScope;
  worldSound: WorldSound;
  RAPIER: typeof import('@dimforge/rapier3d-compat');
  physicsWorld: World;
  /** The menus over the game. They exist once `init` has loaded the game. */
  menus: GameMenus | null = null;
  /** Asked to replace this game with one in another level of the project. */
  onTravel: ((levelId: string) => void) | null = null;
  /** Asked to start this level again, from game over. */
  onRestart: (() => void) | null = null;
  /** Asked to leave the game, from the menu or game over. */
  onQuit: (() => void) | null = null;
  private travelling = false;
  private _onPointerlockChange: () => void;
  private _onKeyDown: (event: KeyboardEvent) => void;
  private unbindScreenshotHotkey: (() => void) | null = null;
  TerrainEventDelegate: (event: TerrainEvent) => void;
  terrainRapierBodyMap: Map<string, RigidBody>;
  scatterColliders: ScatterColliderStreamer;

  /** `theme` is the player's theme choice, which the settings menu shows and sets. */
  constructor(player: Player, private theme: GameMenusTheme) {
    this.hasInitialized = false;
    this.renderer = new Renderer();
    this.stateMachine = new StateMachine();
    this.player = player;
    this.player.onDeath = () => this.menus?.showGameOver();
    this.clock = new Clock();
    this.sound = openSceneScope();
    this.worldSound = new WorldSound(audio, this.sound);
    this._onPointerlockChange = this._handlePointerlockChange.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this.TerrainEventDelegate = this.onTerrainEvent.bind(this);
    this.terrainRapierBodyMap = new Map();
  }

  lock() {
    this.player.requestLock();
  }

  async init(pane3D: Pane3D, projectId: string, levelId?: string) {
    try {
      if (this.hasInitialized) return false;
      this.hasInitialized = true;

      await this.initPhysics();
      await this.renderer.init(pane3D.canvas()!, false);

      this.player.setCamera(this.renderer.camera);
      const stateMachine = await loadInitialLevels(
        projectId,
        this.player,
        this,
        levelId
      );

      this.renderer.terrainRenderer.dispatcher.add(this.TerrainEventDelegate);

      if (!stateMachine) throw new Error('Could not load statemachine');

      this.stateMachine = stateMachine;
      this.menus = new GameMenus(this.renderer.ui, {
        quality: this.renderer.quality,
        getTheme: this.theme.getTheme,
        setTheme: this.theme.setTheme,
        onResume: () => this.lock(),
        onRestart: () => this.onRestart?.(),
        onQuit: () => this.onQuit?.(),
      });
      this.clock.start();

      document.addEventListener('pointerlockchange', this._onPointerlockChange);
      document.addEventListener('keydown', this._onKeyDown);
      this.unbindScreenshotHotkey = bindScreenshotHotkey(this.renderer);
      this.player.requestLock();

      return true;
    } catch (err: unknown) {
      console.error(err);
      this.loadError = err instanceof Error ? err : new Error(String(err));
      return false;
    }
  }

  /** Leaves this level for another. Deferred, as the caller is mid-frame. */
  travelTo(levelId: string) {
    if (this.travelling) return;
    this.travelling = true;
    setTimeout(() => this.onTravel?.(levelId));
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

  /** Losing the pointer, such as to Escape, opens the menu. */
  private _handlePointerlockChange() {
    if (!document.pointerLockElement) this.menus?.openMenu();
  }

  /**
   * Escape opens the menu when the pointer is already free. While a menu is
   * open, the UI takes the keys, so Escape closes it there.
   */
  private _handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') this.menus?.openMenu();
  }

  /** Start opens the menu, and frees the mouse so it can point at it. */
  private openMenuFromPad(): void {
    if (this.menus?.state !== 'playing') return;
    this.menus.openMenu();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  onUpdate() {
    const clock = this.clock;
    const delta = clock.getDelta();
    const total = clock.getElapsedTime();

    const viewer = this.renderer.camera.camera.transform.position;
    this.scatterColliders.update(viewer.x, viewer.y, viewer.z);
    this.physicsWorld.step();

    this.routeGamepad();
    this.stateMachine?.OnLoop(delta, total);
    this.renderer.onFrame();
    audio.setListenerFromMatrix(
      this.renderer.camera.camera.transform.matrixWorld
    );
    this.worldSound.update(this.renderer, delta);
    audio.update();
  }

  /** Reads the pad once, and gives it to the UI or leaves it to the player. */
  private routeGamepad(): void {
    const pad = this.gamepad;
    const ui = this.renderer.ui.input;
    pad.poll();
    const uiHasPad = ui.focusScope() !== null;
    if (!uiHasPad && pad.pressed(GamepadButton.Start)) this.openMenuFromPad();
    // A press that began in play does not act in the UI.
    if (uiHasPad && this.playerHasPad) ui.syncGamepads(pad.pads);
    if (uiHasPad) ui.readGamepads(pad.pads, performance.now());
    this.playerHasPad = !uiHasPad;
  }

  dispose() {
    this.menus?.dispose();
    closeSceneScope(this.sound);
    this.stateMachine?.dispose();
    this.scatterColliders?.dispose();
    this.renderer.dispose();
    this.unbindScreenshotHotkey?.();
    document.removeEventListener(
      'pointerlockchange',
      this._onPointerlockChange
    );
    document.removeEventListener('keydown', this._onKeyDown);
    this.renderer.terrainRenderer.dispatcher.remove(this.TerrainEventDelegate);
  }
}
