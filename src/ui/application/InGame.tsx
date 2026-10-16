import { InGameMenu } from './InGameMenu';
import { GameOverMenu } from './GameOverMenu';
import { SettingsPanel } from './SettingsPanel';
import { Component, register } from 'rewild-ui';
import { ViewportStateMachine } from './ViewportStateMachine';
import { audio } from '../../core/audio/audio';

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

    const onResume = () => {
      setModalOpen(false);
      audio.duckWorld(false);
      viewport.gameManager.lock();
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
        />
      ) as ViewportStateMachine;

    const onRestart = () => {
      viewport.dispose();
      viewport = createViewport();
      setModalOpen(false);
      setActiveMenu('ingameMenu');
    };

    const onTravel = (target: string) => {
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

    /** The one panel the overlay is showing, if any. */
    const renderMenu = () => {
      if (activeMenu() === 'gameOverMenu')
        return (
          <GameOverMenu onRestartClick={onRestart} onQuitClick={onQuit} />
        );

      if (activeMenu() === 'settings')
        return <SettingsPanel onClose={onSettingsClose} />;

      return (
        <InGameMenu
          open={modalOpen()}
          onResumeClick={onResume}
          onSettingsClick={onSettings}
          onQuitClick={onQuit}
        />
      );
    };

    this.onCleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      viewport.dispose();
    };

    let viewport = createViewport();

    return () => (
      <div>
        {viewport}
        {renderMenu()}
      </div>
    );
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
