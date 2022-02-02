import { LitElement, css, html, PropertyValues } from "lit";
import { customElement } from "lit/decorators.js";
import { Modal } from "../common/Modal";
import wasmFile from "../../../../build/untouched.wasm";
import type * as MyModule from "../../../../build/types";
import { createBindingsGPU, bindExports } from "../../AppBindings";
import loader, { ASUtil, ResultObject } from "@assemblyscript/loader";
import { GameManager } from "../../core/GameManager";
import { Pane3D } from "../common/Pane3D";

export type ExportType = ResultObject & { exports: ASUtil & typeof MyModule };
export type WasmInterface = ASUtil & typeof MyModule;

// Creating WASM with Linear memory
const memory = new WebAssembly.Memory({ initial: 100 });
const importObject: WebAssembly.Imports = {
  env: {
    memory: memory,
    seed: Date.now,
    abort: (...args: any[]) => {
      console.log("abort");
      console.log((importObject.env as any).getString(args[0]));
    },
    getString: (string_index: number) => {
      const buffer = (importObject.env as any).memory.buffer;
      const U32 = new Uint32Array(buffer);
      const id_addr = string_index / 4 - 2;
      const id = U32[id_addr];
      if (id !== 0x01) throw Error(`not a string index=${string_index} id=${id}`);
      const len = U32[id_addr + 1];
      const str = new TextDecoder("utf-16").decode(buffer.slice(string_index, string_index + len));
      return str;
    },
  },
};

@customElement("x-application")
export class Application extends LitElement {
  private gameManager: GameManager;
  #mainMenu: Modal;

  constructor() {
    super();
  }

  render() {
    return html`<x-modal open @close=${this.#onStart} id="main-menu" hideConfirmButtons>
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

  #onStart() {
    this.#mainMenu.open = false;
  }

  async firstUpdated(changedProps: PropertyValues) {
    super.firstUpdated(changedProps);

    this.#mainMenu = this.shadowRoot!.querySelector("#main-menu") as Modal;
    const panel3D = this.shadowRoot!.querySelector("x-pane3d") as Pane3D;

    // Wait for panel to be fully mounted
    await panel3D.updateComplete;

    this.gameManager = new GameManager(panel3D);
    createBindingsGPU(importObject, this.gameManager);
    this.init();
  }

  private async init() {
    // Load the wasm file
    const obj = await loader.instantiateStreaming<typeof MyModule>(fetch(wasmFile), importObject);
    const message = document.querySelector("#message") as HTMLElement;

    // Bind the newly created export file
    bindExports(obj);

    try {
      await this.gameManager.init(obj.exports);
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
