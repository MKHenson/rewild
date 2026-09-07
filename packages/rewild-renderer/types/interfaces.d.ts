import {
  Geometry,
  IMaterialPass,
  IS_SCATTER_INSTANCE_GROUP,
  IS_VISUAL_COMPONENT,
  Renderer,
  Transform,
} from '../lib';
import { Camera } from '../lib/core/Camera';
import { Box3 } from 'rewild-common';

export interface IVisualComponent {
  readonly [IS_VISUAL_COMPONENT]: true;
  transform: Transform;
  geometry: Geometry;
  material: IMaterialPass;
  visible: boolean;
  castShadow?: boolean;
  /**
   * Local-space bounds to cull against instead of the geometry's own. Only a
   * component that draws its geometry somewhere other than its transform needs
   * this — an instanced group spreads one geometry over a whole chunk, so
   * culling it by the geometry alone tests a single point.
   */
  localBounds?: Box3 | null;
}

// A chunk's instances of one scatter layer, drawn in a single call. Owns its
// own GPU buffers because a pass is shared by every chunk growing the layer.
export interface IScatterInstanceGroup extends IVisualComponent {
  readonly [IS_SCATTER_INSTANCE_GROUP]: true;
  instanceCount: number;
  /** The primitive's transform within its model, applied before the instance
   *  transform. */
  readonly nodeMatrix: Float32Array;
  /** Metres beyond which instances are not drawn. */
  readonly cullDistance: number;
  /** The per-instance transform buffer, uploaded on first use, or null when the
   *  group holds nothing. The shadow pass binds the same buffer under its own
   *  layout. */
  instanceStorageBuffer(renderer: Renderer): GPUBuffer | null;
  /** Uploads on first use and returns the group-1 bind group, or null while the
   *  data is not ready. */
  prepareInstances(
    renderer: Renderer,
    pass: { instanceBindGroupLayout(): GPUBindGroupLayout }
  ): GPUBindGroup | null;
  writeFrameUniforms(
    renderer: Renderer,
    projection: Float32Array,
    modelView: Float32Array
  ): void;
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
