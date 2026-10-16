import { Button, Component, register } from 'rewild-ui';

/** Milliseconds the death plays out before the options show and the mouse is freed. */
const OPTIONS_AFTER = 3000;

type Props = {
  onRestartClick: () => void;
  onQuitClick: () => void;
};

@register('x-game-over-menu')
export class GameOverMenu extends Component<Props> {
  init() {
    const [showOptions, setShowOptions] = this.useState(false);
    let timer = 0;

    this.onMount = () => {
      timer = window.setTimeout(() => {
        if (document.pointerLockElement) document.exitPointerLock();
        setShowOptions(true);
      }, OPTIONS_AFTER);
    };

    this.onCleanup = () => window.clearTimeout(timer);

    const options = (
      <div class="options">
        <Button onClick={this.props.onRestartClick} fullWidth>
          Restart
        </Button>
        <Button onClick={this.props.onQuitClick} fullWidth>
          Main Menu
        </Button>
      </div>
    ) as HTMLDivElement;
    const death = (
      <div class="death">
        <h1>YOU DIED</h1>
      </div>
    ) as HTMLDivElement;

    return () => {
      if (showOptions()) {
        if (!options.parentElement) death.appendChild(options);
      } else options.remove();
      return death;
    };
  }

  getStyle() {
    return StyledDeath;
  }
}

const StyledDeath = cssStylesheet(css`
  :host {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .death {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  h1 {
    margin: 0;
    color: #c8102e;
    font-size: 4rem;
    letter-spacing: 0.3em;
    text-shadow: 0 0 1.5rem rgba(0, 0, 0, 0.9);
    animation: fade-in 2s ease-in both;
  }

  .options {
    width: 16rem;
    margin-top: 2rem;
    pointer-events: auto;
    animation: fade-in 0.5s ease-in both;
  }

  x-button {
    margin: 1rem 0 0 0;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`);
