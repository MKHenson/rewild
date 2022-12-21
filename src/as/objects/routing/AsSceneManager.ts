import { Runtime } from "./core/Runtime";
import { EngineVector4 } from "../../math/Vector4";
import { WebGPURenderer } from "../../renderers/WebGPURenderer";
import { Container } from ".";

let runtime: Runtime | null = null;
const renderer = new WebGPURenderer();

export function getRuntime(): Runtime {
  return runtime!;
}

export function init(w: u16, h: u16): void {
  console.log("Starting Engine");
  renderer.init(new EngineVector4(0, 0, f32(w), f32(h)));
  runtime = new Runtime(f32(w), f32(h), renderer);
}

export function resize(w: u16, h: u16): void {
  runtime!.onResize(w, h);
}

export function update(total: u32, delta: f32): void {
  runtime!.OnLoop(delta, total);
}

export function addContainer(container: Container, activate: boolean): void {
  runtime!.addContainer(container, activate);
}

export function removeContainer(container: Container): void {
  runtime!.removeContainer(container);
}
