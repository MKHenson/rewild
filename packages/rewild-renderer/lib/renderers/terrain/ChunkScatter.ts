import { Box3, Vector3 } from 'rewild-common';
import { Renderer } from '../..';
import { Transform } from '../../core/Transform';
import { ScatterInstances } from './Scatter';
import { ScatterChunkLayer } from './ScatterChunkLayer';
import { ScatterModels } from './ScatterModels';
import { getScatterLayer } from './ScatterLayers';

const _bounds = new Box3();

/**
 * A chunk's scatter: one ScatterChunkLayer per (layer, model primitive), hung
 * under the chunk's transform so they inherit its position and its visibility.
 *
 * Built once from the worker's instance lists and left alone — the GPU buffers
 * are uploaded on the first draw and never rewritten, which is what the
 * per-instance transform format exists to allow.
 */
export class ChunkScatter {
  private layers: ScatterChunkLayer[] = [];
  private root: Transform;
  // What the last visibility pass measured against, so the debug commands
  // report the distance the cull actually used rather than a fresh one.
  private lastViewerPosition = new Vector3();

  constructor(chunkTransform: Transform) {
    this.root = new Transform();
    this.root.name = 'scatter';
    chunkTransform.addChild(this.root);
  }

  build(
    renderer: Renderer,
    models: ScatterModels,
    instances: ScatterInstances[]
  ): void {
    this.clear();

    for (const layerInstances of instances) {
      if (layerInstances.count === 0) continue;

      const cullDistance = getScatterLayer(layerInstances.layer).cullDistance;

      for (const primitive of models.get(renderer, layerInstances.layer)) {
        const transform = new Transform();
        transform.name = `${layerInstances.layer}`;
        this.root.addChild(transform);

        this.layers.push(
          new ScatterChunkLayer(
            transform,
            primitive.geometry,
            primitive.pass,
            primitive.nodeMatrix,
            layerInstances,
            cullDistance
          )
        );
      }
    }
  }

  /**
   * Drops each layer beyond its own draw range.
   *
   * Measured against the layer's own instance bounds rather than the chunk's,
   * because TerrainChunk.bounds is a flat footprint at y = 0 — against that, a
   * camera 80m up is 80m from a rock at its feet, and anything with a range
   * under the camera's height culls while still in plain view.
   *
   * Still per chunk rather than per instance
   */
  updateVisibility(viewerPosition: Vector3): void {
    this.lastViewerPosition.copy(viewerPosition);
    const origin = this.root.parent?.position;

    for (const layer of this.layers) {
      _bounds.copy(layer.localBounds);
      if (origin) _bounds.translate(origin);

      // The component's flag, never the transform's: SceneBVH.collectObjects
      // treats transform.visible as *membership* and only rebuilds on a
      // structure change, so hiding a transform drops it from the tree and
      // showing it again does not put it back. organizeVisuals skips a
      // component whose own `visible` is false, which is the culling this wants.
      layer.visible =
        _bounds.distanceToPoint(viewerPosition) <= layer.cullDistance;
    }
  }

  /** Every layer this chunk holds, for the scatter debug commands. */
  describe(): {
    layer: string;
    instances: number;
    visible: boolean;
    cullDistance: number;
    distance: number;
  }[] {
    const origin = this.root.parent?.position;

    return this.layers.map((layer) => {
      _bounds.copy(layer.localBounds);
      if (origin) _bounds.translate(origin);

      return {
        layer: layer.transform.name,
        instances: layer.instanceCount,
        visible: layer.visible,
        cullDistance: layer.cullDistance,
        distance: _bounds.distanceToPoint(this.lastViewerPosition),
      };
    });
  }

  clear(): void {
    for (const layer of this.layers) {
      layer.dispose();
      layer.transform.removeFromParent();
    }
    this.layers.length = 0;
  }

  dispose(): void {
    this.clear();
    this.root.removeFromParent();
  }
}
