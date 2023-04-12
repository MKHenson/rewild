import { wasm } from "../core/WasmManager";

export class Player {
  propertiesView: Int32Array;
  playerPtr: Number;
  transformPtr: Number;

  constructor() {
    this.transformPtr = wasm.createTransformNode("player");
    this.playerPtr = wasm.createPlayerComponent();
    this.propertiesView = wasm.getInt32Array(wasm.getPlayerComponentProperties(this.playerPtr as any));

    wasm.addComponent(this.transformPtr as any, this.playerPtr as any);
  }

  get health() {
    return this.propertiesView[0];
  }

  get hunger() {
    return this.propertiesView[2];
  }
}
