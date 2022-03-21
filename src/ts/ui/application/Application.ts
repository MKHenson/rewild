import { LitElement, css, html, PropertyValues } from "lit";
import { customElement } from "lit/decorators.js";
import { Modal } from "../common/Modal";
import { GameManager } from "../../core/GameManager";
import { Pane3D } from "../common/Pane3D";
import { WasmManager } from "../../core/WasmManager";

@customElement("x-application")
export class Application extends LitElement {
  private gameManager: GameManager;
  private wasmManager: WasmManager;
  private mainMenu: Modal;

  constructor() {
    super();
    this.wasmManager = new WasmManager();
  }

  render() {
    return html`<x-modal open id="main-menu" hideConfirmButtons>
        <x-typography variant="h4" align="center">Rewild!</x-typography>
        <x-typography variant="body2"
          >Welcome to rewild. A game about exploration, natural history and saving the planet</x-typography
        >
        <div class="buttons">
          <x-button id="options" fullWidth variant="outlined" disabled>Options</x-button>
          <x-button id="start-game" @click=${this.#onStart} fullWidth variant="contained" color="primary"
            >Start Game</x-button
          >
        </div>
      </x-modal>
      <x-pane3d />`;
  }

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.mainMenu.open = !this.mainMenu.open;
    });
  }

  #onStart() {
    this.mainMenu.open = false;
  }

  async firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);

    this.mainMenu = this.shadowRoot!.querySelector("#main-menu") as Modal;
    const panel3D = this.shadowRoot!.querySelector("x-pane3d") as Pane3D;

    // Wait for panel to be fully mounted
    await panel3D.updateComplete;

    this.gameManager = new GameManager(panel3D);
    await this.wasmManager.load(this.gameManager);

    const message = document.querySelector("#message") as HTMLElement;

    try {
      await this.gameManager.init(this.wasmManager);
    } catch (err: unknown) {
      message.style.display = "initial";
      message.innerHTML = (err as Error).message;
    }
  }

  static styles = css`
    x-button {
      margin: 1rem 0 0 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "x-application": Application;
  }
}
