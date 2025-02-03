import { Renderer } from '../lib';
import { Camera } from '../lib/core/Camera';

interface IRenderable {
  initialize(renderer: Renderer): Promise<IRenderable>;
  update(renderer: Renderer, delta: number, totalTime: number): void;
  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera): void;
}
