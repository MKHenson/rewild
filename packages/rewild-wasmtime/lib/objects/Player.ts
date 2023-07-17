import { wasm } from "../WasmManager";
import { PlayerComponent } from "../components";

export class Player {
  playerComponent: PlayerComponent;
  transformPtr: Number;

  constructor() {
    this.transformPtr = wasm.createTransformNode("player");
    this.playerComponent = new PlayerComponent();
    wasm.addComponent(this.transformPtr as any, this.playerComponent.pointer);
  }
}
