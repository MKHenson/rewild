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
  initialized: boolean;

  constructor() {
    this.geometries = new Map();
    this.models = new Map();
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
        const model = await loadGltfModel(
          process.env.SHARED_ASSETS_BASE_URL + geometryTemplate.url
        );

        // Here rather than in the loader so the loader stays a pure parse. The
        // manager already runs after the texture library and before materials
        // are built, which is exactly the window an imported texture needs.
        await renderer.textureManager.loadGltfTextures(
          renderer,
          model.textures
        );
        this.models.set(key, model);
      }
    }

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
    this.initialized = false;
  }

  /** Standalone geometries plus every geometry owned by an imported model. */
  private allGeometries(): Geometry[] {
    const geometries = Array.from(this.geometries.values());
    for (const model of this.models.values())
      geometries.push(...collectGeometries(model));

    return geometries;
  }

  addGeometry(id: string, geometry: Geometry): Geometry {
    this.geometries.set(id, geometry);
    return geometry;
  }
}
