import { Mesh } from '../core/Mesh';
import { Renderer } from '..';
import { IMaterialPass } from './IMaterialPass';
import { Camera } from '../core/Camera';
import { IMeshTracker } from '../../types/IMeshTracker';
import { ISharedUniformBuffer } from '../../types/IUniformBuffer';

export class SharedUniformsTracker implements IMeshTracker {
  meshes: Mesh[];
  uniforms: ISharedUniformBuffer[];
  materialPass: IMaterialPass;

  constructor(pass: IMaterialPass, uniforms: ISharedUniformBuffer[]) {
    this.uniforms = uniforms;
    this.materialPass = pass;
    this.meshes = [];
  }

  onAssignedToMesh(mesh: Mesh): void {
    if (!this.meshes.includes(mesh)) {
      this.meshes.push(mesh);
      this.uniforms.forEach((uniform) => {
        uniform.setNumInstances(this.meshes.length);
      });
    }
  }

  onUnassignedFromMesh(mesh: Mesh): void {
    if (this.meshes.includes(mesh)) {
      this.meshes.splice(this.meshes.indexOf(mesh), 1);
      this.uniforms.forEach((uniform) => {
        uniform.setNumInstances(this.meshes.length);
      });
    }
  }

  prepareMeshUniforms(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[]
  ): void {
    const material = this.materialPass;

    const uniforms = this.uniforms;
    let uniform: ISharedUniformBuffer;
    for (let i = 0, l = uniforms.length; i < l; i++) {
      uniform = uniforms[i];

      if (uniform.requiresBuild) {
        uniform.build(
          renderer,
          material.cloudsPipeline.getBindGroupLayout(uniform.group)
        );
      }

      uniform.prepare(renderer, camera, meshes);
      pass.setBindGroup(uniform.group, uniform.bindGroup);
    }
  }
}
