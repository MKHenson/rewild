import { TransformNode } from '../../core/TransformNode';
import { transformCallback } from '../Imports';

export class DebugTransform extends TransformNode {
  constructor(name: string) {
    super();
    this.name = name;
  }
}

export function createDebugTransform(name: string): TransformNode {
  return new DebugTransform(name);
}
