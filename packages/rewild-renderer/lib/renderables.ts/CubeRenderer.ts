import { IRenderable } from '../../types/interfaces';
import { Renderer } from '../Renderer';
import { BoxGeometryFactory } from '../geometry/BoxGeometryFactory';
import { Camera } from '../core/Camera';
import { Mesh } from '../core/Mesh';
import { Geometry } from '../geometry/Geometry';
import { textureManager } from '../textures/TextureManager';
import { samplerManager } from '../textures/SamplerManager';
import { DiffusePass } from '../materials/DiffusePass';

export class CubeRenderer implements IRenderable {
  instances: Mesh[] = [];
  material: DiffusePass;
  geometry: Geometry;

  async initialize(renderer: Renderer) {
    const pane = renderer.pane;
    pane.canvas()!.addEventListener('click', (e) => {
      if (!e.ctrlKey && !e.shiftKey) {
        const newMesh = new Mesh(this.geometry, this.material);
        renderer.scene.addChild(newMesh.transform);
        this.instances.push(newMesh);
        newMesh.transform.position.set(-5 + this.instances.length, 0, 0);
      } else if (e.ctrlKey) {
        this.material.diffuse.texture =
          textureManager.get('f-texture').gpuTexture;
      } else {
        this.material.diffuse.sampler = samplerManager.get('nearest-simple');
      }
    });

    this.material = new DiffusePass();
    this.geometry = BoxGeometryFactory.new(1, 1, 1, 1, 1, 1);

    this.geometry.build(renderer.device);
    this.material.init(renderer);

    // const mesh1 = new Mesh(this.geometry, this.material);
    // const mesh2 = new Mesh(this.geometry, this.material);
    // const mesh3 = new Mesh(this.geometry, this.material);

    // renderer.scene.addChild(mesh1.transform);
    // renderer.scene.addChild(mesh2.transform);
    // renderer.scene.addChild(mesh3.transform);

    // mesh1.transform.position.set(-1, 1, 0);
    // mesh2.transform.position.set(-1, 0, 0);
    // mesh3.transform.position.set(-1, -1, 0);

    // this.instances.push(mesh1);
    // this.instances.push(mesh2);
    // this.instances.push(mesh3);

    return this;
  }

  update(renderer: Renderer, deltaTime: number, totalDeltaTime: number): void {
    // const transform1 = this.instances[0].transform;
    // const transform2 = this.instances[1].transform;
    // const transform3 = this.instances[2].transform;

    // transform1.rotation.set(
    //   0,
    //   Math.sin(totalDeltaTime * 0.001 * 2),
    //   0,
    //   EulerRotationOrder.XYZ
    // );

    // transform2.rotation.set(
    //   0,
    //   0,
    //   Math.sin(totalDeltaTime * 0.001 * 2),
    //   EulerRotationOrder.XYZ
    // );

    // transform3.rotation.set(
    //   Math.sin(totalDeltaTime * 0.001 * 2),
    //   0,
    //   0,
    //   EulerRotationOrder.XYZ
    // );

    for (const instance of this.instances) {
      // Spin each instance 360 degrees around its y axis
      instance.transform.rotation.y += deltaTime * 0.001;
    }
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {
    // this.material.render(renderer, pass, camera, this.instances, this.geometry);
  }
}
