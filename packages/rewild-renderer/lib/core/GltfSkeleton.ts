import { Matrix4, Quaternion, Vector3 } from 'rewild-common';
import type {
  GLTFNodePostprocessed,
  GLTFPostprocessed,
} from '@loaders.gl/gltf';

type GLTFSkinPostprocessed = NonNullable<GLTFNodePostprocessed['skin']>;

/**
 * The joints a skinned model's vertices are bound to, in flat arrays indexed
 * by joint. Joints are ordered parent first, so a pose builds in one forward
 * pass. Instances of the model share it and own only their pose.
 */
export interface GltfSkeleton {
  names: string[];
  /** Parent joint index, or -1 for a root. Always lower than the joint's own. */
  parents: Int32Array;
  /** Rest pose, joint-local. 3 floats a joint. */
  translations: Float32Array;
  /** Rest pose, joint-local. Quaternion xyzw, 4 floats a joint. */
  rotations: Float32Array;
  /** Rest pose, joint-local. 3 floats a joint. */
  scales: Float32Array;
  /** 16 floats a joint, column-major. */
  inverseBindMatrices: Float32Array;
  /** Model-space transform of the root joints' parent (the armature), 16
   *  floats. Joints nested under non-joint nodes lose those nodes' transforms. */
  rootMatrix: Float32Array;
}

export type GltfClipPath = 'translation' | 'rotation' | 'scale';

export interface GltfClipChannel {
  joint: number;
  path: GltfClipPath;
  /** STEP holds each key until the next. CUBICSPLINE imports as LINEAR. */
  interpolation: 'LINEAR' | 'STEP';
  times: Float32Array;
  /** 4 floats a key for rotation, 3 otherwise. */
  values: Float32Array;
}

export interface GltfClip {
  name: string;
  /** Seconds, to the last key of any channel. */
  duration: number;
  channels: GltfClipChannel[];
}

/** The skeleton plus what the rest of the import needs to bind to it. */
export interface GltfSkin {
  skeleton: GltfSkeleton;
  /** The skin's node indices, in the order JOINTS_0 refers to them. */
  joints: number[];
  /** Skin joint index (what JOINTS_0 holds) to skeleton joint index. */
  jointRemap: Uint16Array;
  /** Node index to skeleton joint index. */
  jointByNode: Map<number, number>;
}

const _matrix = new Matrix4();
const _local = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();

