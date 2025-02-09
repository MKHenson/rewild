import { IRenderable } from '../../types/interfaces';
import { Renderer } from '../Renderer';
import { BoxGeometryFactory } from '../geometry/BoxGeometryFactory';
import { Camera } from '../core/Camera';
import { EulerRotationOrder } from 'rewild-common';
import { Mesh } from '../core/Mesh';
import { MaterialDiffuse } from '../materials/MaterialDiffuse';
import { Geometry } from '../geometry/Geometry';

export class CubeRenderer implements IRenderable {
  instances: Mesh[] = [];
  material: MaterialDiffuse;
  geometry: Geometry;

  async initialize(renderer: Renderer) {
    this.material = new MaterialDiffuse();
    this.geometry = BoxGeometryFactory.new(1, 1, 1, 1, 1, 1);

    this.geometry.build(renderer.device);
    this.material.init(renderer);

    const mesh1 = new Mesh(this.geometry, this.material);
    const mesh2 = new Mesh(this.geometry, this.material);
    const mesh3 = new Mesh(this.geometry, this.material);

    renderer.scene.addChild(mesh1.transform);
    renderer.scene.addChild(mesh2.transform);
    renderer.scene.addChild(mesh3.transform);

    mesh1.transform.position.set(-1, 1, 0);
    mesh2.transform.position.set(-1, 0, 0);
    mesh3.transform.position.set(-1, -1, 0);

    this.instances.push(mesh1);
    this.instances.push(mesh2);
    this.instances.push(mesh3);

    return this;
  }

  update(renderer: Renderer, deltaTime: number, totalDeltaTime: number): void {
    const transform1 = this.instances[0].transform;
    const transform2 = this.instances[1].transform;
    const transform3 = this.instances[2].transform;

    transform1.rotation.set(
      0,
      Math.sin(totalDeltaTime * 0.001 * 2),
      0,
      EulerRotationOrder.XYZ
    );

    transform2.rotation.set(
      0,
      0,
      Math.sin(totalDeltaTime * 0.001 * 2),
      EulerRotationOrder.XYZ
    );

    transform3.rotation.set(
      Math.sin(totalDeltaTime * 0.001 * 2),
      0,
      0,
      EulerRotationOrder.XYZ
    );
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    pass.setPipeline(this.material.pipeline);
    pass.setVertexBuffer(0, this.geometry.vertexBuffer);
    pass.setVertexBuffer(1, this.geometry.uvBuffer);
    pass.setIndexBuffer(this.geometry.indexBuffer, 'uint16');

    if (this.material.sharedBindGroup) {
      pass.setBindGroup(
        this.material.sharedBindGroup.group,
        this.material.sharedBindGroup.bindGroup
      );
    }

    this.material.meshManager.renderMeshes(renderer, pass);
  }
}
