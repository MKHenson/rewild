import { Component, createSignal, onCleanup, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import { styled } from "solid-styled-components";
import { UIEventManager } from "../../core/UIEventManager";
import { GameManager } from "../../core/GameManager";
import { InGameMenu } from "./InGameMenu";
import { ApplicationEvent } from "../../core/events/ApplicationEvent";
import { ApplicationEventType, UIEventType } from "../../../common/EventTypes";
import { InGameUI } from "./InGameUI";
import { GameOverMenu } from "./GameOverMenu";
import { update } from "./FPSCounter";

interface Props {
  gameManager: GameManager;
  eventManager: UIEventManager;
  onQuit: () => void;
}
type ActiveMenu = "ingameMenu" | "gameOverMenu";

export const InGame: Component<Props> = (props) => {
  const [modalOpen, setModalOpen] = createSignal(false);
  const [activeMenu, setActiveMenu] = createSignal<ActiveMenu>("ingameMenu");

  let fpsDiv: HTMLDivElement | null = null;

  const onWasmUiEvent = (event: ApplicationEvent) => {
    if (event.eventType === ApplicationEventType.OpenInGameMenu) setModalOpen(!modalOpen());
    else if (event.eventType === ApplicationEventType.PlayerDied) setActiveMenu("gameOverMenu");
  };

  const onFrameUpdate = () => {
    if (fpsDiv) update(fpsDiv);
  };

  onMount(() => {
    props.gameManager.updateCallbacks.push(onFrameUpdate);
    props.eventManager.addEventListener(UIEventType, onWasmUiEvent);
  });

  onCleanup(() => {
    props.gameManager.updateCallbacks.splice(props.gameManager.updateCallbacks.indexOf(onFrameUpdate), 1);
    props.eventManager.removeEventListener(UIEventType, onWasmUiEvent);
  });

  const onResume = () => {
    setModalOpen(false);
    props.eventManager.triggerUIEvent(ApplicationEventType.Resume);
  };

  const onQuit = () => {
    props.onQuit();
  };

  const options: { [key in ActiveMenu]: Component } = {
    ingameMenu: () => <InGameMenu open={modalOpen()} onResumeClick={onResume} onQuitClick={onQuit} />,
    gameOverMenu: () => <GameOverMenu onQuitClick={onQuit} open />,
  };

  return (
    <StyledApplication>
      <InGameUI gameManager={props.gameManager} />
      <Dynamic component={options[activeMenu()]} />
      <StyledFPS ref={(elm) => (fpsDiv = elm)}>0</StyledFPS>
    </StyledApplication>
  );
};

const StyledFPS = styled.div`
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
`;

const StyledApplication = styled.div`
  width: 100%;
  height: 100%;
  margin: 0;
  top: 0;
  left: 0;
  position: absolute;
`;
