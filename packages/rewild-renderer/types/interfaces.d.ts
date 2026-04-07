import {
  Geometry,
  IMaterialPass,
  IS_VISUAL_COMPONENT,
  Renderer,
  Transform,
} from '../lib';
import { Camera } from '../lib/core/Camera';

export interface IRenderable {
  initialize(renderer: Renderer): Promise<IRenderable>;
  update(renderer: Renderer, delta: number, totalTime: number): void;
  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera): void;
}

export interface IVisualComponent {
  readonly [IS_VISUAL_COMPONENT]: true;
  transform: Transform;
  geometry: Geometry;
  material: IMaterialPass;
  visible: boolean;
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

export interface IComponent {
  raycast: (raycaster: IRaycaster, intersects: Intersection[]) => void;
}

export interface ITransformObserver {
  worldMatrixUpdated(source: ITransform): void;
}

export interface MsdfChar {
  id: number;
  index: number;
  char: string;
  width: number;
  height: number;
  xoffset: number;
  yofsset: number;
  xadvance: number;
  chnl: number;
  x: number;
  y: number;
  page: number;
  charIndex: number;
}

export type KerningMap = Map<number, Map<number, number>>;

export interface MsdfTextMeasurements {
  width: number;
  height: number;
  lineWidths: number[];
  spacesPerLine: number[];
  printedCharCount: number;
}

export interface MsdfTextFormattingOptions {
  centered?: boolean;
  justify?: boolean;
  fontSize?: number;
  wordWrap?: boolean;
  color?: [number, number, number, number];
}