export interface NodeTransform {
  translation: [number, number, number];
  /** Quaternion, xyzw. */
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

/** Node-local TRS. A node's matrix is decomposed, so callers handle one form. */
export function readTransform(node: GLTFNodePostprocessed): NodeTransform {
  if (node.matrix) {
    _matrix.fromArray(new Float32Array(node.matrix));
    _matrix.decompose(_position, _quaternion, _scale);

    return {
      translation: [_position.x, _position.y, _position.z],
      rotation: [_quaternion.x, _quaternion.y, _quaternion.z, _quaternion.w],
      scale: [_scale.x, _scale.y, _scale.z],
    };
  }

  return {
    translation: (node.translation as [number, number, number]) ?? [0, 0, 0],
    rotation: (node.rotation as [number, number, number, number]) ?? [
      0, 0, 0, 1,
    ],
    scale: (node.scale as [number, number, number]) ?? [1, 1, 1],
  };
}

/**
 * Normalized integer arrays (quantized rotations, u8/u16 weights) to floats in
 * the range the spec assigns them. Float arrays pass through.
 */
export function toFloat32(value: ArrayLike<number>): Float32Array {
  if (value instanceof Float32Array) return value;

  const scale =
    value instanceof Uint8Array
      ? 1 / 255
      : value instanceof Uint16Array
      ? 1 / 65535
      : value instanceof Int8Array
      ? 1 / 127
      : value instanceof Int16Array
      ? 1 / 32767
      : 1;
  const signed = value instanceof Int8Array || value instanceof Int16Array;

  const out = new Float32Array(value.length);
  for (let i = 0; i < value.length; i++)
    out[i] = signed ? Math.max(value[i] * scale, -1) : value[i] * scale;

  return out;
}

function parentIndices(
  nodes: GLTFNodePostprocessed[],
  indexOf: Map<GLTFNodePostprocessed, number>
): Int32Array {
  const parents = new Int32Array(nodes.length).fill(-1);
  nodes.forEach((node, i) => {
    for (const child of node.children ?? []) {
      const childIndex = indexOf.get(child);
      if (childIndex !== undefined) parents[childIndex] = i;
    }
  });

  return parents;
}

/** Model-space matrix of a node, from the root down. */
function worldMatrix(
  nodes: GLTFNodePostprocessed[],
  nodeParents: Int32Array,
  node: number,
  out: Matrix4
): Matrix4 {
  out.identity();
  for (let n = node; n !== -1; n = nodeParents[n]) {
    const { translation, rotation, scale } = readTransform(nodes[n]);
    _position.set(...translation);
    _quaternion.set(...rotation);
    _scale.set(...scale);
    out.premultiply(_local.compose(_position, _quaternion, _scale));
  }
  return out;
}

/**
 * Reads the file's first skin. A model has one skeleton; meshes bound to any
 * other skin load as static.
 */
export function parseSkin(gltf: GLTFPostprocessed): GltfSkin | null {
  const skin = gltf.skins?.[0];
  const nodes = gltf.nodes ?? [];
  if (!skin?.joints?.length) return null;

  const joints = skin.joints as number[];
  const isJoint = new Set(joints);
  const indexOf = new Map<GLTFNodePostprocessed, number>();
  nodes.forEach((node, i) => indexOf.set(node, i));
  const nodeParents = parentIndices(nodes, indexOf);

  // Walking the trees in order emits every joint after its ancestors.
  const order: number[] = [];
  const visit = (node: number) => {
    if (isJoint.has(node)) order.push(node);
    for (const child of nodes[node].children ?? []) visit(indexOf.get(child)!);
  };
  nodes.forEach((_, i) => nodeParents[i] === -1 && visit(i));

  const count = order.length;
  const jointByNode = new Map<number, number>();
  order.forEach((node, j) => jointByNode.set(node, j));

  const names: string[] = [];
  const parents = new Int32Array(count);
  const translations = new Float32Array(count * 3);
  const rotations = new Float32Array(count * 4);
  const scales = new Float32Array(count * 3);

  for (let j = 0; j < count; j++) {
    const node = nodes[order[j]];
    names.push(node.name ?? node.id);

    let parent = nodeParents[order[j]];
    while (parent !== -1 && !jointByNode.has(parent))
      parent = nodeParents[parent];
    parents[j] = parent === -1 ? -1 : jointByNode.get(parent)!;

    const { translation, rotation, scale } = readTransform(node);
    translations.set(translation, j * 3);
    rotations.set(rotation, j * 4);
    scales.set(scale, j * 3);
  }

  const jointRemap = new Uint16Array(joints.length);
  joints.forEach((node, slot) => (jointRemap[slot] = jointByNode.get(node)!));

  // A skin without inverse bind matrices means identity for every joint.
  const inverseBindMatrices = new Float32Array(count * 16);
  const source = skin.inverseBindMatrices?.value as Float32Array | undefined;
  for (let slot = 0; slot < joints.length; slot++) {
    const j = jointRemap[slot];
    if (source)
      inverseBindMatrices.set(
        source.subarray(slot * 16, slot * 16 + 16),
        j * 16
      );
    else _matrix.identity().toArray(inverseBindMatrices, j * 16);
  }

  const rootMatrix = new Float32Array(16);
  const armature = nodeParents[order[0]];
  if (armature === -1) _matrix.identity().toArray(rootMatrix);
  else worldMatrix(nodes, nodeParents, armature, _matrix).toArray(rootMatrix);

  return {
    skeleton: {
      names,
      parents,
      translations,
      rotations,
      scales,
      inverseBindMatrices,
      rootMatrix,
    },
    joints,
    jointRemap,
    jointByNode,
  };
}

/** Whether a node's skin is the one the skeleton was read from. */
export function bindsSkin(
  nodeSkin: GLTFSkinPostprocessed,
  skin: GltfSkin
): boolean {
  const joints = nodeSkin.joints as number[];
  return (
    joints.length === skin.joints.length &&
    joints.every((node, i) => node === skin.joints[i])
  );
}

/**
 * JOINTS_0 remapped to skeleton order, widened to u16, and WEIGHTS_0 as floats
 * that sum to 1. A vertex with no weight binds fully to its first joint.
 */
export function toSkinAttributes(
  joints: ArrayLike<number>,
  weights: ArrayLike<number>,
  jointRemap: Uint16Array
): { joints: Uint16Array; weights: Float32Array } {
  const outJoints = new Uint16Array(joints.length);
  for (let i = 0; i < joints.length; i++)
    outJoints[i] = jointRemap[joints[i]] ?? 0;

  const outWeights = new Float32Array(toFloat32(weights));
  for (let v = 0; v < outWeights.length; v += 4) {
    const sum =
      outWeights[v] + outWeights[v + 1] + outWeights[v + 2] + outWeights[v + 3];

    if (sum > 0) {
      for (let k = 0; k < 4; k++) outWeights[v + k] /= sum;
    } else {
      outWeights[v] = 1;
    }
  }

  return { joints: outJoints, weights: outWeights };
}

const PATHS: ReadonlySet<string> = new Set([
  'translation',
  'rotation',
  'scale',
]);

/**
 * Reads every animation that moves a joint. Channels on other nodes and morph
 * weights are dropped. CUBICSPLINE keeps its keyed values and drops tangents.
 */
export function parseClips(
  gltf: GLTFPostprocessed,
  skin: GltfSkin
): GltfClip[] {
  const accessors = gltf.accessors ?? [];
  const clips: GltfClip[] = [];

  (gltf.animations ?? []).forEach((animation, i) => {
    const channels: GltfClipChannel[] = [];
    let duration = 0;

    for (const channel of animation.channels) {
      const joint = skin.jointByNode.get(channel.target.node as number);
      const path = channel.target.path;
      if (joint === undefined || !PATHS.has(path)) continue;

      const sampler = animation.samplers[channel.sampler as number];
      const times = toFloat32(accessors[sampler.input as number].value);
      let values = toFloat32(accessors[sampler.output as number].value);
      const width = path === 'rotation' ? 4 : 3;

      if (sampler.interpolation === 'CUBICSPLINE') {
        const keyed = new Float32Array(times.length * width);
        for (let k = 0; k < times.length; k++)
          keyed.set(
            values.subarray((k * 3 + 1) * width, (k * 3 + 2) * width),
            k * width
          );
        values = keyed;
      }

      channels.push({
        joint,
        path: path as GltfClipPath,
        interpolation: sampler.interpolation === 'STEP' ? 'STEP' : 'LINEAR',
        times,
        values,
      });

      if (times.length) duration = Math.max(duration, times[times.length - 1]);
    }

    if (channels.length)
      clips.push({
        name: animation.name ?? `clip-${i}`,
        duration,
        channels,
      });
  });

  return clips;
}
