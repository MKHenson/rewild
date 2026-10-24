import { Box3, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { GltfModel, GltfNode, GltfPrimitive } from '../../core/GltfLoader';
import { Geometry } from '../../geometry/Geometry';
import { SkinnedInstancedPass } from '../../materials/SkinnedInstancedPass';
import { createStandardPass } from '../../managers/MaterialManager';
import { PoseStore } from './PoseStore';

const MATRIX_BYTES = 64;
const _corner = new Vector3();

/** One drawable part of a skinned model and the pass that draws it. */
export interface SkinnedPrimitive {
  geometry: Geometry;
  pass: SkinnedInstancedPass;
}

/**
 * What every SkinnedInstance of one glTF model shares: the poses, the joint
 * matrix buffer, and one pass per primitive. SkinnedModelManager creates and
 * frees these.
 */
export class SkinnedModel {
  readonly poses: PoseStore;
  readonly primitives: SkinnedPrimitive[] = [];
  /** Local bounds that hold the model however its joints bend: a cube of the
   *  bind pose's radius about the origin. */
  readonly localBounds = new Box3();
  jointBuffer: GPUBuffer | null = null;
  /** Changes when `jointBuffer` is replaced, so bind groups on it rebuild. */
  bufferRevision = 0;

  private bufferCapacity = 0;

  constructor(renderer: Renderer, model: GltfModel) {
    if (!model.skeleton) throw new Error('Skinned model has no skeleton.');

    const skinned: GltfPrimitive[] = [];
    for (const node of model.roots) collectSkinned(node, skinned);
    if (skinned.length === 0)
      throw new Error('Skinned model has no skinned primitives.');

    this.poses = new PoseStore(model.skeleton);

    const r = reach(skinned);
    this.localBounds.min.set(-r, -r, -r);
    this.localBounds.max.set(r, r, r);

    for (const primitive of skinned)
      this.primitives.push({
        geometry: primitive.geometry,
        pass: skinnedPass(renderer, primitive, this),
      });
  }

  /** Rebuilds changed joint matrices and uploads them. False while empty. */
  prepareJoints(renderer: Renderer): boolean {
    const { poses } = this;
    if (poses.count === 0) return false;

    const grew = this.ensureBuffer(renderer);
    poses.update();

    if (poses.jointsChanged || grew) {
      renderer.device.queue.writeBuffer(
        this.jointBuffer!,
        0,
        poses.jointMatrices,
        0,
        poses.count * poses.jointCount * 16
      );
      poses.jointsChanged = false;
    }

    return true;
  }

  dispose(): void {
    for (const { pass } of this.primitives) pass.dispose();
    this.jointBuffer?.destroy();
    this.jointBuffer = null;
  }

  /** Sizes the buffer to the pose capacity. True if it was replaced. */
  private ensureBuffer(renderer: Renderer): boolean {
    const { capacity, jointCount } = this.poses;
    if (this.jointBuffer && this.bufferCapacity >= capacity) return false;

    this.jointBuffer?.destroy();
    this.jointBuffer = renderer.device.createBuffer({
      label: 'skinned joint matrices',
      size: capacity * jointCount * MATRIX_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.bufferCapacity = capacity;
    this.bufferRevision++;
    return true;
  }
}

function collectSkinned(node: GltfNode, out: GltfPrimitive[]): void {
  for (const primitive of node.primitives)
    if (primitive.geometry.joints) out.push(primitive);
  for (const child of node.children) collectSkinned(child, out);
}

/** Bind-pose radius about the model origin over every skinned primitive. */
function reach(primitives: GltfPrimitive[]): number {
  let radius = 0;
  for (const { geometry } of primitives) {
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    for (let i = 0; i < 8; i++) {
      _corner.set(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      );
      radius = Math.max(radius, _corner.length());
    }
  }
  return radius;
}

function skinnedPass(
  renderer: Renderer,
  primitive: GltfPrimitive,
  model: SkinnedModel
): SkinnedInstancedPass {
  const template = renderer.materialManager.standardTemplate(
    primitive.materialKey
  );
  if (!template)
    throw new Error(
      `Skinned primitive has no material template for '${primitive.materialKey}'.`
    );

  const pass = createStandardPass(
    renderer,
    template,
    'standard-skinned'
  ) as SkinnedInstancedPass;
  pass.model = model;

  const sampler = (template as { sampler?: GPUSamplerDescriptor }).sampler;
  if (sampler)
    pass.material.sampler = renderer.samplerManager.getOrCreate(
      renderer.device,
      sampler
    );

  return pass;
}
