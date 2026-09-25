import { Geometry } from '../geometry/Geometry';
import { IMaterialPass, SceneCategory } from './IMaterialPass';
import shader from '../shaders/water-horizon.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';
import { HorizonUniforms } from './uniforms/HorizonUniforms';

const horizonGroupIndex = 1;
const lightingGroupIndex = 2;
const shadowGroupIndex = 3;

// The ocean ring past the terrain chunks. Opaque and depth-writing, ordered with
// the chunk water; the two never overlap, since the ring discards wherever a
// chunk is drawn.
export class HorizonOceanPass implements IMaterialPass {
  profileCategory: SceneCategory = 'water';

  side: GPUFrontFace = 'ccw';
  pipeline: GPURenderPipeline;
  requiresRebuild: boolean = true;
  perMeshTracker: PerMeshTracker;
  sharedUniformsTracker: SharedUniformsTracker;
  horizonUniforms: HorizonUniforms;

  constructor() {
    this.horizonUniforms = new HorizonUniforms(horizonGroupIndex);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      this.horizonUniforms,
      new Lighting(lightingGroupIndex),
      new ShadowUniforms(shadowGroupIndex, true),
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  dispose(): void {
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({ code: shader });

    this.pipeline = device.createRenderPipeline({
      label: 'horizon ocean pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 4 * 3,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
        ],
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [{ format: sceneColorFormat }],
      },
      multisample: { count: renderer.sampleCount },
      // Seen from above or, for an underwater camera, from below.
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    for (const uniform of this.sharedUniformsTracker.uniforms)
      uniform.requiresBuild = true;
    this.perMeshTracker.meshUniforms.forEach((uniforms) => {
      for (const uniform of uniforms) uniform.requiresBuild = true;
    });
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!geometry.vertices;
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[],
    geometry: Geometry
  ): void {
    if (!this.horizonUniforms.params) return;

    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');
    this.sharedUniformsTracker.prepareMeshUniforms(
      renderer,
      pass,
      camera,
      meshes
    );

    const numIndices = geometry.indices!.length;
    for (const mesh of meshes) {
      this.perMeshTracker.prepareMeshUniforms(mesh, renderer, pass, camera);
      pass.drawIndexed(numIndices);
    }
  }
}
