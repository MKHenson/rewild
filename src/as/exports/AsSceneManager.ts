import { RenderLoop } from "../core/RenderLoop";
import { Runtime } from "../objects/routing/core/Runtime";
import { print } from "../Imports";
import { Vector4 } from "../math/Vector4";
import { WebGPURenderer } from "../renderers/WebGPURenderer";

let runtime: Runtime | null = null;
const renderer = new WebGPURenderer();

export function getRuntime(): Runtime {
  return runtime!;
}

export function init(w: u16, h: u16): void {
  print("Starting Engine");
  renderer.init(new Vector4(0, 0, f32(w), f32(h)));
  runtime = new Runtime(f32(w), f32(h), renderer);
}

export function resize(w: u16, h: u16): void {
  runtime!.onResize(w, h);
}

const renderLoop = new RenderLoop((delta: f32, total: u32, fps: u32) => {
  runtime!.OnLoop(delta, total, fps);
});

export function update(now: u32): void {
  renderLoop.onFrame(now);
}
