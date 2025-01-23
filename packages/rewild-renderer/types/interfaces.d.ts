import { Renderer } from '../lib';

interface IRenderable {
  initialize(renderer: Renderer): Promise<IRenderable>;
  render(renderer: Renderer, pass: GPURenderPassEncoder): void;
}
