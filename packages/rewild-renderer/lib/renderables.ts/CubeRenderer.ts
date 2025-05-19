import { IRenderable } from '../../types/interfaces';
import { Renderer } from '../Renderer';
import { BoxGeometryFactory } from '../geometry/BoxGeometryFactory';
import { Camera } from '../core/Camera';
import { Mesh } from '../core/Mesh';
import { textureManager } from '../textures/TextureManager';
import { samplerManager } from '../textures/SamplerManager';
import { DiffusePass } from '../materials/DiffusePass';
import { DiffuseIntancedPass } from '../materials/DiffuseIntancedPass';

export class CubeRenderer implements IRenderable {
  instances: Mesh[] = [];
  initialMesh: Mesh;

  async initialize(renderer: Renderer) {
    const canvas = renderer.canvas;

    canvas.addEventListener('click', (e) => {
      if (!e.ctrlKey && !e.shiftKey) {
        const newMesh = new Mesh(geometry, instancedMaterial);
        renderer.scene.addChild(newMesh.transform);
        this.instances.push(newMesh);
        newMesh.transform.position.set(-5 + this.instances.length, 0, 0);
      } else if (e.ctrlKey) {
        instancedMaterial.diffuse.texture =
          textureManager.get('rgba-noise-256').gpuTexture;
      } else {
        instancedMaterial.diffuse.sampler =
          samplerManager.get('nearest-simple');
      }
    });

    const instancedMaterial = new DiffuseIntancedPass();
    const diffuseMaterial = new DiffusePass();
    const geometry = BoxGeometryFactory.new(1, 1, 1, 1, 1, 1);

    this.initialMesh = new Mesh(geometry, diffuseMaterial);
    // renderer.scene.addChild(this.initialMesh.transform);
    this.instances.push(this.initialMesh);
    return this;
  }

  update(renderer: Renderer, deltaTime: number, totalDeltaTime: number): void {
    for (const instance of this.instances) {
      // Spin each instance 360 degrees around its y axis
      instance.transform.rotation.y += deltaTime * 0.001;
    }

    this.initialMesh.transform.rotation.y += deltaTime * 0.01;
  }

  render(renderer: Renderer, pass: GPURenderPassEncoder, camera: Camera) {}
}
