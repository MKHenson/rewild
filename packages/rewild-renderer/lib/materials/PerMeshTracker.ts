import { Mesh } from '../core/Mesh';
import { Renderer } from '..';
import { IMaterialPass } from './IMaterialPass';
import { Camera } from '../core/Camera';
import { IMeshTracker } from '../../types/IMeshTracker';
import { IPerMeshUniformBuffer } from '../../types/IUniformBuffer';

export type GetUniformsCallback = () => IPerMeshUniformBuffer[];

export class PerMeshTracker implements IMeshTracker {
  meshUniforms: Map<Mesh, IPerMeshUniformBuffer[]> = new Map();

  callback: GetUniformsCallback;
  materialPass: IMaterialPass;

  constructor(pass: IMaterialPass, callback: GetUniformsCallback) {
    this.callback = callback;
    this.materialPass = pass;
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
        uniformBuffer.destroy();
      });

      this.meshUniforms.delete(mesh);
    }
  }

  prepareMeshUniforms(
    mesh: Mesh,
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera
  ): void {
    const material = this.materialPass;

    const uniforms = this.meshUniforms.get(mesh);
    if (!uniforms) return;

    let uniform: IPerMeshUniformBuffer | undefined;
    for (let i = 0, l = uniforms.length; i < l; i++) {
      uniform = uniforms[i];

      if (uniform.requiresUpdate) {
        uniform.build(
          renderer,
          material.cloudsPipeline.getBindGroupLayout(uniform.group)
        );
      }

      uniform.prepare(renderer, camera, mesh.transform);
      pass.setBindGroup(uniform.group, uniform.bindGroup);
    }
  }
}
