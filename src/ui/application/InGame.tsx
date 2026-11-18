import { SettingsPanel } from './SettingsPanel';
import { Component, register } from 'rewild-ui';
import { ViewportStateMachine } from './ViewportStateMachine';
import { audio } from '../../core/audio/audio';
import { GameManager } from '../../core/GameManager';
import { InGameMenu } from '../../core/menus/InGameMenu';
import { GameOverScreen } from '../../core/menus/GameOverScreen';

interface Props {
  projectId: string;
  onQuit: () => void;
}
type ActiveMenu = 'ingameMenu' | 'gameOverMenu' | 'settings';

@register('x-in-game')
export class InGame extends Component<Props> {
  init() {
    const [modalOpen, setModalOpen] = this.useState(false);
    const [activeMenu, setActiveMenu] = this.useState<ActiveMenu>('ingameMenu');
    // The game's renderer draws the menu and game over. Each game has its own
    // renderer, so they are made again for each game.
    let menu: InGameMenu | null = null;
    let gameOver: GameOverScreen | null = null;

    const onResume = () => {
      setModalOpen(false);
      audio.duckWorld(false);
      viewport.gameManager.lock();
    };

    const onClose = () => {
      setModalOpen(false);
      audio.duckWorld(false);
    };

    const onDeath = () => {
      setModalOpen(false);
      setActiveMenu('gameOverMenu');
      audio.duckWorld(false);
    };

    const [levelId, setLevelId] = this.useState<string | undefined>(undefined);

    const createViewport = () =>
      (
        <ViewportStateMachine
          projectId={this.props.projectId}
          levelId={levelId()}
          onTravel={onTravel}
          onUnlock={onUnlock}
          onDeath={onDeath}
          onQuit={onQuit}
          onReady={onReady}
        />
      ) as ViewportStateMachine;

    const onReady = (gameManager: GameManager) => {
      disposeMenus();
      const ui = gameManager.renderer.ui;
      menu = new InGameMenu(ui, {
        onResume,
        onSettings,
        onQuit,
        onClose,
      });
      gameOver = new GameOverScreen(ui, {
        onRestart,
        onQuit,
      });
      syncMenus();
    };

    const disposeMenus = () => {
      menu?.dispose();
      gameOver?.dispose();
      menu = null;
      gameOver = null;
    };

    /** Shows the menu or game over that the state asks for. */
    const syncMenus = () => {
      if (menu) menu.isOpen = modalOpen() && activeMenu() === 'ingameMenu';
      if (activeMenu() === 'gameOverMenu') gameOver?.show();
    };

    const onRestart = () => {
      disposeMenus();
      viewport.dispose();
      viewport = createViewport();
      setModalOpen(false);
      setActiveMenu('ingameMenu');
    };

    const onTravel = (target: string) => {
      disposeMenus();
      viewport.dispose();
      setLevelId(target, false);
      viewport = createViewport();
      this.render();
    };

    const onSettings = () => setActiveMenu('settings');
    const onSettingsClose = () => setActiveMenu('ingameMenu');

    const onQuit = () => {
      this.props.onQuit();
    };

    this.onMount = () => {
      document.addEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || activeMenu() === 'gameOverMenu') return;

      if (!modalOpen()) {
        setModalOpen(true);
        audio.duckWorld(true);
      } else if (activeMenu() === 'settings') {
        setActiveMenu('ingameMenu');
      } else {
        setModalOpen(false);
        audio.duckWorld(false);
      }
    };

    const onUnlock = () => {
      if (activeMenu() === 'gameOverMenu') return;
      setModalOpen(true);
      audio.duckWorld(true);
    };

    this.onCleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      disposeMenus();
      viewport.dispose();
    };

    let viewport = createViewport();

    return () => {
      syncMenus();
      // Settings is still the DOM panel. The menu and game over draw in the game.
      return (
        <div>
          {viewport}
          {activeMenu() === 'settings' ? (
            <SettingsPanel onClose={onSettingsClose} />
          ) : (
            ''
          )}
        </div>
      );
    };
  }

  getStyle() {
    return StyledInGame;
  }
}

const StyledInGame = cssStylesheet(css`
  :host {
    width: 100%;
    height: 100%;
    margin: 0;
    top: 0;
    left: 0;
    position: absolute;
  }

  > div {
    width: 100%;
    height: 100%;
    margin: 0;
  }
`);
