import { Runtime } from './core/Runtime';
import { EngineVector4 } from '../../math/Vector4';
import { WebGPURenderer } from '../../renderers/WebGPURenderer';
import { Node, Portal } from '.';
import { TransformNode } from '../../core/TransformNode';

let runtime: Runtime | null = null;
const renderer = new WebGPURenderer();

export function getRuntime(): Runtime {
  return runtime!;
}

export function init(w: u16, h: u16): void {
  renderer.init(new EngineVector4(0, 0, f32(w), f32(h)));
  runtime = new Runtime(f32(w), f32(h), renderer);
  runtime!.init();
}

export function resize(w: u16, h: u16): void {
  runtime!.onResize(w, h);
}

export function sendSignal(sourcePortal: Portal, turnOff: boolean): void {
  runtime!.sendSignal(sourcePortal, turnOff);
}

export function update(total: u32, delta: f32): void {
  runtime!.OnLoop(delta, total);
}

export function addNodeToRuntime(node: Node, activate: boolean): void {
  runtime!.addNode(node, activate);
}

export function removeNodeFromRuntime(container: Node): void {
  runtime!.removeNode(container);
}

export function getActiveNodeCount(): i32 {
  return runtime!.activeNodes.length;
}

export function getNodeCount(): i32 {
  return runtime!.nodes.length;
}

export function getScene(): TransformNode {
  return runtime!.scene;
}

export function getCamera(): TransformNode {
  return runtime!.camera;
}
