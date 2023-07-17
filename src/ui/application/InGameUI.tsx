import { Renderer } from "../../renderer/Renderer";
import { CircularProgress, Component, register } from "rewild-ui";

type Props = {
  renderer: Renderer;
};

@register("x-in-game-ui")
export class InGameUI extends Component<Props> {
  init() {
    const [playerHealth, setPlayerHealth] = this.useState(100);
    const [playerHunger, setPlayerHunger] = this.useState(100);

    const onFrameUpdate = () => {
      if (this.props.renderer.player.playerComponent.health != playerHealth() && playerHungerElm) {
        setPlayerHealth(this.props.renderer.player.playerComponent.health, false);
        playerHealthElm.props = { ...playerHealthElm.props, value: playerHealth() };
      }

      if (this.props.renderer.player.playerComponent.hunger != playerHunger() && playerHungerElm) {
        setPlayerHunger(this.props.renderer.player.playerComponent.hunger, false);
        playerHungerElm.props = { ...playerHungerElm.props, value: playerHunger() };
      }
    };

    this.props.renderer.updateCallbacks.push(onFrameUpdate);

    const playerHealthElm = (<CircularProgress size={120} value={100} strokeSize={20} />) as CircularProgress;
    const playerHungerElm = (<CircularProgress size={80} value={100} strokeSize={14} />) as CircularProgress;

    const elements = (
      <div>
        <div class="footer">
          {playerHealthElm}
          {playerHungerElm}
        </div>
      </div>
    );

    return () => elements;
  }

  getStyle() {
    return StyledContainer;
  }
}

const StyledContainer = cssStylesheet(css`
  :host {
    width: 100%;
    height: 100%;
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
    bottom: 30px;
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
