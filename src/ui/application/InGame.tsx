import { UIEventManager } from "../../core/UIEventManager";
import { Renderer } from "../../renderer/Renderer";
import { InGameMenu } from "./InGameMenu";
import { ApplicationEvent } from "../../core/events/ApplicationEvent";
import { ApplicationEventType, UIEventType } from "rewild-common";
import { InGameUI } from "./InGameUI";
import { GameOverMenu } from "./GameOverMenu";
import { update } from "./FPSCounter";
import { Component, register } from "rewild-ui";

interface Props {
  renderer: Renderer;
  eventManager: UIEventManager;
  onQuit: () => void;
}
type ActiveMenu = "ingameMenu" | "gameOverMenu";

@register("x-in-game")
export class InGame extends Component<Props> {
  init() {
    const [modalOpen, setModalOpen] = this.useState(false);
    const [activeMenu, setActiveMenu] = this.useState<ActiveMenu>("ingameMenu");

    const onWasmUiEvent = (event: ApplicationEvent) => {
      if (event.eventType === ApplicationEventType.OpenInGameMenu) setModalOpen(!modalOpen());
      else if (event.eventType === ApplicationEventType.PlayerDied) setActiveMenu("gameOverMenu");
    };

    const onFrameUpdate = () => {
      if (fpsDiv) update(fpsDiv);
    };

    const onResume = () => {
      setModalOpen(false);
      this.props.eventManager.triggerUIEvent(ApplicationEventType.Resume);
    };

    const onQuit = () => {
      this.props.onQuit();
    };

    this.onMount = () => {
      this.props.renderer.updateCallbacks.push(onFrameUpdate);
      this.props.eventManager.addEventListener(UIEventType, onWasmUiEvent);
    };

    this.onCleanup = () => {
      this.props.renderer.updateCallbacks.splice(this.props.renderer.updateCallbacks.indexOf(onFrameUpdate), 1);
      this.props.eventManager.removeEventListener(UIEventType, onWasmUiEvent);
    };

    const fpsDiv = <div class="fps-counter">0</div>;

    return () => (
      <div>
        <InGameUI renderer={this.props.renderer} />
        {activeMenu() === "ingameMenu" ? (
          <InGameMenu open={modalOpen()} onResumeClick={onResume} onQuitClick={onQuit} />
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
