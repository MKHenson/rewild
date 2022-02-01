import { render, html } from "lit";
import { Modal } from "../common/Modal";

const Application = () => html`
  <x-modal open id="main-menu" hideConfirmButtons>
    <x-typography variant="h4" align="center">Rewild!</x-typography>
    <x-typography variant="body2"
      >Welcome to rewild. A game about exploration, natural history and saving the planet</x-typography
    >
    <x-button id="start-game" variant="contained" color="primary">Start Game</x-button>
  </x-modal>
`;

document.addEventListener("readystatechange", (e) => {
  if (document.readyState === "interactive" || document.readyState === "complete") {
    render(Application(), document.querySelector("#application") as HTMLDivElement);

    const mainMenu = document.querySelector("#main-menu") as Modal;

    mainMenu.addEventListener("close", (e) => (mainMenu.open = false));
    document.querySelector("#start-game")!.addEventListener("click", (e) => (mainMenu.open = false));
  }
});
