import { Renderer } from '..';
import { BoxGeometryFactory } from '../geometry/BoxGeometryFactory';
import { AtmosphereCubeMaterial } from '../materials/AtmosphereCubeMaterial';
import { Camera } from './Camera';
import { Mesh } from './Mesh';

export class AtmosphereSkybox {
  mesh: Mesh;
  material: AtmosphereCubeMaterial;
  initialized: boolean;

  constructor() {
    this.initialized = false;
    this.material = new AtmosphereCubeMaterial();
    this.mesh = new Mesh(BoxGeometryFactory.new(), this.material);
    this.mesh.transform.scale.set(1000, 1000, 1000);
    this.mesh.transform.updateMatrixWorld();
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    this.mesh.transform.modelViewMatrix.multiplyMatrices(
      camera.matrixWorldInverse,
      this.mesh.transform.matrixWorld
    );
    this.mesh.transform.normalMatrix.getNormalMatrix(
      this.mesh.transform.modelViewMatrix
    );

    if (!this.initialized) {
      this.mesh.geometry.build(renderer.device);
      this.material.init(renderer);
      this.initialized = true;
    }

    this.material.render(
      renderer,
      pass,
      camera,
      [this.mesh],
      this.mesh.geometry
    );
  }
}
