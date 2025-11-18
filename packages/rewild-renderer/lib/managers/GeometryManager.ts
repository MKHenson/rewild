import { BoxGeometryFactory } from '../geometry/BoxGeometryFactory';
import { CapsuleGeometryFactory } from '../geometry/CapsuleGeometryFactory';
import { Geometry } from '../geometry/Geometry';
import { PlaneGeometryFactory } from '../geometry/PlaneGeometryFactory';
import { SphereGeometryFactory } from '../geometry/SphereGeometryFactory';
import { Renderer } from '../Renderer';

export class GeometryManager {
  geometries: Map<string, Geometry>;
  initialized: boolean;

  constructor() {
    this.geometries = new Map();
    this.initialized = false;
  }

  get(id: string) {
    const toRet = this.geometries.get(id);
    if (!toRet) throw new Error(`Could not find geometry with id ${id}`);
    return toRet;
  }

  async initialize(renderer: Renderer) {
    if (this.initialized) return;
    const { device } = renderer;

    this.addGeometry('box', BoxGeometryFactory.new());
    this.addGeometry('capsule', CapsuleGeometryFactory.new());
    this.addGeometry('sphere', SphereGeometryFactory.new());
    this.addGeometry('plane', PlaneGeometryFactory.new());

    await Promise.all(
      Array.from(this.geometries.values()).map((geometry) => {
        return geometry.build(device);
      })
    );

    this.initialized = true;
  }

  dispose() {
    Array.from(this.geometries.values()).forEach((geometry) => {
      geometry.dispose();
    });

    this.geometries.clear();
    this.initialized = false;
  }

  addGeometry(id: string, geometry: Geometry) {
    this.geometries.set(id, geometry);
    return geometry;
  }
}
