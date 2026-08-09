import { InGameMenu } from './InGameMenu';
import { GameOverMenu } from './GameOverMenu';
import { SettingsPanel } from './SettingsPanel';
import { Component, register } from 'rewild-ui';
import { ViewportStateMachine } from './ViewportStateMachine';

interface Props {
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
      (viewport as ViewportStateMachine).gameManager.lock();
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
      if (event.key !== 'Escape') return;

      if (!modalOpen()) {
        setModalOpen(true);
      } else if (activeMenu() === 'settings') {
        setActiveMenu('ingameMenu');
      } else {
        setModalOpen(false);
      }
    };

    const onUnlock = () => {
      setModalOpen(true);
    };

    /** The one panel the overlay is showing, if any. */
    const renderMenu = () => {
      if (activeMenu() === 'gameOverMenu')
        return <GameOverMenu onQuitClick={onQuit} open />;

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
      (viewport as ViewportStateMachine).dispose();
    };

    const fpsDiv = <div class="fps-counter">0</div>;
    const viewport = <ViewportStateMachine onUnlock={onUnlock} />;

    return () => (
      <div>
        {viewport}
        {renderMenu()}
        {fpsDiv}
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

  .fps-counter {
    width: 100px;
    color: white;
    font-size: 14px;
    height: 25px;
    padding: 5px;
    text-align: center;
    position: absolute;
    top: 0;
    left: 0;
    background: #255fa1;
  }
`);
