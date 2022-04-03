import { Component, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import { styled } from "solid-styled-components";
import { IBindable } from "src/ts/core/IBindable";
import { UIEventManager } from "../../core/UIEventManager";
import { GameManager } from "../../core/GameManager";
import { WasmManager } from "../../core/WasmManager";
import { Pane3D } from "../common/Pane3D";
import { InGameMenu } from "./InGameMenu";
import { MainMenu } from "./MainMenu";
import { UIEvent } from "../../core/events/UIEvent";
import { EventType } from "../../core/events/eventTypes";
import { UIEventType } from "../../../common/UIEventType";

interface Props {}

type activeMenu = "main" | "ingame";

export const Application: Component<Props> = ({}) => {
  const [modalOpen, setModalOpen] = createSignal(true);
  const [activeMenu, setActiveMenu] = createSignal<activeMenu>("main");

  let gameManager: GameManager;
  let eventManager: UIEventManager;
  const wasmManager: WasmManager = new WasmManager();

  const onWasmUiEvent = (event: UIEvent) => {
    if (event.uiEventType === UIEventType.OpenInGameMenu) setModalOpen(!modalOpen());
  };

  const onCanvasReady = async (canvas: HTMLCanvasElement) => {
    gameManager = new GameManager(canvas);
    eventManager = new UIEventManager(wasmManager);

    const bindables: IBindable[] = [gameManager, eventManager];
    await wasmManager.load(bindables);

    const message = document.querySelector("#message") as HTMLElement;
    try {
      await gameManager.init(wasmManager);
      eventManager.addEventListener("uievent" as EventType, onWasmUiEvent);
    } catch (err: unknown) {
      message.style.display = "initial";
      message.innerHTML = (err as Error).message;
    }
  };

  const onStart = () => {
    setModalOpen(false);
    setActiveMenu("ingame");
    eventManager.triggerUIEvent(UIEventType.StartGame);
  };

  const onQuit = () => {
    setActiveMenu("main");
    eventManager.triggerUIEvent(UIEventType.QuitGame);
  };

  const options: { [key in activeMenu]: Component } = {
    main: () => <MainMenu open={modalOpen()} onStart={onStart} />,
    ingame: () => <InGameMenu open={modalOpen()} onResumeClick={onStart} onQuitClick={onQuit} />,
  };

  return (
    <StyledApplication>
      <Dynamic component={options[activeMenu()]} />
      <Pane3D onCanvasReady={onCanvasReady} />
    </StyledApplication>
  );
};

const StyledApplication = styled.div`
  width: 100%;
  height: 100%;
  margin: 0;
`;
