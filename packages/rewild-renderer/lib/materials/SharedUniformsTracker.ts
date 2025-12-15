import { Renderer } from '..';
import { IMaterialPass } from './IMaterialPass';
import { Camera } from '../core/Camera';
import { IMeshTracker } from '../../types/IMeshTracker';
import { ISharedUniformBuffer } from '../../types/IUniformBuffer';
import { IMeshComponent } from '../../types/interfaces';

export class SharedUniformsTracker implements IMeshTracker {
  meshes: IMeshComponent[];
  uniforms: ISharedUniformBuffer[];
  materialPass: IMaterialPass;

  constructor(pass: IMaterialPass, uniforms: ISharedUniformBuffer[]) {
    this.uniforms = uniforms;
    this.materialPass = pass;
    this.meshes = [];
  }

  dispose(): void {
    this.uniforms.forEach((uniform) => {
      uniform.destroy();
    });
  }

  onAssignedToMesh(mesh: IMeshComponent): void {
    if (!this.meshes.includes(mesh)) {
      this.meshes.push(mesh);
      this.uniforms.forEach((uniform) => {
        uniform.setNumInstances(this.meshes.length);
      });
    }
  }

  onUnassignedFromMesh(mesh: IMeshComponent): void {
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
    meshes: IMeshComponent[]
  ): void {
    const material = this.materialPass;

    const uniforms = this.uniforms;
    let uniform: ISharedUniformBuffer;
    for (let i = 0, l = uniforms.length; i < l; i++) {
      uniform = uniforms[i];

      if (uniform.requiresBuild) {
        uniform.build(
          renderer,
          material.pipeline.getBindGroupLayout(uniform.group)
        );
      }

      uniform.prepare(renderer, camera, meshes);
      pass.setBindGroup(uniform.group, uniform.bindGroup);
    }
  }
}
