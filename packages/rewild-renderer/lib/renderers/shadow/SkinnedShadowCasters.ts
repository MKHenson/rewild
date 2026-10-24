import { Matrix4 } from 'rewild-common';
import { Renderer } from '../../Renderer';
import { IRenderGroup } from '../../../types/IRenderGroup';
import { IVisualComponent } from '../../../types/interfaces';
import {
  SKINNED_INSTANCE_FLOATS,
  SkinnedInstancedPass,
  writeSkinnedInstance,
} from '../../materials/SkinnedInstancedPass';
import { isSkinnedInstancedPass } from '../../typeGuards';

const CASCADES = 3;
/** shadowVP + params, matching Uniforms in shadow-depth-skinned.wgsl. */
const UNIFORM_FLOATS = 16 + 4;

/** One pass's casters, split into a draw list per cascade. */
interface SkinnedShadowBatch {
  capacity: number;
  data: Float32Array<ArrayBuffer>[];
  slots: Uint32Array[];
  instanceBuffers: GPUBuffer[];
  uniformBuffers: GPUBuffer[];
  bindGroups: (GPUBindGroup | null)[];
  joints: GPUBuffer | null;
  counts: Int32Array;
  seen: boolean;
}

/**
 * The directional shadow's SkinnedMesh casters. Each render group of one
 * skinned pass becomes one instanced draw per cascade, holding only the meshes
 * whose bounds reach that cascade.
 */
export class SkinnedShadowCasters {
  private readonly batches = new Map<
    SkinnedInstancedPass,
    SkinnedShadowBatch
  >();
  private readonly uniforms = new Float32Array(UNIFORM_FLOATS);

  /**
   * Writes every cascade's draw list and uniforms. Call before the shadow pass
   * opens, with the cascades this frame draws in `drawMask`.
   */
  prepare(
    renderer: Renderer,
    renderList: IRenderGroup[],
    lightVPs: readonly Matrix4[],
    drawMask: number,
    cascadeMask: (mesh: IVisualComponent) => number,
    layout: GPUBindGroupLayout
  ): void {
    for (const batch of this.batches.values()) batch.seen = false;

    for (let i = 0, l = renderList.length; i < l; i++) {
      const item = renderList[i];
      const pass = item.pass;
      if (!isSkinnedInstancedPass(pass)) continue;

      const batch = this.batchFor(renderer, pass, item.meshes.length);
      batch.seen = true;
      batch.counts.fill(0);
      const model = pass.model;
      if (!model || !model.prepareJoints(renderer)) continue;

      const { meshes } = item;
      for (let m = 0, ml = meshes.length; m < ml; m++) {
        const mask = cascadeMask(meshes[m]) & drawMask;
        for (let c = 0; c < CASCADES; c++)
          if (mask & (1 << c))
            writeSkinnedInstance(
              meshes[m],
              batch.data[c],
              batch.slots[c],
              batch.counts[c]++
            );
      }

      const joints = model.jointBuffer!;
      if (batch.joints !== joints) {
        batch.joints = joints;
        batch.bindGroups.fill(null);
      }

      const { queue } = renderer.device;
      const uniforms = this.uniforms;
      uniforms[16] = model.poses.jointCount;

      for (let c = 0; c < CASCADES; c++) {
        const count = batch.counts[c];
        if (count === 0) continue;

        queue.writeBuffer(
          batch.instanceBuffers[c],
          0,
          batch.data[c],
          0,
          count * SKINNED_INSTANCE_FLOATS
        );
        uniforms.set(lightVPs[c].elements, 0);
        queue.writeBuffer(batch.uniformBuffers[c], 0, uniforms);

        batch.bindGroups[c] ??= renderer.device.createBindGroup({
          label: 'shadow skinned bind group',
          layout,
          entries: [
            { binding: 0, resource: { buffer: batch.uniformBuffers[c] } },
            { binding: 1, resource: { buffer: batch.instanceBuffers[c] } },
            { binding: 2, resource: { buffer: joints } },
          ],
        });
      }
    }

    for (const [pass, batch] of this.batches)
      if (!batch.seen) {
        destroyBatch(batch);
        this.batches.delete(pass);
      }
  }

  /** How many of the pass's meshes cascade `c` draws. */
  count(pass: SkinnedInstancedPass, cascade: number): number {
    return this.batches.get(pass)?.counts[cascade] ?? 0;
  }

  bindGroup(pass: SkinnedInstancedPass, cascade: number): GPUBindGroup | null {
    return this.batches.get(pass)?.bindGroups[cascade] ?? null;
  }

  dispose(): void {
    for (const batch of this.batches.values()) destroyBatch(batch);
    this.batches.clear();
  }

  private batchFor(
    renderer: Renderer,
    pass: SkinnedInstancedPass,
    meshCount: number
  ): SkinnedShadowBatch {
    const existing = this.batches.get(pass);
    if (existing && existing.capacity >= meshCount) return existing;
    if (existing) destroyBatch(existing);

    const { device } = renderer;
    const capacity = Math.max(8, 1 << Math.ceil(Math.log2(meshCount)));
    const data: Float32Array<ArrayBuffer>[] = [];
    const slots: Uint32Array[] = [];
    const instanceBuffers: GPUBuffer[] = [];
    const uniformBuffers: GPUBuffer[] = [];

    for (let c = 0; c < CASCADES; c++) {
      const floats = new Float32Array(capacity * SKINNED_INSTANCE_FLOATS);
      data.push(floats);
      slots.push(new Uint32Array(floats.buffer));
      instanceBuffers.push(
        device.createBuffer({
          label: 'shadow skinned instances',
          size: floats.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        })
      );
      uniformBuffers.push(
        device.createBuffer({
          label: 'shadow skinned uniforms',
          size: UNIFORM_FLOATS * 4,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
      );
    }

    const batch: SkinnedShadowBatch = {
      capacity,
      data,
      slots,
      instanceBuffers,
      uniformBuffers,
      bindGroups: [null, null, null],
      joints: null,
      counts: new Int32Array(CASCADES),
      seen: true,
    };
    this.batches.set(pass, batch);
    return batch;
  }
}

function destroyBatch(batch: SkinnedShadowBatch): void {
  for (const buffer of batch.instanceBuffers) buffer.destroy();
  for (const buffer of batch.uniformBuffers) buffer.destroy();
}
