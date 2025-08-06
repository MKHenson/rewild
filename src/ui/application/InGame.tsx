import { InGameMenu } from './InGameMenu';
import { GameOverMenu } from './GameOverMenu';
import { Component, register } from 'rewild-ui';
import { ViewportStateMachine } from './ViewportStateMachine';

interface Props {
  onQuit: () => void;
}
type ActiveMenu = 'ingameMenu' | 'gameOverMenu';

@register('x-in-game')
export class InGame extends Component<Props> {
  init() {
    const [modalOpen, setModalOpen] = this.useState(false);
    const [activeMenu] = this.useState<ActiveMenu>('ingameMenu');

    const onResume = () => {
      setModalOpen(false);
    };

    const onQuit = () => {
      this.props.onQuit();
    };

    this.onMount = () => {
      document.addEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!modalOpen() && event.key === 'Escape') {
        setModalOpen(true);
      } else if (event.key === 'Escape') {
        setModalOpen(false);
      }
    };

    this.onCleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      (viewport as ViewportStateMachine).dispose();
    };

    const fpsDiv = <div class="fps-counter">0</div>;
    const viewport = <ViewportStateMachine />;

    return () => (
      <div>
        {viewport}
        {activeMenu() === 'ingameMenu' ? (
          <InGameMenu
            open={modalOpen()}
            onResumeClick={onResume}
            onQuitClick={onQuit}
          />
        ) : (
          <GameOverMenu onQuitClick={onQuit} open />
        )}
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
