import { Box3, Matrix4, Quaternion, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { Geometry } from '../../geometry/Geometry';
import { IS_VISUAL_COMPONENT } from '../../typeGuards';
import {
  SCATTER_GPU_STRIDE,
  SCATTER_UNIFORM_BYTES,
  ScatterInstancedPass,
} from '../../materials/ScatterInstancedPass';
import { IScatterInstanceGroup } from '../../../types/interfaces';
import { SCATTER_INSTANCE_STRIDE, ScatterInstances } from './Scatter';

const _matrix = new Matrix4();
const _position = new Vector3();
const _rotation = new Quaternion();
const _scale = new Vector3();
const _corner = new Vector3();
const _point = new Vector3();

/**
 * One chunk's instances of one scatter layer primitive — the unit of a draw.
 *
 * It is an IVisualComponent so the renderer's existing material/geometry
 * grouping picks it up: every chunk growing a layer lands in one group, and the
 * pass walks them issuing a draw each. That is also where per-chunk culling
 * comes from, since `visible` already follows the chunk.
 */
export class ScatterChunkLayer implements IScatterInstanceGroup {
  readonly [IS_VISUAL_COMPONENT] = true as const;

  transform: Transform;
  geometry: Geometry;
  material: ScatterInstancedPass;
  visible = true;
  // Off until the shadow pass gains an instanced path (#220). The per-mesh path
  // draws one copy per caster, which for a chunk of instances would be a single
  // stray shadow at the chunk origin rather than a forest.
  castShadow = false;
  instanceCount: number;
  /** The layer's draw range in metres, measured to the chunk's nearest edge. */
  cullDistance: number;
  /**
   * Chunk-local bounds over every instance. Without it the scene BVH would cull
   * a whole chunk of scatter by the bounds of the single model at the chunk
   * origin, so the layer would blink in and out as that one point crossed the
   * frustum edge.
   */
  localBounds: Box3;

  // The renderer walks transforms and asks their component to raycast. Scatter
  // is not pickable — the editor selects a layer's density, never one instance.
  raycast(): void {}

  /** The primitive's place within its glTF model, applied before the instance
   *  transform. Held as a matrix rather than baked into the geometry so two
   *  layers can share one model's buffers. */
  private nodeMatrix: Float32Array<ArrayBuffer>;
  private instanceData: Float32Array<ArrayBuffer>;
  private instanceBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private frameUniforms = new Float32Array(SCATTER_UNIFORM_BYTES / 4);
  private constantsWritten = false;

  constructor(
    transform: Transform,
    geometry: Geometry,
    material: ScatterInstancedPass,
    nodeMatrix: Float32Array<ArrayBuffer>,
    instances: ScatterInstances,
    cullDistance: number
  ) {
    this.transform = transform;
    this.transform.component = this;
    this.geometry = geometry;
    this.material = material;
    this.nodeMatrix = nodeMatrix;
    this.instanceCount = instances.count;
    this.cullDistance = cullDistance;
    this.instanceData = packInstances(instances);
    this.localBounds = computeInstanceBounds(geometry, nodeMatrix, instances);
  }

  prepareInstances(
    renderer: Renderer,
    pass: ScatterInstancedPass
  ): GPUBindGroup | null {
    if (this.bindGroup) return this.bindGroup;
    if (this.instanceCount === 0) return null;

    const { device } = renderer;

    this.instanceBuffer = device.createBuffer({
      label: 'scatter instances',
      size: this.instanceData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.instanceBuffer, 0, this.instanceData);

    this.uniformBuffer = device.createBuffer({
      label: 'scatter chunk uniforms',
      size: SCATTER_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: pass.instanceBindGroupLayout(),
      label: 'scatter chunk instances',
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.instanceBuffer } },
      ],
    });

    return this.bindGroup;
  }

  writeFrameUniforms(
    renderer: Renderer,
    projection: Float32Array,
    modelView: Float32Array
  ): void {
    if (!this.uniformBuffer) return;

    const uniforms = this.frameUniforms;
    uniforms.set(projection, 0);
    uniforms.set(modelView, 16);
    if (!this.constantsWritten) {
      uniforms.set(this.nodeMatrix, 32);
      uniforms[48] = this.cullDistance;
      this.constantsWritten = true;
    }

    renderer.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
  }

  dispose(): void {
    this.instanceBuffer?.destroy();
    this.uniformBuffer?.destroy();
    this.instanceBuffer = null;
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.instanceCount = 0;
  }
}

