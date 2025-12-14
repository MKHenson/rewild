import { Renderer, Transform } from '../lib';
import { Camera } from '../lib/core/Camera';

interface IRenderable {
  initialize(renderer: Renderer): Promise<IRenderable>;
  update(renderer: Renderer, delta: number, totalTime: number): void;
  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera): void;
}

interface IMeshComponent {
  transform: Transform;
}

export interface IRaycaster {
  layers: Layers;

  intersectObject(
    object: Transform,
    recursive: boolean = false,
    intersects: Intersection[] = []
  ): Intersection[];

  intersectObjects(
    objects: Transform[],
    recursive: boolean = false,
    intersects: Intersection[] = []
  ): Intersection[];
}
