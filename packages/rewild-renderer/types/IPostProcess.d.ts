import { Renderer } from '../lib';
import { PostProcessManager } from '../lib/post-processes/PostProcessManager';

export interface IPostProcess {
  renderTarget: GPUTexture;
  manager: PostProcessManager;
  init(renderer: Renderer): IPostProcess;
  dispose(): void;
}
