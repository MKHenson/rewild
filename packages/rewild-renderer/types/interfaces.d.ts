import { Renderer } from '../lib';
import { Camera } from '../lib/core/Camera';

interface IRenderable {
  initialize(renderer: Renderer): Promise<IRenderable>;
  update(renderer: Renderer): void;
  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera): void;
}
