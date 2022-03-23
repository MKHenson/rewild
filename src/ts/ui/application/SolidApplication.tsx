import { Component, createSignal, For, onMount } from "solid-js";
import { styled } from "solid-styled-components";
import { GameManager } from "../../core/GameManager";
import { WasmManager } from "../../core/WasmManager";
import { SolidButton } from "../common/SolidButton";
import { SolidModal } from "../common/SolidModal";
import { SolidPane3D } from "../common/SolidPane3D";
import { SolidTypography } from "../common/SolidTypography";

interface Props {}

export const SolidApplication: Component<Props> = ({}) => {
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
      <SolidModal hideConfirmButtons open={modalOpen()} title="Hello World" onClose={() => setModalOpen(false)}>
        <SolidTypography variant="h4" align="center">
          Rewild!
        </SolidTypography>
        <SolidTypography variant="body2">
          Welcome to rewild. A game about exploration, natural history and saving the planet
        </SolidTypography>
        <StyledButtons>
          <SolidButton fullWidth variant="outlined" disabled>
            Options
          </SolidButton>
          <SolidButton onClick={onStart} fullWidth variant="contained" color="primary">
            Start Game
          </SolidButton>
        </StyledButtons>
      </SolidModal>
      <SolidPane3D onCanvasReady={onCanvasReady} />
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

// import { Component, createSignal, For, onMount } from "solid-js";
// import { styled } from "solid-styled-components";
// import { GameManager } from "src/ts/core/GameManager";
// import { WasmManager } from "src/ts/core/WasmManager";

// interface Props {}

// const items = ["knife", "sword", "axe"];

// export const SolidApplication: Component<Props> = ({}) => {
//   let gameManager: GameManager;
//   const wasmManager: WasmManager = new WasmManager();
//   const mainMenu: Modal;

//   const [count, setCount] = createSignal<number>(0);

//   onMount(async () => {
//     document.addEventListener("keydown", (e) => {
//       if (e.key === "Escape") mainMenu.open = !mainMenu.open;
//     });

//     mainMenu = shadowRoot!.querySelector("#main-menu") as Modal;
//     const panel3D = shadowRoot!.querySelector("x-pane3d") as Pane3D;

//     // Wait for panel to be fully mounted
//     await panel3D.updateComplete;

//     gameManager = new GameManager(panel3D);
//     await wasmManager.load(gameManager);

//     const message = document.querySelector("#message") as HTMLElement;

//     try {
//       await gameManager.init(wasmManager);
//     } catch (err: unknown) {
//       message.style.display = "initial";
//       message.innerHTML = (err as Error).message;
//     }
//   })

//   const onStart = () => {
//     mainMenu.open = false;
//   }

//   return (
//     <StyledApplication>
//       <div>The Count is: {count()}</div>
//       <button onClick={() => setCount(count() + 1)}>Increment</button>
//       <For each={items}>{(item) => <div>{item}</div>}</For>
//     </StyledApplication>
//   );
// };

// const StyledApplication = styled.div`
//   color: ${(e) => e.theme!.colors.primary};
// `;
