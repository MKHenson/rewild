import { UIRenderer } from 'rewild-gpu-ui';
import { QualitySettings } from 'rewild-renderer/lib/utils/QualitySettings';
import { audio } from '../audio/audio';
import { GameOverScreen } from './GameOverScreen';
import { InGameMenu } from './InGameMenu';
import { SettingsMenu, SettingsMenuOptions } from './SettingsMenu';

/** What shows over the game. */
export type GameMenuState = 'playing' | 'menu' | 'settings' | 'gameOver';

/** The theme choice. The app stores it and applies it. */
export type GameMenusTheme = Pick<SettingsMenuOptions, 'getTheme' | 'setTheme'>;

export interface GameMenusOptions extends GameMenusTheme {
  quality: QualitySettings;
  /** Resume: give the pointer back to the game. */
  onResume: () => void;
  /** Restart on game over. */
  onRestart: () => void;
  /** Quit from the menu, or Main Menu on game over. */
  onQuit: () => void;
}

/**
 * The menus over the game: the in-game menu, settings and game over. It
 * decides which one shows, and dims the world sound while a menu is open.
 * The game opens the menu with `openMenu`, and shows game over with
 * `showGameOver`.
 */
export class GameMenus {
  private _state: GameMenuState = 'playing';
  private readonly menu: InGameMenu;
  private readonly settings: SettingsMenu;
  private readonly gameOver: GameOverScreen;

  constructor(ui: UIRenderer, options: GameMenusOptions) {
    this.menu = new InGameMenu(ui, {
      onResume: () => {
        this.setState('playing');
        options.onResume();
      },
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
  }

  get state(): GameMenuState {
    return this._state;
  }

  /** Opens the in-game menu over play. It does nothing over another menu or game over. */
  openMenu(): void {
    if (this._state === 'playing') this.setState('menu');
  }

  showGameOver(): void {
    this.setState('gameOver');
  }

  dispose(): void {
    if (this._state === 'menu' || this._state === 'settings')
      audio.duckWorld(false);
    this.menu.dispose();
    this.settings.dispose();
    this.gameOver.dispose();
  }

  private setState(state: GameMenuState): void {
    if (state === this._state || this._state === 'gameOver') return;
    const wasOpen = this._state === 'menu' || this._state === 'settings';
    const open = state === 'menu' || state === 'settings';
    this._state = state;
    if (open !== wasOpen) audio.duckWorld(open);
    this.menu.isOpen = state === 'menu';
    this.settings.isOpen = state === 'settings';
    if (state === 'gameOver') this.gameOver.show();
  }
}
