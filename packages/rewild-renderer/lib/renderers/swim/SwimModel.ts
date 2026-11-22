import { Matrix4, Quaternion, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { GltfModel, GltfNode } from '../../core/GltfLoader';
import { Geometry } from '../../geometry/Geometry';
import { SwimInstancedPass } from '../../materials/SwimInstancedPass';
import { createStandardPass } from '../../managers/MaterialManager';

/** One drawable piece of a swim model. */
export interface SwimPrimitive {
  geometry: Geometry;
  pass: SwimInstancedPass;
  nodeMatrix: Float32Array<ArrayBuffer>;
}

/** Where the body lies along model Z, after each primitive's node matrix. */
export interface SwimBody {
  /** Z of the nose, the furthest point forward. */
  nose: number;
  /** Metres from the nose to the tail tip. */
  length: number;
  /** Where along the body, 0 at the nose and 1 at the tail, the model origin
   *  lies. A curve turns the body about it. */
  pivot: number;
  /** Furthest any vertex lies from the origin. */
  radius: number;
}

const _position = new Vector3();
const _rotation = new Quaternion();
const _scale = new Vector3();
const _matrix = new Matrix4();

/**
 * A static glTF model drawn by SwimInstancedPass, shared by every batch of it.
 * Passes are per primitive, so every batch of one model groups into one
 * pipeline bind.
 */
export class SwimModel {
  readonly primitives: SwimPrimitive[] = [];
  readonly body: SwimBody;
  /** Batches holding it. */
  users = 0;

  constructor(renderer: Renderer, modelId: string, model: GltfModel) {
    for (const root of model.roots) this.collect(renderer, modelId, root, null);
    if (this.primitives.length === 0)
      throw new Error(`Swim model '${modelId}' has no drawable primitives.`);
    this.body = measureBody(this.primitives);
    if (this.body.length <= 0)
      throw new Error(`Swim model '${modelId}' has no length along Z.`);
  }

  dispose(): void {
    for (const primitive of this.primitives) primitive.pass.dispose();
    this.primitives.length = 0;
  }

  private collect(
    renderer: Renderer,
    modelId: string,
    node: GltfNode,
    parent: Float32Array<ArrayBuffer> | null
  ): void {
    const nodeMatrix = composeNode(node, parent, modelId);

    for (const primitive of node.primitives) {
      const template = renderer.materialManager.standardTemplate(
        primitive.materialKey
      );
      if (!template)
        throw new Error(
          `Swim model '${modelId}' primitive has no material template for '${primitive.materialKey}'.`
        );
      const pass = createStandardPass(
        renderer,
        template,
        'standard-swim'
      ) as SwimInstancedPass;
      const sampler = (template as { sampler?: GPUSamplerDescriptor }).sampler;
      if (sampler)
        pass.material.sampler = renderer.samplerManager.getOrCreate(
          renderer.device,
          sampler
        );
      if (primitive.authoredNormals) pass.authoredNormals = true;
      if (primitive.geometry.colors) pass.finMask = true;
      this.primitives.push({ geometry: primitive.geometry, pass, nodeMatrix });
    }

    for (const child of node.children)
      this.collect(renderer, modelId, child, nodeMatrix);
  }
}

/** Builds each model once and frees it when no batch holds it. */
export class SwimModelManager {
  private readonly models = new Map<string, SwimModel>();

  acquire(renderer: Renderer, modelId: string): SwimModel {
    let model = this.models.get(modelId);
    if (!model) {
      model = new SwimModel(
        renderer,
        modelId,
        renderer.geometryManager.getModel(modelId)
      );
      this.models.set(modelId, model);
    }
    model.users++;
    return model;
  }

  release(modelId: string): void {
    const model = this.models.get(modelId);
    if (!model || --model.users > 0) return;
    model.dispose();
    this.models.delete(modelId);
  }

  dispose(): void {
    for (const model of this.models.values()) model.dispose();
    this.models.clear();
  }
}

/** The body's extent along Z over every primitive, in model space. */
export function measureBody(
  primitives: readonly {
    geometry: { vertices: Float32Array };
    nodeMatrix: Float32Array;
  }[]
): SwimBody {
  let front = -Infinity;
  let back = Infinity;
  let radius = 0;
  for (const { geometry, nodeMatrix: m } of primitives) {
    const v = geometry.vertices;
    for (let i = 0; i < v.length; i += 3) {
      const x = v[i];
      const y = v[i + 1];
      const z = v[i + 2];
      const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
      if (wz > front) front = wz;
      if (wz < back) back = wz;
      const r = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (r > radius) radius = r;
    }
  }
  const length = front - back;
  const pivot = length > 0 ? Math.max(0, Math.min(1, front / length)) : 0;
  return { nose: front, length, pivot, radius };
}

function composeNode(
  node: GltfNode,
  parent: Float32Array<ArrayBuffer> | null,
  modelId: string
): Float32Array<ArrayBuffer> {
  const [sx, sy, sz] = node.scale;
  if (Math.abs(sx - sy) > 1e-4 || Math.abs(sx - sz) > 1e-4)
    throw new Error(
      `Swim model '${modelId}' has a node scaled non-uniformly (${sx}, ${sy}, ${sz}).`
    );
  const [tx, ty, tz] = node.translation;
  const [qx, qy, qz, qw] = node.rotation;
  _matrix.compose(
    _position.set(tx, ty, tz),
    _rotation.set(qx, qy, qz, qw),
    _scale.set(sx, sy, sz)
  );
  const local = new Float32Array(_matrix.elements);
  if (!parent) return local;
  const world = new Float32Array(16);
  Matrix4.multiplyMatricesFlat(world, 0, parent, 0, local, 0);
  return world;
}