/**
 * scatterChunk's 9-float instances into the shader's 12-float layout: two vec4s
 * plus a params slot, which is what std430 alignment costs and what the wind
 * variant will read its phase out of.
 */
export function packInstances(
  instances: ScatterInstances
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(instances.count * SCATTER_GPU_STRIDE);
  const data = instances.data;

  for (let i = 0; i < instances.count; i++) {
    const src = i * SCATTER_INSTANCE_STRIDE;
    const dst = i * SCATTER_GPU_STRIDE;

    out[dst] = data[src];
    out[dst + 1] = data[src + 1];
    out[dst + 2] = data[src + 2];
    out[dst + 3] = data[src + 7];

    out[dst + 4] = data[src + 3];
    out[dst + 5] = data[src + 4];
    out[dst + 6] = data[src + 5];
    out[dst + 7] = data[src + 6];

    out[dst + 8] = data[src + 8];
  }

  return out;
}

/**
 * A glTF node's accumulated transform as a column-major matrix.
 *
 * Non-uniform scale is rejected rather than approximated: the shader recovers
 * the instance normal by rotating it, which is only correct while every scale in
 * the chain is uniform, and a silently wrong normal is far harder to spot than a
 * load-time throw.
 */
export function composeNodeMatrix(
  translation: [number, number, number],
  rotation: [number, number, number, number],
  scale: [number, number, number],
  parent: Float32Array<ArrayBuffer> | null,
  layerName: string
): Float32Array<ArrayBuffer> {
  const [sx, sy, sz] = scale;
  if (Math.abs(sx - sy) > 1e-4 || Math.abs(sx - sz) > 1e-4)
    throw new Error(
      `Scatter layer '${layerName}' has a node scaled non-uniformly (${sx}, ${sy}, ${sz}) — instanced normals assume a uniform scale.`
    );

  _position.set(translation[0], translation[1], translation[2]);
  _rotation.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  _scale.set(sx, sy, sz);
  _matrix.compose(_position, _rotation, _scale);

  const local = new Float32Array(_matrix.elements);
  return parent ? multiplyMatrices(parent, local) : local;
}

/** Column-major `a * b`. */
function multiplyMatrices(
  a: Float32Array,
  b: Float32Array
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/**
 * Chunk-local bounds covering every instance.
 *
 * The model is bounded by a radius rather than a rotated box: instances carry
 * an arbitrary yaw and slope tilt, so the sphere is both cheaper and the only
 * form that stays correct under rotation.
 */
function computeInstanceBounds(
  geometry: Geometry,
  nodeMatrix: Float32Array,
  instances: ScatterInstances
): Box3 {
  const bounds = new Box3();
  bounds.makeEmpty();
  if (instances.count === 0) return bounds;

  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  const box = geometry.boundingBox!;

  _matrix.fromArray(nodeMatrix);
  let radius = 0;
  for (let i = 0; i < 8; i++) {
    _corner.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z
    );
    _corner.applyMatrix4(_matrix);
    radius = Math.max(radius, _corner.length());
  }

  const data = instances.data;
  for (let i = 0; i < instances.count; i++) {
    const base = i * SCATTER_INSTANCE_STRIDE;
    const reach = radius * data[base + 7];

    _point.set(
      data[base] - reach,
      data[base + 1] - reach,
      data[base + 2] - reach
    );
    bounds.expandByPoint(_point);
    _point.set(
      data[base] + reach,
      data[base + 1] + reach,
      data[base + 2] + reach
    );
    bounds.expandByPoint(_point);
  }

  return bounds;
}
