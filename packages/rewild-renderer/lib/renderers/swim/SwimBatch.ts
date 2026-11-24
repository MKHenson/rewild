import { Box3, Matrix4, Ray, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { Geometry } from '../../geometry/Geometry';
import { SwimInstancedPass } from '../../materials/SwimInstancedPass';
import { IS_VISUAL_COMPONENT } from '../../typeGuards';
import { IRaycaster, IVisualComponent } from '../../../types/interfaces';
import { Intersection, Raycaster } from '../../core/Raycaster';
import { ChainShape } from '../skinning/ChainLayer';
import { SwimBody, SwimModel } from './SwimModel';

/** Floats per member: posScale, rotation, wave. Matches SwimInstance. */
export const SWIM_STRIDE = 12;
/** projMatrix + modelViewMatrix + nodeMatrix + body + shape. */
const UNIFORM_FLOATS = 16 * 3 + 8;

const _inverse = new Matrix4();
const _ray = new Ray();
const _hit = new Vector3();

/** How fins flutter about the body's long axis. Needs a COLOR_0.r fin mask. */
export interface FinFlutter {
  /** Radians a fully masked vertex turns either side. */
  amplitude: number;
  /** Fin beats per tail beat. */
  rate: number;
}

/** How the wave runs down the body. The same shape a bone fish's chain takes. */
export interface SwimShape extends ChainShape {
  fin?: FinFlutter;
}

/**
 * Many fish of one model, drawn in one call per primitive and bent in the
 * vertex shader. Members live in one flat array in the batch's local space;
 * set them, then `commit` once a frame to upload them and refit the bounds.
 * Add `transform` to the scene to draw it.
 */
export class SwimBatch {
  readonly transform = new Transform();
  readonly meshes: SwimBatchMesh[] = [];
  readonly model: SwimModel;
  readonly capacity: number;
  /** Members drawn, from the start of the array. */
  count = 0;
  /** posScale, rotation, wave per member. */
  readonly data: Float32Array<ArrayBuffer>;
  readonly shape: SwimShape;
  /** Batch-local bounds over every member. */
  readonly localBounds = new Box3();

  private buffer: GPUBuffer | null = null;
  private version = 0;
  private uploaded = -1;

  constructor(
    private readonly renderer: Renderer,
    readonly modelId: string,
    shape: SwimShape,
    capacity: number
  ) {
    this.model = renderer.swimModels.acquire(renderer, modelId);
    this.shape = shape;
    this.capacity = capacity;
    this.data = new Float32Array(Math.max(1, capacity) * SWIM_STRIDE);
    for (const primitive of this.model.primitives) {
      const mesh = new SwimBatchMesh(
        this,
        primitive.geometry,
        primitive.pass,
        primitive.nodeMatrix
      );
      this.transform.addChild(mesh.transform);
      this.meshes.push(mesh);
    }
  }

  /**
   * Places member `i`: batch-local position, uniform scale, and Euler angles
   * applied in YXZ order, as a creature's transform takes them.
   */
  setPlace(
    i: number,
    x: number,
    y: number,
    z: number,
    scale: number,
    rx: number,
    ry: number,
    rz: number
  ): void {
    const o = i * SWIM_STRIDE;
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = scale;
    writeQuaternionYXZ(d, o + 4, rx, ry, rz);
  }

  /** Sets member `i`'s wave, as SwimDriver gives it: radians each. */
  setWave(i: number, phase: number, amplitude: number, curve: number): void {
    const o = i * SWIM_STRIDE + 8;
    const d = this.data;
    d[o] = phase;
    d[o + 1] = amplitude;
    d[o + 2] = curve;
  }

  /** Uploads the members on the next draw and refits the bounds. */
  commit(): void {
    this.version++;
    const { data, localBounds } = this;
    const reach = this.model.body.radius;
    if (this.count === 0) {
      localBounds.min.set(0, 0, 0);
      localBounds.max.set(0, 0, 0);
    } else {
      let x0 = Infinity;
      let y0 = Infinity;
      let z0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let z1 = -Infinity;
      for (let i = 0; i < this.count; i++) {
        const o = i * SWIM_STRIDE;
        const r = reach * data[o + 3];
        if (data[o] - r < x0) x0 = data[o] - r;
        if (data[o + 1] - r < y0) y0 = data[o + 1] - r;
        if (data[o + 2] - r < z0) z0 = data[o + 2] - r;
        if (data[o] + r > x1) x1 = data[o] + r;
        if (data[o + 1] + r > y1) y1 = data[o + 1] + r;
        if (data[o + 2] + r > z1) z1 = data[o + 2] + r;
      }
      localBounds.min.set(x0, y0, z0);
      localBounds.max.set(x1, y1, z1);
    }
    this.moved();
  }

  /** Tells the scene the batch moved, as after changing `transform`. */
  moved(): void {
    const bvh = this.renderer.sceneBVH;
    if (bvh)
      for (let i = 0; i < this.meshes.length; i++)
        bvh.markObjectMoved(this.meshes[i].transform);
  }

  /** The member buffer, uploaded when the members changed since the last
   *  draw. */
  instanceBuffer(renderer: Renderer): GPUBuffer {
    const { device } = renderer;
    this.buffer ??= device.createBuffer({
      label: 'swim instances',
      size: this.data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    if (this.uploaded !== this.version) {
      this.uploaded = this.version;
      device.queue.writeBuffer(
        this.buffer,
        0,
        this.data,
        0,
        this.count * SWIM_STRIDE
      );
    }
    return this.buffer;
  }

  dispose(): void {
    this.transform.parent?.removeChild(this.transform);
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes.length = 0;
    this.buffer?.destroy();
    this.buffer = null;
    this.count = 0;
    this.renderer.swimModels.release(this.modelId);
  }
}

/** One primitive of a batch, as the scene sees it. */
export class SwimBatchMesh implements IVisualComponent {
  readonly [IS_VISUAL_COMPONENT] = true as const;
  readonly transform = new Transform();
  visible = true;
  castShadow = false;

  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private bindGroupPipeline: GPURenderPipeline | null = null;
  private bindGroupBuffer: GPUBuffer | null = null;
  private readonly uniforms = new Float32Array(UNIFORM_FLOATS);

  constructor(
    readonly batch: SwimBatch,
    readonly geometry: Geometry,
    readonly material: SwimInstancedPass,
    nodeMatrix: Float32Array
  ) {
    this.transform.component = this;
    this.uniforms.set(nodeMatrix, 32);
    writeBodyUniforms(batch.model.body, batch.shape, this.uniforms, 48);
  }

  get localBounds(): Box3 {
    return this.batch.localBounds;
  }

  /** Hits the batch bounds when the raycaster asks for skinned meshes. */
  raycast(raycaster: IRaycaster, intersects: Intersection[]): void {
    if (!(raycaster instanceof Raycaster) || !raycaster.hitsSkinned) return;
    if (this.batch.count === 0) return;

    const matrixWorld = this.transform.matrixWorld;
    _inverse.copy(matrixWorld).invert();
    _ray.copy(raycaster.ray).applyMatrix4(_inverse);
    if (_ray.intersectBox(this.localBounds, _hit) === null) return;

    _hit.applyMatrix4(matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(_hit);
    if (distance < raycaster.near || distance > raycaster.far) return;

    const intersection = new Intersection();
    intersection.distance = distance;
    intersection.point = _hit.clone();
    intersection.object = this.transform;
    intersection.face = null;
    intersects.push(intersection);
  }

  prepare(renderer: Renderer, pass: SwimInstancedPass): GPUBindGroup | null {
    const instances = this.batch.instanceBuffer(renderer);
    if (
      this.bindGroup &&
      this.bindGroupPipeline === pass.pipeline &&
      this.bindGroupBuffer === instances
    )
      return this.bindGroup;

    const { device } = renderer;
    this.uniformBuffer ??= device.createBuffer({
      label: 'swim batch uniforms',
      size: this.uniforms.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroupPipeline = pass.pipeline;
    this.bindGroupBuffer = instances;
    this.bindGroup = device.createBindGroup({
      layout: pass.instanceBindGroupLayout(),
      label: 'swim batch instances',
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: instances } },
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
    const uniforms = this.uniforms;
    uniforms.set(projection, 0);
    uniforms.set(modelView, 16);
    renderer.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);
  }

  dispose(): void {
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.bindGroupPipeline = null;
    this.bindGroupBuffer = null;
  }
}

/** The body and shape vec4s of the shader's Uniforms, at `offset`. */
export function writeBodyUniforms(
  body: SwimBody,
  shape: SwimShape,
  out: Float32Array,
  offset: number
): void {
  out[offset] = body.nose;
  out[offset + 1] = body.length;
  out[offset + 2] = body.pivot;
  out[offset + 3] = shape.wavelength;
  out[offset + 4] = shape.stiff;
  out[offset + 5] = shape.head ?? 0;
  out[offset + 6] = shape.fin?.amplitude ?? 0;
  out[offset + 7] = shape.fin?.rate ?? 0;
}

/** Writes the quaternion of Euler angles `x, y, z` in YXZ order at `o`. */
export function writeQuaternionYXZ(
  out: Float32Array,
  o: number,
  x: number,
  y: number,
  z: number
): void {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  out[o] = s1 * c2 * c3 + c1 * s2 * s3;
  out[o + 1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[o + 2] = c1 * c2 * s3 - s1 * s2 * c3;
  out[o + 3] = c1 * c2 * c3 + s1 * s2 * s3;
}
