import { Component, createSignal, Show } from "solid-js";
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
import { InGameUI } from "./InGameUI";
import { GameOverMenu } from "./GameOverMenu";
import { ErrorType, StartError } from "./StartError";
import { update } from "./FPSCounter";

interface Props {}
type ActiveMenu = "main" | "ingameMenu" | "gameOverMenu" | "error";

export const Application: Component<Props> = ({}) => {
  const [modalOpen, setModalOpen] = createSignal(true);
  const [errorMessage, setErrorMessage] = createSignal("");

  const [errorType, setErrorType] = createSignal<ErrorType>("OTHER");
  const [activeMenu, setActiveMenu] = createSignal<ActiveMenu>("main");
  const [gameIsRunning, setGameIsRunning] = createSignal(false);

  let fpsDiv!: HTMLDivElement;

  let gameManager: GameManager;
  let eventManager: UIEventManager;
  const wasmManager: WasmManager = new WasmManager();

  const onWasmUiEvent = (event: UIEvent) => {
    if (event.uiEventType === UIEventType.OpenInGameMenu) setModalOpen(!modalOpen());
    else if (event.uiEventType === UIEventType.PlayerDied) setActiveMenu("gameOverMenu");
  };

  const onFrameUpdate = () => {
    update(fpsDiv);
  };

  const onCanvasReady = async (canvas: HTMLCanvasElement) => {
    gameManager = new GameManager(canvas);
    gameManager.updateCallbacks.push(onFrameUpdate);

    eventManager = new UIEventManager();

    const bindables: IBindable[] = [gameManager, eventManager];

    try {
      await wasmManager.load(bindables);

      if (!gameManager.hasWebGPU()) {
        setErrorMessage("Your browser does not support WebGPU");
        setErrorType("WGPU");
        setActiveMenu("error");
        return;
      }

      await gameManager.init();
      eventManager.addEventListener("uievent" as EventType, onWasmUiEvent);
    } catch (err: unknown) {
      setErrorMessage("An Error occurred while setting up the scene. Please check the console for more info.");
      setErrorType("OTHER");
      setActiveMenu("error");
      console.log(err);
    }
  };

  const onStart = () => {
    setModalOpen(false);
    setGameIsRunning(true);
    setActiveMenu("ingameMenu");
    eventManager.triggerUIEvent(UIEventType.StartGame);
  };

  const onResume = () => {
    setModalOpen(false);
    setGameIsRunning(true);
    eventManager.triggerUIEvent(UIEventType.Resume);
  };

  const onQuit = () => {
    setModalOpen(true);
    setActiveMenu("main");
    setGameIsRunning(false);
    eventManager.triggerUIEvent(UIEventType.QuitGame);
  };

  const options: { [key in ActiveMenu]: Component } = {
    main: () => <MainMenu open={modalOpen()} onStart={onStart} />,
    ingameMenu: () => <InGameMenu open={modalOpen()} onResumeClick={onResume} onQuitClick={onQuit} />,
    gameOverMenu: () => <GameOverMenu onQuitClick={onQuit} open />,
    error: () => <StartError open errorMsg={errorMessage()} errorType={errorType()} />,
  };

  return (
    <StyledApplication>
      <Show when={gameIsRunning()}>
        <InGameUI gameManager={gameManager!} />
      </Show>
      <Dynamic component={options[activeMenu()]} />
      <Pane3D onCanvasReady={onCanvasReady} />
      <StyledFPS ref={fpsDiv}>0</StyledFPS>
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
`;
