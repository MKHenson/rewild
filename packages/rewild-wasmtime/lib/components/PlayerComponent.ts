import { wasm } from '../WasmManager';
import { Component } from './Component';

export class PlayerComponent extends Component {
  constructor() {
    super(wasm.createPlayerComponent());
  }

  get health() {
    return wasm.getPlayerHealth(this.pointer);
  }

  get hunger() {
    return wasm.getPlayerHunger(this.pointer);
  }
}
