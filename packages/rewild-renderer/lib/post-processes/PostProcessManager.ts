import { Renderer } from '..';
import { IPostProcess } from '../../types/IPostProcess';

export class PostProcessManager {
  postProcesses: IPostProcess[] = [];
  currentPostProcess: IPostProcess | null = null;
  prevPostProcess: IPostProcess | null = null;

  constructor() {}

  init(renderer: Renderer): void {
    this.postProcesses.forEach((postProcess) => {
      postProcess.init(renderer);
    });
  }

  addPostProcess(postProcess: IPostProcess): void {
    this.postProcesses.push(postProcess);
    postProcess.manager = this;
  }

  getPostProcessAt(index: number): IPostProcess | null {
    if (index < 0 || index >= this.postProcesses.length) {
      return null;
    }
    return this.postProcesses[index];
  }

  getIndexOfPostProcess(postProcess: IPostProcess): number {
    return this.postProcesses.indexOf(postProcess);
  }
}
