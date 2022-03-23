import { Component, createSignal, onMount } from "solid-js";
import { styled } from "solid-styled-components";
import { GameManager } from "../../core/GameManager";
import { WasmManager } from "../../core/WasmManager";
import { Button } from "../common/Button";
import { Modal } from "../common/Modal";
import { Pane3D } from "../common/Pane3D";
import { Typography } from "../common/Typography";

interface Props {}

export const Application: Component<Props> = ({}) => {
  const [modalOpen, setModalOpen] = createSignal(true);

  let gameManager: GameManager;
  const wasmManager: WasmManager = new WasmManager();

  onMount(async () => {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setModalOpen(!modalOpen());
    });
  });

  const onCanvasReady = async (canvas: HTMLCanvasElement) => {
    gameManager = new GameManager(canvas);
    await wasmManager.load(gameManager);
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

  return (
    <StyledApplication>
      <Modal hideConfirmButtons open={modalOpen()} title="Hello World" onClose={() => setModalOpen(false)}>
        <Typography variant="h4" align="center">
          Rewild!
        </Typography>
        <Typography variant="body2">
          Welcome to rewild. A game about exploration, natural history and saving the planet
        </Typography>
        <StyledButtons>
          <Button fullWidth variant="outlined" disabled>
            Options
          </Button>
          <Button onClick={onStart} fullWidth variant="contained" color="primary">
            Start Game
          </Button>
        </StyledButtons>
      </Modal>
      <Pane3D onCanvasReady={onCanvasReady} />
    </StyledApplication>
  );
};

const StyledApplication = styled.div`
  width: 100%;
  height: 100%;
  margin: 0;
`;

const StyledButtons = styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;
