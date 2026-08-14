import { Matrix4, Quaternion, Vector3 } from 'rewild-common';
import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from '../materials/IMaterialPass';
import { Mesh } from './Mesh';
import { Transform } from './Transform';
import { load } from '@loaders.gl/core';
import { GLTFLoader, postProcessGLTF } from '@loaders.gl/gltf';
import type {
  GLTFMeshPrimitivePostprocessed,
  GLTFNodePostprocessed,
  GLTFPostprocessed,
} from '@loaders.gl/gltf';
import { GltfTextureRequest, collectGltfTextures } from './GltfTextures';
import {
  DEFAULT_MATERIAL_ID,
  GltfMaterialTemplate,
  materialKeysById,
  toMaterialTemplates,
} from './GltfMaterials';

// glTF's TRIANGLES mode. Points, lines and strips load fine but none of the
// engine's pipelines rasterize them, so they are skipped rather than uploaded
// as triangles — which would draw the primitive as garbage.
const GLTF_MODE_TRIANGLES = 4;

/**
 * One drawable piece of a node's mesh. glTF splits a mesh into primitives
 * precisely because each one takes a single material, so a primitive is the
 * finest unit that can become a Mesh.
 */
export interface GltfPrimitive {
  geometry: Geometry;
  materialName: string | null;
  materialKey: string;
}

/**
 * A node in the imported hierarchy, carrying its transform relative to its
 * parent.
 *
 * The transform stays on the node instead of being baked into the vertices so
 * the hierarchy survives import — a wheel keeps its own origin to spin about,
 * and two nodes referencing one mesh keep sharing a single geometry.
 */
export interface GltfNode {
  name: string;
  /** Node-local TRS. glTF lets a node carry either a matrix or TRS; a matrix is
   *  decomposed at parse time so instantiation has one form to handle. */
  translation: [number, number, number];
  /** Quaternion, xyzw — glTF's own order. */
  rotation: [number, number, number, number];
  scale: [number, number, number];
  primitives: GltfPrimitive[];
  children: GltfNode[];
}

export interface GltfModel {
  /** Root nodes of the default scene. */
  roots: GltfNode[];
  /** Every image the file's materials bind, for the texture manager to load. */
  textures: GltfTextureRequest[];
  materials: GltfMaterialTemplate[];
}

/** Resolves a primitive to the pass that draws it. Called once per primitive. */
export type MaterialResolver = (primitive: GltfPrimitive) => IMaterialPass;

const _matrix = new Matrix4();
const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();

/**
 * glTF writes COLOR_0 as vec3 or vec4, in floats or normalized u8/u16 — six
 * combinations. Collapsing them to float RGBA here means the vertex buffer has
 * one layout and the shader has one path; a vec3 accessor gains alpha 1, which
 * is what the spec says it means.
 *
 * The component type is read off the array rather than the accessor's
 * `normalized` flag because glTF only permits the integer types *as*
 * normalized, so the array itself already says everything needed.
 */
function toFloatRgba(
  value: ArrayLike<number>,
  components: number
): Float32Array {
  const scale =
    value instanceof Uint8Array
      ? 1 / 255
      : value instanceof Uint16Array
      ? 1 / 65535
      : 1;

  const count = (value.length / components) | 0;
  const out = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const src = i * components;
    const dst = i * 4;
    out[dst] = value[src] * scale;
    out[dst + 1] = value[src + 1] * scale;
    out[dst + 2] = value[src + 2] * scale;
    out[dst + 3] = components === 4 ? value[src + 3] * scale : 1;
  }

  return out;
}

/**
 * glTF writes TANGENT as vec4 floats — xyz plus a handedness w of +1 or -1 —
 * and that is what Geometry stores. An exporter that wrote vec3 (a few do, and
 * the spec does not allow it) is taken at its word and given the right-handed
 * default, which is what its bitangent would have been anyway.
 */
function toFloatTangent(
  value: ArrayLike<number>,
  components: number
): Float32Array {
  if (components === 4)
    return value instanceof Float32Array ? value : new Float32Array(value);

  const count = (value.length / components) | 0;
  const out = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    out[i * 4] = value[i * components];
    out[i * 4 + 1] = value[i * components + 1];
    out[i * 4 + 2] = value[i * components + 2];
    out[i * 4 + 3] = 1;
  }

  return out;
}

/** Returns null for anything the engine cannot draw, so the caller can skip it. */
function toGeometry(
  primitive: GLTFMeshPrimitivePostprocessed
): Geometry | null {
  if ((primitive.mode ?? GLTF_MODE_TRIANGLES) !== GLTF_MODE_TRIANGLES)
    return null;

  const attributes = primitive.attributes;
  const position = attributes.POSITION;
  if (!position) return null;

  const geometry = new Geometry();
  geometry.vertices = position.value as Float32Array;
  geometry.normals = attributes.NORMAL?.value as Float32Array;
  geometry.uvs = attributes.TEXCOORD_0?.value as Float32Array;

  // Widened to u32 whatever the accessor used, because Geometry uploads one
  // index format. A non-indexed primitive leaves this undefined, which build()
  // already reads as "draw the vertices in order".
  if (primitive.indices)
    geometry.indices = new Uint32Array(primitive.indices.value);

  // Only the standard material reads this, and only with vertexColors set —
  // carrying it costs a buffer that nothing else binds.
  const color = attributes.COLOR_0;
  if (color) geometry.colors = toFloatRgba(color.value, color.components);

  // If normals were not provided, compute simple vertex normals
  if (!attributes.NORMAL) geometry.computeNormals();

  // A normal map is authored against a tangent frame, so a model without one
  // can only be shaded through a screen-space approximation of it — which is
  // what mirrored UVs and hard seams show up wrong in.
  //
  // glTF asks for tangents to be derived only where the *material* has a normal
  // texture. That test is not enough here, because a template may override an
  // imported material with a normal-mapped one of its own. The test is
  // therefore "could this ever need one" — UVs and normals — at a cost of one
  // pass over the triangles at load and 16 bytes a vertex.
  const tangents = attributes.TANGENT;
  if (tangents)
    geometry.tangents = toFloatTangent(tangents.value, tangents.components);
  else if (geometry.uvs && geometry.normals) geometry.computeTangents();

  // Compute bounds for culling/picking
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  geometry.requiresBuild = true;
  return geometry;
}

