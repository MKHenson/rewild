import { Geometry } from '../geometry/Geometry';
import { IMaterialPass, SceneCategory } from './IMaterialPass';
import shader from '../shaders/water.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { Lighting } from './uniforms/Lighting';
import { WaterUniforms } from './uniforms/WaterUniforms';

const waterGroupIndex = 1;
const lightingGroupIndex = 2;

// One chunk's water. Drawn after every opaque group and before the transparent
// ones (Renderer.organizeVisuals), writing depth so the atmosphere composite
// fogs it like terrain.
export class WaterPass implements IMaterialPass {
  profileCategory: SceneCategory = 'water';

  side: GPUFrontFace = 'ccw';
  pipeline: GPURenderPipeline;
  requiresRebuild: boolean = true;
  perMeshTracker: PerMeshTracker;
  sharedUniformsTracker: SharedUniformsTracker;
  waterUniforms: WaterUniforms;
  lightingUniforms: Lighting;

  constructor() {
    this.waterUniforms = new WaterUniforms(waterGroupIndex);
    this.lightingUniforms = new Lighting(lightingGroupIndex);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      this.waterUniforms,
      this.lightingUniforms,
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
      label: 'water render pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 4 * 3,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
          {
            arrayStride: 4 * 2,
            attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
          },
        ],
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [{ format: sceneColorFormat }],
      },
      multisample: { count: renderer.sampleCount },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back',
        frontFace: this.side,
      },
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
    return !!(geometry.vertices && geometry.uvs);
  }

  render(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    camera: Camera,
    meshes: Mesh[],
    geometry: Geometry
  ): void {
    pass.setPipeline(this.pipeline);
    pass.setVertexBuffer(0, geometry.vertexBuffer);
    pass.setVertexBuffer(1, geometry.uvBuffer);
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
