import { Renderer } from '../..';
import { GltfNode } from '../../core/GltfLoader';
import { Geometry } from '../../geometry/Geometry';
import { ScatterInstancedPass } from '../../materials/ScatterInstancedPass';
import { createStandardPass } from '../../managers/MaterialManager';
import { getScatterLayer } from './ScatterLayers';
import { composeNodeMatrix } from './ScatterChunkLayer';

/** One drawable piece of a scatter layer's model: a geometry, the pass that
 *  shades it, and where the piece sits within the model. */
export interface ScatterPrimitive {
  geometry: Geometry;
  pass: ScatterInstancedPass;
  nodeMatrix: Float32Array<ArrayBuffer>;
}

/**
 * The primitives a scatter layer draws, built once and shared by every chunk
 * that grows the layer.
 *
 * A pass is per (layer, primitive material) rather than per chunk, which is what
 * makes the renderer's existing grouping collapse every chunk of a layer into
 * one group and therefore one pipeline bind for the lot.
 */
export class ScatterModels {
  private primitives = new Map<string, ScatterPrimitive[]>();

  get(renderer: Renderer, layerName: string): ScatterPrimitive[] {
    const existing = this.primitives.get(layerName);
    if (existing) return existing;

    const layer = getScatterLayer(layerName);
    const model = renderer.geometryManager.getModel(layer.geometryId);

    const built: ScatterPrimitive[] = [];
    for (const root of model.roots)
      collectPrimitives(
        renderer,
        layerName,
        layer.materialId,
        root,
        null,
        built
      );

    if (built.length === 0)
      throw new Error(
        `Scatter layer '${layerName}' model '${layer.geometryId}' has no drawable primitives.`
      );

    this.primitives.set(layerName, built);
    return built;
  }

  dispose(): void {
    for (const primitives of this.primitives.values())
      for (const primitive of primitives) primitive.pass.dispose();
    this.primitives.clear();
  }
}

function collectPrimitives(
  renderer: Renderer,
  layerName: string,
  materialId: string | undefined,
  node: GltfNode,
  parent: Float32Array<ArrayBuffer> | null,
  out: ScatterPrimitive[]
): void {
  const nodeMatrix = composeNodeMatrix(
    node.translation,
    node.rotation,
    node.scale,
    parent,
    layerName
  );

  for (const primitive of node.primitives) {
    // The material manager holds the per-mesh pass built from the same
    // template; scatter needs its own pipeline, so the template is rebuilt
    // rather than the pass reused.
    const templateName = materialId ?? primitive.materialKey;
    const template = renderer.materialManager.standardTemplate(templateName);
    if (!template)
      throw new Error(
        materialId
          ? `Scatter layer '${layerName}' names material '${materialId}', which is not a standard material in templates/materials.json.`
          : `Scatter layer '${layerName}' primitive has no material template for '${primitive.materialKey}'.`
      );

    const pass = createStandardPass(
      renderer,
      template,
      'standard-scatter'
    ) as ScatterInstancedPass;
    // Only an imported material carries a sampler; a materials.json entry
    // leaves StandardMaterial on its default.
    const sampler = (template as { sampler?: GPUSamplerDescriptor }).sampler;
    if (sampler)
      pass.material.sampler = renderer.samplerManager.getOrCreate(
        renderer.device,
        sampler
      );

    out.push({ geometry: primitive.geometry, pass, nodeMatrix });
  }

  for (const child of node.children)
    collectPrimitives(renderer, layerName, materialId, child, nodeMatrix, out);
}
