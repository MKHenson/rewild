import { UIRenderer } from 'rewild-gpu-ui';
import { QualitySettings } from 'rewild-renderer/lib/utils/QualitySettings';
import { audio } from '../audio/audio';
import { GameOverScreen } from './GameOverScreen';
import { InGameMenu } from './InGameMenu';
import { LoadingScreen } from './LoadingScreen';
import { SettingsMenu, SettingsMenuOptions } from './SettingsMenu';

/** What shows over the game. */
export type GameMenuState =
  | 'playing'
  | 'menu'
  | 'settings'
  | 'gameOver'
  | 'loading'
  | 'loadError';

/** The theme choice. The app stores it and applies it. */
export type GameMenusTheme = Pick<SettingsMenuOptions, 'getTheme' | 'setTheme'>;

export interface GameMenusOptions extends GameMenusTheme {
  quality: QualitySettings;
  /** Resume: give the pointer back to the game. */
  onResume: () => void;
  /** Restart from the menu or on game over. */
  onRestart: () => void;
  /** Quit from the menu, Main Menu on game over, or leave a level that could not load. */
  onQuit: () => void;
  /** Called with the new state each time it changes. */
  onStateChange?: (state: GameMenuState) => void;
}

/** The game leaves these states only through `showLoading`, `showLoadError` or `play`. */
const HELD: readonly GameMenuState[] = ['gameOver', 'loading', 'loadError'];

/**
 * The menus over the game: the in-game menu, settings, game over and the
 * loading screen. It decides which one shows, and dims the world sound while a
 * menu is open. The game opens the menu with `openMenu`, shows game over with
 * `showGameOver`, covers a level load with `showLoading` and returns to play
 * with `play`.
 */
export class GameMenus {
  private _state: GameMenuState = 'playing';
  private readonly menu: InGameMenu;
  private readonly settings: SettingsMenu;
  private readonly gameOver: GameOverScreen;
  private readonly loading: LoadingScreen;
  private readonly onStateChange?: (state: GameMenuState) => void;

  constructor(ui: UIRenderer, options: GameMenusOptions) {
    this.onStateChange = options.onStateChange;
    this.menu = new InGameMenu(ui, {
      onResume: () => {
        this.setState('playing');
        options.onResume();
      },
      onRestart: options.onRestart,
      onSettings: () => this.setState('settings'),
      onQuit: options.onQuit,
      onClose: () => this.setState('playing'),
    });
    this.settings = new SettingsMenu(ui, {
      quality: options.quality,
      getTheme: options.getTheme,
      setTheme: options.setTheme,
      onClose: () => this.setState('menu'),
    });
    this.gameOver = new GameOverScreen(ui, {
      onRestart: options.onRestart,
      onQuit: options.onQuit,
    });
    this.loading = new LoadingScreen(ui, { onQuit: options.onQuit });
  }

  get state(): GameMenuState {
    return this._state;
  }

  /** Opens the in-game menu over play. It does nothing over another menu, game over or a load. */
  openMenu(): void {
    if (this._state === 'playing') this.setState('menu');
  }

  showGameOver(): void {
    this.setState('gameOver');
  }

  /** Covers the game while a level loads, over any menu or game over. */
  showLoading(): void {
    this.apply('loading');
  }

  /** Says why the level could not load, and offers the main menu. */
  showLoadError(message: string): void {
    this.loading.showError(message);
    this.apply('loadError');
  }

  /** Back to play from any state, such as once a level has loaded. */
  play(): void {
    this.apply('playing');
  }

  dispose(): void {
    if (this._state === 'menu' || this._state === 'settings')
      audio.duckWorld(false);
    this.menu.dispose();
    this.settings.dispose();
    this.gameOver.dispose();
    this.loading.dispose();
  }

  private setState(state: GameMenuState): void {
    if (HELD.includes(this._state)) return;
    this.apply(state);
  }

  private apply(state: GameMenuState): void {
    if (state === this._state) return;
    const wasOpen = this._state === 'menu' || this._state === 'settings';
    const open = state === 'menu' || state === 'settings';
    const from = this._state;
    this._state = state;
    if (open !== wasOpen) audio.duckWorld(open);
    this.menu.isOpen = state === 'menu';
    this.settings.isOpen = state === 'settings';
    if (state === 'gameOver') this.gameOver.show();
    else if (from === 'gameOver') this.gameOver.hide();
    if (state === 'loading') this.loading.show();
    else if (state === 'playing') this.loading.hide();
    this.onStateChange?.(state);
  }
}
