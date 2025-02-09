import { IUniformBuffer } from './uniforms/IUniformBuffer';
import { Mesh } from '../core/Mesh';
import { Renderer } from '..';
import { IMaterial } from './IMaterial';

type GetUniformsCallback = () => IUniformBuffer[];

export class MaterialMeshManager {
  meshUniforms: Map<Mesh, IUniformBuffer[]> = new Map();
  callback: GetUniformsCallback;
  material: IMaterial;

  constructor(material: IMaterial, callback: GetUniformsCallback) {
    this.callback = callback;
    this.material = material;
  }

  onAssignedToMesh(mesh: Mesh): void {
    if (!this.meshUniforms.has(mesh)) {
      const uniformBuffers = this.callback();
      this.meshUniforms.set(mesh, uniformBuffers);
    }
  }

  onUnassignedFromMesh(mesh: Mesh): void {
    if (this.meshUniforms.has(mesh)) {
      this.meshUniforms.get(mesh)!.forEach((uniformBuffer) => {
        uniformBuffer.buffer.destroy();
      });

      this.meshUniforms.delete(mesh);
    }
  }

  renderMeshes(renderer: Renderer, pass: GPURenderPassEncoder): void {
    const material = this.material;

    this.meshUniforms.forEach((uniformBuffers, mesh) => {
      uniformBuffers.forEach((uniformBuffer) => {
        if (uniformBuffer.requiresUpdate) {
          uniformBuffer.init(
            renderer,
            material.pipeline.getBindGroupLayout(uniformBuffer.group)
          );
        }

        uniformBuffer.prepareBuffer(renderer, mesh);
        pass.setBindGroup(uniformBuffer.group, uniformBuffer.bindGroup);
        pass.drawIndexed(mesh.geometry.indices!.length);
      });
    });
  }
}
