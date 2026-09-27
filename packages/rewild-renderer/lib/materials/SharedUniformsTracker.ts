import { Renderer } from '..';
import { IMaterialPass } from './IMaterialPass';
import { Camera } from '../core/Camera';
import { IMeshTracker } from '../../types/IMeshTracker';
import { ISharedUniformBuffer } from '../../types/IUniformBuffer';
import { IVisualComponent } from '../../types/interfaces';

export class SharedUniformsTracker implements IMeshTracker {
  meshes: IVisualComponent[];
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

  onAssignedToMesh(mesh: IVisualComponent): void {
    if (!this.meshes.includes(mesh)) {
      this.meshes.push(mesh);
      this.uniforms.forEach((uniform) => {
        uniform.setNumInstances(this.meshes.length);
      });
    }
  }

  onUnassignedFromMesh(mesh: IVisualComponent): void {
    if (this.meshes.includes(mesh)) {
      this.meshes.splice(this.meshes.indexOf(mesh), 1);
      this.uniforms.forEach((uniform) => {
        uniform.setNumInstances(this.meshes.length);
      });
    }
  }

  /**
   * Builds, prepares and binds every shared group. Returns false when one has
   * no bind group yet (it defers until the subsystem it samples exists), in
   * which case nothing is bound for it and the caller must not draw.
   */
  prepareMeshUniforms(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: IVisualComponent[]
  ): boolean {
    const material = this.materialPass;

    const uniforms = this.uniforms;
    let uniform: ISharedUniformBuffer;
    let ready = true;
    for (let i = 0, l = uniforms.length; i < l; i++) {
      uniform = uniforms[i];

      if (uniform.requiresBuild) {
        uniform.build(
          renderer,
          material.pipeline.getBindGroupLayout(uniform.group)
        );
      }

      uniform.prepare(renderer, camera, meshes);
      if (uniform.bindGroup) pass.setBindGroup(uniform.group, uniform.bindGroup);
      else ready = false;
    }
    return ready;
  }
}
