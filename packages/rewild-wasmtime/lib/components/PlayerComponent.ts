import { wasm } from '../WasmManager';
import { Component } from './Component';

export class PlayerComponent extends Component {
  propertiesView: Int32Array;

  constructor() {
    super(wasm.createPlayerComponent());
    this.propertiesView = wasm.getInt32Array(
      wasm.getPlayerComponentProperties(this.pointer)
    );
  }

  get health() {
    return this.propertiesView[0];
  }

  get hunger() {
    return this.propertiesView[2];
  }
}
