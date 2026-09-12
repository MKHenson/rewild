import { Box3, Frustum, Matrix4, Quaternion, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { Geometry } from '../../geometry/Geometry';
import {
  IS_SCATTER_INSTANCE_GROUP,
  IS_VISUAL_COMPONENT,
} from '../../typeGuards';
import {
  SCATTER_GPU_STRIDE,
  SCATTER_UNIFORM_BYTES,
} from '../../materials/ScatterInstancedPass';
import { IMaterialPass } from '../../materials/IMaterialPass';
import { IScatterInstanceGroup } from '../../../types/interfaces';
import { SCATTER_INSTANCE_STRIDE, ScatterInstances } from './Scatter';
import {
  ScatterLayer,
  lodFadeHalfWidth,
  lodTierFar,
  lodTierNear,
} from './ScatterLayers';

const _matrix = new Matrix4();
const _position = new Vector3();
const _rotation = new Quaternion();
const _scale = new Vector3();
const _corner = new Vector3();
const _cellBox = new Box3();

/** Cells per side a chunk's instances are bucketed into; 60m at a 480m chunk. */
export const SCATTER_CELL_GRID = 8;
const CELL_COUNT = SCATTER_CELL_GRID * SCATTER_CELL_GRID;

/** Instances bucketed by cell: the packing order, where each cell's run starts
 *  in it, and each cell's chunk-local bounds as min xyz, max xyz. */
export interface ScatterCells {
  order: Int32Array;
  starts: Int32Array;
  bounds: Float32Array;
}

/** A pass that draws from a group's own instance buffer — the mesh tiers'
 *  pass and the impostor's both. */
export interface IScatterInstancePass extends IMaterialPass {
  instanceBindGroupLayout(): GPUBindGroupLayout;
}

/**
 * One chunk's instances of one scatter layer primitive at one LOD tier — the
 * unit of a draw.
 *
 * It is an IVisualComponent so the renderer's existing material/geometry
 * grouping picks it up: every chunk growing a layer lands in one group, and the
 * pass walks them issuing a draw each. That is also where per-chunk culling
 * comes from, since `visible` already follows the chunk.
 *
 * Every tier of a layer draws the same instance buffer; what differs is the
 * mesh and the [near, far) distance band the shader keeps. Selecting the tier
 * per instance on the GPU is what leaves the buffer untouched as the camera
 * moves.
 *
 * The buffer is ordered by cell — a grid over the chunk — so a draw can skip
 * whole cells the band cannot reach. Without that every tier would push every
 * instance through the vertex stage only to collapse most of them, and a chunk
 * standing in the 45m band would cost its full model for all 480m of it.
 */
export class ScatterChunkLayer implements IScatterInstanceGroup {
  readonly [IS_VISUAL_COMPONENT] = true as const;
  readonly [IS_SCATTER_INSTANCE_GROUP] = true as const;

  transform: Transform;
  geometry: Geometry;
  material: IScatterInstancePass;
  visible = true;
  castShadow = true;
  instanceCount: number;
  /** The library row this draws for, which owns the LOD chain's distances. */
  readonly layer: ScatterLayer;
  /** Which mesh of the layer's LOD chain this draws; 0 is the model itself. */
  readonly tier: number;
  /** Metres from the viewer at which this tier takes over from the one before
   *  it. 0 for the nearest tier. */
  nearDistance = 0;
  /** Metres at which this tier hands over, or the layer's cull distance for
   *  the last. Equal to `nearDistance` while the tier has nothing to draw. */
  cullDistance = 0;
  /**
   * The band the scene pass draws, wider than the hard one: the tier fades in
   * over [0] to [1] and out over [2] to [3], sharing each handover's metres
   * with its neighbour so the two cross-fade. The shadow pass keeps the hard
   * band — a filtered shadow map hides a swap the eye would catch.
   */
  readonly fadeBand = new Float32Array(4);
  /**
   * Chunk-local bounds over every instance. Without it the scene BVH would cull
   * a whole chunk of scatter by the bounds of the single model at the chunk
   * origin, so the layer would blink in and out as that one point crossed the
   * frustum edge.
   */
  localBounds: Box3;
  /** The primitive's place within its glTF model, applied before the instance
   *  transform. Held as a matrix rather than baked into the geometry so two
   *  layers can share one model's buffers. */
  readonly nodeMatrix: Float32Array<ArrayBuffer>;

  // The renderer walks transforms and asks their component to raycast. Scatter
  // is not pickable — the editor selects a layer's density, never one instance.
  raycast(): void {}

  /** Contiguous instance runs the current band can reach, set by
   *  selectInstances: `rangeCount` runs of `rangeStarts[i]` + `rangeCounts[i]`. */
  readonly rangeStarts = new Int32Array(CELL_COUNT);
  readonly rangeCounts = new Int32Array(CELL_COUNT);
  rangeCount = 0;

  private cells: ScatterCells;
  private instanceData: Float32Array<ArrayBuffer>;
  private instanceBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private frameUniforms = new Float32Array(SCATTER_UNIFORM_BYTES / 4);
  private nodeMatrixWritten = false;

  /**
   * `reach` is how far the drawn thing extends from an instance's origin at
   * scale 1 — the model's bounding radius for a mesh tier, the billboard's for
   * the impostor — and is what the cell and chunk bounds are grown by.
   */
  constructor(
    transform: Transform,
    geometry: Geometry,
    material: IScatterInstancePass,
    nodeMatrix: Float32Array<ArrayBuffer>,
    instances: ScatterInstances,
    layer: ScatterLayer,
    tier: number,
    lodBias: number,
    reach: number
  ) {
    this.transform = transform;
    this.transform.component = this;
    this.geometry = geometry;
    this.material = material;
    this.nodeMatrix = nodeMatrix;
    this.instanceCount = instances.count;
    this.layer = layer;
    this.tier = tier;
    this.applyLodBias(lodBias);
    this.cells = bucketInstances(instances, reach);
    this.instanceData = packInstances(instances, this.cells.order);
    this.localBounds = cellsBounds(this.cells);
  }

  /**
   * Picks the cells whose instances can fall inside the band from a viewer in
   * chunk-local space — and inside the frustum, when one is given — merged
   * into contiguous runs for the draw. Conservative: the shader still tests
   * each instance, this only spares it the ones that cannot pass. Called by
   * each pass every frame — cheap enough that sharing the answer would cost
   * more than recomputing it.
   *
   * The scene pass selects over the faded band and its frustum; the shadow
   * pass over the hard band and no frustum, since a caster off screen still
   * shadows what is on it.
   */
  selectInstances(viewer: Vector3, frustum: Frustum | null): void {
    this.rangeCount = 0;
    const near = frustum ? this.fadeBand[0] : this.nearDistance;
    const far = frustum ? this.fadeBand[3] : this.cullDistance;
    if (near >= far) return;

    const { starts, bounds } = this.cells;
    const world = this.transform.matrixWorld.elements;
    let runStart = -1;
    let runEnd = 0;

    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const first = starts[cell];
      const end = starts[cell + 1];
      if (first === end) continue;

      const b = cell * 6;
      const nx = nearAxis(viewer.x, bounds[b], bounds[b + 3]);
      const ny = nearAxis(viewer.y, bounds[b + 1], bounds[b + 4]);
      const nz = nearAxis(viewer.z, bounds[b + 2], bounds[b + 5]);
      const fx = farAxis(viewer.x, bounds[b], bounds[b + 3]);
      const fy = farAxis(viewer.y, bounds[b + 1], bounds[b + 4]);
      const fz = farAxis(viewer.z, bounds[b + 2], bounds[b + 5]);
      const nearest = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const farthest = Math.sqrt(fx * fx + fy * fy + fz * fz);

      let keep = nearest < far && farthest >= near;
      if (keep && frustum) {
        // Chunk transforms only translate, so the cell's world box is its
        // local one moved by the chunk's position.
        _cellBox.min.set(
          bounds[b] + world[12],
          bounds[b + 1] + world[13],
          bounds[b + 2] + world[14]
        );
        _cellBox.max.set(
          bounds[b + 3] + world[12],
          bounds[b + 4] + world[13],
          bounds[b + 5] + world[14]
        );
        keep = frustum.intersectsBox(_cellBox);
      }

      if (!keep) {
        if (runStart >= 0) this.pushRange(runStart, runEnd);
        runStart = -1;
        continue;
      }

      if (runStart < 0) runStart = first;
      runEnd = end;
    }

    if (runStart >= 0) this.pushRange(runStart, runEnd);
  }

  private pushRange(start: number, end: number): void {
    this.rangeStarts[this.rangeCount] = start;
    this.rangeCounts[this.rangeCount] = end - start;
    this.rangeCount++;
  }

  /** Re-reads the tier's distance band from the layer table under a bias.
   *  Picked up by the next frame's uniform write, so a bias set at runtime
   *  lands without touching the instance buffer. */
  applyLodBias(lodBias: number): void {
    const near = lodTierNear(this.layer, this.tier, lodBias);
    const far = lodTierFar(this.layer, this.tier, lodBias);
    this.nearDistance = near;
    this.cullDistance = far;

    const fade = this.fadeBand;
    if (near >= far) {
      fade.fill(0);
      return;
    }

    // A near edge at the viewer has nothing to fade from. A far edge at the
    // cull distance fades to nothing, so its blend sits wholly inside the
    // band rather than reaching past it.
    const nearHalf = near > 0 ? lodFadeHalfWidth(near) : 0;
    fade[0] = near - nearHalf;
    fade[1] = near + nearHalf;
    if (far >= this.layer.cullDistance) {
      fade[2] = far - 2 * lodFadeHalfWidth(far);
      fade[3] = far;
    } else {
      const farHalf = lodFadeHalfWidth(far);
      fade[2] = far - farHalf;
      fade[3] = far + farHalf;
    }
  }

  /** Whether the band has any width — a bias can shift the chain off a tier. */
  get draws(): boolean {
    return this.nearDistance < this.cullDistance;
  }

  /**
   * The instance transforms, uploaded on first use.
   *
   * Separate from prepareInstances because the shadow pass binds the same
   * buffer under its own layout, and runs before the scene pass in the frame —
   * whichever asks first is the one that uploads.
   */
  instanceStorageBuffer(renderer: Renderer): GPUBuffer | null {
    if (this.instanceCount === 0) return null;
    if (this.instanceBuffer) return this.instanceBuffer;

    const { device } = renderer;
    this.instanceBuffer = device.createBuffer({
      label: 'scatter instances',
      size: this.instanceData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.instanceBuffer, 0, this.instanceData);

    return this.instanceBuffer;
  }

  prepareInstances(
    renderer: Renderer,
    pass: IScatterInstancePass
  ): GPUBindGroup | null {
    if (this.bindGroup) return this.bindGroup;

    const instanceBuffer = this.instanceStorageBuffer(renderer);
    if (!instanceBuffer) return null;

    const { device } = renderer;

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
        { binding: 1, resource: { buffer: instanceBuffer } },
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
    if (!this.nodeMatrixWritten) {
      uniforms.set(this.nodeMatrix, 32);
      this.nodeMatrixWritten = true;
    }
    uniforms.set(this.fadeBand, 48);
    uniforms[52] = this.tier;
    uniforms[53] = renderer.terrainRenderer.scatterLodTint ? 1 : 0;

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

/** Distance from `v` to the interval [min, max] along one axis; 0 inside. */
function nearAxis(v: number, min: number, max: number): number {
  return v < min ? min - v : v > max ? v - max : 0;
}

/** Distance from `v` to the far end of [min, max] along one axis. */
function farAxis(v: number, min: number, max: number): number {
  return Math.max(Math.abs(v - min), Math.abs(v - max));
}

/**
 * scatterChunk's 9-float instances into the shader's 12-float layout: two vec4s
 * plus a params slot, which is what std430 alignment costs and what the wind
 * variant will read its phase out of. `order` is the packing order — instance
 * `order[i]` lands at slot `i` — and defaults to the list's own.
 */
export function packInstances(
  instances: ScatterInstances,
  order?: Int32Array
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(instances.count * SCATTER_GPU_STRIDE);
  const data = instances.data;

  for (let i = 0; i < instances.count; i++) {
    const src = (order ? order[i] : i) * SCATTER_INSTANCE_STRIDE;
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
 * The radius bounding the model about the instance origin.
 *
 * A radius rather than a rotated box: instances carry an arbitrary yaw and
 * slope tilt, so the sphere is both cheaper and the only form that stays
 * correct under rotation.
 */
export function modelRadius(
  geometry: Geometry,
  nodeMatrix: Float32Array
): number {
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
  return radius;
}

/**
 * Buckets instances into a SCATTER_CELL_GRID² grid over their own footprint,
 * row-major in z then x, so a cell's instances are one contiguous run of the
 * packed buffer and neighbouring cells in a row are one longer run. Each cell's
 * bounds cover its instances out to the model's reach at their scale.
 */
export function bucketInstances(
  instances: ScatterInstances,
  radius: number
): ScatterCells {
  const count = instances.count;
  const data = instances.data;
  const order = new Int32Array(count);
  const starts = new Int32Array(CELL_COUNT + 1);
  const bounds = new Float32Array(CELL_COUNT * 6);
  for (let c = 0; c < CELL_COUNT; c++) {
    bounds[c * 6] = bounds[c * 6 + 1] = bounds[c * 6 + 2] = Infinity;
    bounds[c * 6 + 3] = bounds[c * 6 + 4] = bounds[c * 6 + 5] = -Infinity;
  }
  if (count === 0) return { order, starts, bounds };

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const base = i * SCATTER_INSTANCE_STRIDE;
    minX = Math.min(minX, data[base]);
    maxX = Math.max(maxX, data[base]);
    minZ = Math.min(minZ, data[base + 2]);
    maxZ = Math.max(maxZ, data[base + 2]);
  }
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanZ = Math.max(maxZ - minZ, 1e-6);

  const cellOf = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * SCATTER_INSTANCE_STRIDE;
    const cx = Math.min(
      SCATTER_CELL_GRID - 1,
      Math.floor(((data[base] - minX) / spanX) * SCATTER_CELL_GRID)
    );
    const cz = Math.min(
      SCATTER_CELL_GRID - 1,
      Math.floor(((data[base + 2] - minZ) / spanZ) * SCATTER_CELL_GRID)
    );
    const cell = cz * SCATTER_CELL_GRID + cx;
    cellOf[i] = cell;
    starts[cell + 1]++;

    const reach = radius * data[base + 7];
    const b = cell * 6;
    bounds[b] = Math.min(bounds[b], data[base] - reach);
    bounds[b + 1] = Math.min(bounds[b + 1], data[base + 1] - reach);
    bounds[b + 2] = Math.min(bounds[b + 2], data[base + 2] - reach);
    bounds[b + 3] = Math.max(bounds[b + 3], data[base] + reach);
    bounds[b + 4] = Math.max(bounds[b + 4], data[base + 1] + reach);
    bounds[b + 5] = Math.max(bounds[b + 5], data[base + 2] + reach);
  }

  for (let c = 0; c < CELL_COUNT; c++) starts[c + 1] += starts[c];

  const cursor = starts.slice(0, CELL_COUNT);
  for (let i = 0; i < count; i++) order[cursor[cellOf[i]]++] = i;

  return { order, starts, bounds };
}

/** Chunk-local bounds covering every cell, and so every instance. */
function cellsBounds(cells: ScatterCells): Box3 {
  const bounds = new Box3();
  bounds.makeEmpty();
  const { starts, bounds: cell } = cells;

  for (let c = 0; c < CELL_COUNT; c++) {
    if (starts[c] === starts[c + 1]) continue;
    const b = c * 6;
    bounds.min.x = Math.min(bounds.min.x, cell[b]);
    bounds.min.y = Math.min(bounds.min.y, cell[b + 1]);
    bounds.min.z = Math.min(bounds.min.z, cell[b + 2]);
    bounds.max.x = Math.max(bounds.max.x, cell[b + 3]);
    bounds.max.y = Math.max(bounds.max.y, cell[b + 4]);
    bounds.max.z = Math.max(bounds.max.z, cell[b + 5]);
  }

  return bounds;
}
