import { Renderer } from '..';
import { BoxGeometryFactory } from '../geometry/BoxGeometryFactory';
import { Geometry } from '../geometry/Geometry';
import { SkyRenderer } from '../renderers/sky/SkyRenderer';
import { Camera } from './Camera';
import { Transform } from './Transform';

export class AtmosphereSkybox {
  transform: Transform;
  geometry: Geometry;
  skyRenderer: SkyRenderer;
  initialized: boolean;

  constructor() {
    this.initialized = false;
    this.geometry = BoxGeometryFactory.new();
    this.transform = new Transform();
    this.skyRenderer = new SkyRenderer();
    this.transform.scale.set(1000, 1000, 1000);
    this.transform.updateMatrixWorld();
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    this.transform.position.set(
      camera.transform.position.x,
      camera.transform.position.y,
      camera.transform.position.z
    );

    this.transform.updateMatrixWorld();

    this.transform.modelViewMatrix.multiplyMatrices(
      camera.matrixWorldInverse,
      this.transform.matrixWorld
    );

    this.transform.normalMatrix.getNormalMatrix(this.transform.modelViewMatrix);

    if (!this.initialized) {
      this.geometry.build(renderer.device);
      this.skyRenderer.init(renderer);
      this.initialized = true;
    }

    this.skyRenderer.render(
      renderer,
      pass,
      camera,
      this.transform,
      this.geometry
    );
  }
}
