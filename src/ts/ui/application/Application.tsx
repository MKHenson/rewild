import { Component, createSignal, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import { styled } from "solid-styled-components";
import { IBindable } from "src/ts/core/IBindable";
import { GameManager } from "../../core/GameManager";
import { WasmManager } from "../../core/WasmManager";
import { Pane3D } from "../common/Pane3D";
import { InGameMenu } from "./InGameMenu";
import { MainMenu } from "./MainMenu";

interface Props {}

type activeMenu = "main" | "ingame";

export const Application: Component<Props> = ({}) => {
  const [modalOpen, setModalOpen] = createSignal(true);
  const [activeMenu, setActiveMenu] = createSignal<activeMenu>("main");

  let gameManager: GameManager;
  const wasmManager: WasmManager = new WasmManager();

  onMount(async () => {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setModalOpen(!modalOpen());
      if (e.key === "Enter") setActiveMenu("ingame");
    });
  });

  const onCanvasReady = async (canvas: HTMLCanvasElement) => {
    gameManager = new GameManager(canvas);

    const bindables: IBindable[] = [gameManager];
    await wasmManager.load(bindables);

    const message = document.querySelector("#message") as HTMLElement;
    try {
      await gameManager.init(wasmManager);
    } catch (err: unknown) {
      message.style.display = "initial";
      message.innerHTML = (err as Error).message;
    }
  };

  const onStart = () => {
    setModalOpen(false);
  };

  const onQuit = () => {
    setActiveMenu("main");
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
