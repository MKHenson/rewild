import { wasm } from "./WasmManager";
import { Object3D } from "./Object3D";

export class Light extends Object3D {
  constructor(transform: Number, name?: string) {
    super(name, transform);
  }

  set intensity(val: number) {
    wasm.setLightIntensity(this.transform as any, val);
  }

  setColor(r: number, g: number, b: number) {
    wasm.setLightColor(this.transform as any, r, g, b);
  }

  setTarget(r: number, g: number, b: number) {
    wasm.setLightTarget(this.transform as any, r, g, b);
  }
}