/** Loads a glTF/GLB from a url and parses it. */
export async function loadGltfModel(url: string): Promise<GltfModel> {
  // Images are left encoded: the engine decodes them itself so that embedded
  // and file-backed textures take the same path, and so an embedded image can
  // be identified by its bytes. See collectGltfTextures.
  const gltf = await load(url, GLTFLoader, { gltf: { loadImages: false } });
  return parseGltf(postProcessGLTF(gltf), url);
}

function readTransform(
  node: GLTFNodePostprocessed
): Pick<GltfNode, 'translation' | 'rotation' | 'scale'> {
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

function parseNode(
  node: GLTFNodePostprocessed,
  materialKeys: Map<string, string>
): GltfNode {
  const primitives: GltfPrimitive[] = [];

  for (const primitive of node.mesh?.primitives ?? []) {
    const geometry = toGeometry(primitive);
    if (!geometry) continue;

    primitives.push({
      geometry,
      materialName: primitive.material?.name ?? primitive.material?.id ?? null,
      materialKey:
        (primitive.material && materialKeys.get(primitive.material.id)) ??
        materialKeys.get(DEFAULT_MATERIAL_ID)!,
    });
  }

  return {
    name: node.name ?? node.id,
    ...readTransform(node),
    primitives,
    children: (node.children ?? []).map((child) =>
      parseNode(child, materialKeys)
    ),
  };
}

function sceneRoots(gltf: GLTFPostprocessed): GLTFNodePostprocessed[] {
  const scene = gltf.scene ?? gltf.scenes?.[0];
  if (scene?.nodes) return scene.nodes;

  // A glTF need not declare a scene. Walking the flat node list would re-add
  // every child as a root, so take only the nodes nothing else parents.
  const children = new Set<GLTFNodePostprocessed>();
  for (const node of gltf.nodes ?? [])
    for (const child of node.children ?? []) children.add(child);

  return (gltf.nodes ?? []).filter((node) => !children.has(node));
}

/**
 * Turns a post-processed glTF into geometries, the hierarchy that positions
 * them, and the materials and textures they are drawn with. Split from the
 * fetch so the walk can be exercised against a structure rather than a file.
 *
 * `baseUrl` is the model's own url, needed only to resolve image URIs that are
 * relative to it.
 */
export function parseGltf(
  gltf: GLTFPostprocessed,
  baseUrl?: string
): GltfModel {
  const { textures, materials: materialTextures } = collectGltfTextures(
    gltf,
    baseUrl
  );
  const materials = toMaterialTemplates(gltf, materialTextures);
  const materialKeys = materialKeysById(materials);

  return {
    roots: sceneRoots(gltf).map((node) => parseNode(node, materialKeys)),
    textures,
    materials,
  };
}

/** Every geometry the model owns, for buffer upload and disposal. */
export function collectGeometries(model: GltfModel): Geometry[] {
  const geometries: Geometry[] = [];

  const visit = (node: GltfNode) => {
    for (const primitive of node.primitives)
      geometries.push(primitive.geometry);
    for (const child of node.children) visit(child);
  };

  for (const root of model.roots) visit(root);
  return geometries;
}

function instantiateNode(
  node: GltfNode,
  resolveMaterial: MaterialResolver
): Transform {
  // A single-primitive node puts its mesh on the node's own transform rather
  // than under a child, so the common case imports at the same depth it was
  // authored. Only a multi-material node needs a level per primitive, because a
  // transform carries one component.
  const transform =
    node.primitives.length === 1
      ? new Mesh(
          node.primitives[0].geometry,
          resolveMaterial(node.primitives[0])
        ).transform
      : new Transform();

  transform.name = node.name;
  transform.position.set(...node.translation);
  transform.quaternion.set(...node.rotation);
  transform.scale.set(...node.scale);

  if (node.primitives.length > 1) {
    for (let i = 0; i < node.primitives.length; i++) {
      const primitive = node.primitives[i];
      const mesh = new Mesh(primitive.geometry, resolveMaterial(primitive));
      mesh.transform.name = `${node.name}[${i}]`;
      transform.addChild(mesh.transform);
    }
  }

  for (const child of node.children)
    transform.addChild(instantiateNode(child, resolveMaterial));

  return transform;
}

/**
 * Builds a transform tree of meshes from a parsed model. Geometries are shared
 * with the model rather than copied, so instantiating twice costs two transform
 * trees and no extra vertex data.
 */
export function instantiateGltfModel(
  model: GltfModel,
  resolveMaterial: MaterialResolver
): Transform {
  // A single-root model becomes that root, so the usual one-mesh import gains
  // no wrapper. Several roots need one to hang from.
  if (model.roots.length === 1)
    return instantiateNode(model.roots[0], resolveMaterial);

  const root = new Transform();
  for (const node of model.roots)
    root.addChild(instantiateNode(node, resolveMaterial));

  return root;
}
