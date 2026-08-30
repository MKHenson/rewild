import {
  GltfModel,
  collectGeometries,
  loadGltfModel,
} from '../core/GltfLoader';
import { BoxGeometryFactory } from '../geometry/BoxGeometryFactory';
import { CapsuleGeometryFactory } from '../geometry/CapsuleGeometryFactory';
import { ConeGeometryFactory } from '../geometry/ConeGeometryFactory';
import { CylinderGeometryFactory } from '../geometry/CylinderGeometryFactory';
import { Geometry } from '../geometry/Geometry';
import { GUIGeometryFactory } from '../geometry/GUIGeometryFactory';
import { PlaneGeometryFactory } from '../geometry/PlaneGeometryFactory';
import { SphereGeometryFactory } from '../geometry/SphereGeometryFactory';
import { Renderer } from '../Renderer';
import { validateScatterLayers } from '../renderers/terrain/ScatterLayers';
import { IGeometryTemplates } from './types';

export class GeometryManager {
  geometries: Map<string, Geometry>;
  /**
   * Imported models, keyed the same way as geometries. A glTF entry lands here
   * and not in `geometries`, because a model is a hierarchy of meshes and
   * collapsing it to one geometry would discard every node transform and every
   * material but the first. Instantiate it with `instantiateGltfModel`.
   */
  models: Map<string, GltfModel>;
  /**
   * Coarser stand-ins for an imported model, nearest first, under the same id
   * as `models`
   */
  modelLods: Map<string, GltfModel[]>;
  initialized: boolean;

  constructor() {
    this.geometries = new Map();
    this.models = new Map();
    this.modelLods = new Map();
    this.initialized = false;
  }

  get(id: string) {
    const toRet = this.geometries.get(id);
    if (!toRet)
      throw new Error(
        this.models.has(id)
          ? `Geometry id ${id} is an imported model — use getModel(${id}) instead`
          : `Could not find geometry with id ${id}`
      );
    return toRet;
  }

  getModel(id: string) {
    const toRet = this.models.get(id);
    if (!toRet) throw new Error(`Could not find model with id ${id}`);
    return toRet;
  }

  /** A model's coarser tiers, nearest first. Empty when it has no chain. */
  getModelLods(id: string): GltfModel[] {
    return this.modelLods.get(id) ?? [];
  }

  async initialize(renderer: Renderer) {
    if (this.initialized) return;
    const { device } = renderer;

    const geometriesToLoad = (await fetch('/templates/geometries.json').then(
      (res) => res.json()
    )) as IGeometryTemplates;

    this.addGeometry('box', BoxGeometryFactory.new());
    this.addGeometry('capsule', CapsuleGeometryFactory.new());
    this.addGeometry('cone', ConeGeometryFactory.new());
    this.addGeometry('cylinder', CylinderGeometryFactory.new());
    this.addGeometry('sphere', SphereGeometryFactory.new());
    this.addGeometry('plane', PlaneGeometryFactory.new());
    this.addGeometry('sprite-quad', PlaneGeometryFactory.new(1, 1));
    this.addGeometry('gui-quad', GUIGeometryFactory.new());

    for (const key in geometriesToLoad) {
      const geometryTemplate = geometriesToLoad[key];
      if (geometryTemplate.type === 'gltf') {
        this.models.set(
          key,
          await this.loadModel(renderer, geometryTemplate.url)
        );

        const lodUrls = geometryTemplate.lods;
        if (lodUrls?.length) {
          const lods: GltfModel[] = [];
          for (const url of lodUrls)
            lods.push(await this.loadModel(renderer, url));
          this.modelLods.set(key, lods);
        }
      }
    }

    // Before anything scatters, so a layer naming a missing model fails at
    // startup rather than as an empty chunk.
    validateScatterLayers(this.lodCounts());

    await Promise.all(
      this.allGeometries().map((geometry) => {
        return geometry.build(
          device,
          renderer.bvhConfig,
          renderer.bvhWorkerManager ?? undefined
        );
      })
    );

    this.initialized = true;
  }

  dispose() {
    this.allGeometries().forEach((geometry) => {
      geometry.dispose();
    });

    this.geometries.clear();
    this.models.clear();
    this.modelLods.clear();
    this.initialized = false;
  }

  /** Every imported model, its LOD tiers included. A tier carries its own
   *  materials and textures, so anything walking imports has to see them. */
  allModels(): GltfModel[] {
    const models = Array.from(this.models.values());
    for (const lods of this.modelLods.values()) models.push(...lods);
    return models;
  }

  /** Standalone geometries plus every geometry owned by an imported model. */
  private allGeometries(): Geometry[] {
    const geometries = Array.from(this.geometries.values());
    for (const model of this.allModels())
      geometries.push(...collectGeometries(model));

    return geometries;
  }

  /** Every geometry id, mapped to how many LOD tiers it carries. */
  private lodCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const id of this.geometries.keys()) counts.set(id, 0);
    for (const id of this.models.keys())
      counts.set(id, this.modelLods.get(id)?.length ?? 0);
    return counts;
  }

  /** Loads one glTF and its textures. Textures are pulled here rather than in
   *  the loader so the loader stays a pure parse. */
  private async loadModel(renderer: Renderer, url: string) {
    const model = await loadGltfModel(process.env.SHARED_ASSETS_BASE_URL + url);
    await renderer.textureManager.loadGltfTextures(renderer, model.textures);
    return model;
  }

  addGeometry(id: string, geometry: Geometry): Geometry {
    this.geometries.set(id, geometry);
    return geometry;
  }
}
