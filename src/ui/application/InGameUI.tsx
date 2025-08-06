import { Player } from 'src/core/routing/Player';
import { CircularProgress, Component, register } from 'rewild-ui';

type Props = {
  player: Player;
};

@register('x-in-game-ui')
export class InGameUI extends Component<Props> {
  playerHealthElm: CircularProgress | null = null;
  playerHungerElm: CircularProgress | null = null;

  init() {
    this.playerHealthElm = (
      <CircularProgress size={120} value={100} strokeSize={20} />
    ) as CircularProgress;
    this.playerHungerElm = (
      <CircularProgress size={80} value={100} strokeSize={14} />
    ) as CircularProgress;

    const elements = (
      <div>
        <div class="footer">
          {this.playerHealthElm}
          {this.playerHungerElm}
        </div>
      </div>
    );

    return () => elements;
  }

  update() {
    const player = this.props.player;

    this.playerHealthElm!.props = {
      ...this.playerHealthElm!.props,
      value: player.health,
    };

    this.playerHungerElm!.props = {
      ...this.playerHungerElm!.props,
      value: player.hunger,
    };
  }

  getStyle() {
    return StyledContainer;
  }
}

const StyledContainer = cssStylesheet(css`
  :host {
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    position: absolute;
    pointer-events: none;
  }

  > div {
    width: 100%;
    height: 100%;
  }

  .footer {
    pointer-events: initial;
    width: 90%;
    height: 5%;
    min-height: 50px;
    position: absolute;
    bottom: 40px;
    margin: 0 0 0 5%;
    border-radius: 10px;
    box-sizing: border-box;
    color: white;
    justify-content: center;
    align-items: center;
    display: flex;
  }

  .footer > div {
    flex: 0 1 auto;
  }
`);
