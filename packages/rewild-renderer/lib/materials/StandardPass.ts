import { Geometry } from '../geometry/Geometry';
import { IMaterialPass } from './IMaterialPass';
import shader from '../shaders/standard.wgsl';
import { Renderer } from '..';
import { ProjModelView } from './uniforms/ProjModelView';
import { PerMeshTracker } from './PerMeshTracker';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Mesh } from '../core/Mesh';
import { Camera } from '../core/Camera';
import { StandardMaterial } from './uniforms/StandardMaterial';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';

const materialGroupIndex = 1;
const lightingGroupIndex = 2;
const shadowGroupIndex = 3;

/**
 * Metallic-roughness material pass — glTF's material model, and the one the
 * other scene passes are converging on.
 *
 * It sits alongside LambertPass and PhongPass rather than replacing them: those
 * still back existing materials, and terrain adopts the PBR include separately
 * in #202. The BRDF itself lives in shader-lib/brdf.wgsl and the light loop in
 * shader-lib/pbr-lighting.wgsl, so nothing shading-related is private to this
 * pass.
 *
 * Renders into the HDR scene target (#188) — specular highlights on a smooth
 * surface run well past 1.0, and an 8-bit target would clip them at source.
 */
export class StandardPass implements IMaterialPass {
  pipeline: GPURenderPipeline;
  perMeshTracker: PerMeshTracker;
  requiresRebuild: boolean = true;
  sharedUniformsTracker: SharedUniformsTracker;
  material: StandardMaterial;
  lightingUniforms: Lighting;
  shadowUniforms: ShadowUniforms;
  side: GPUFrontFace;

  constructor() {
    this.side = 'ccw';
    this.requiresRebuild = true;
    this.material = new StandardMaterial(materialGroupIndex);
    this.lightingUniforms = new Lighting(lightingGroupIndex);
    this.shadowUniforms = new ShadowUniforms(shadowGroupIndex);
    this.sharedUniformsTracker = new SharedUniformsTracker(this, [
      this.material,
      this.lightingUniforms,
      this.shadowUniforms,
    ]);
    this.perMeshTracker = new PerMeshTracker(this, () => [
      new ProjModelView(0),
    ]);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'standard shader',
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Standard Pass',
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
          {
            arrayStride: 4 * 3,
            attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }],
          },
        ],
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [
          {
            format: sceneColorFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
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
  }

  dispose(): void {
    this.sharedUniformsTracker.dispose();
    this.perMeshTracker.dispose();
  }

  isGeometryCompatible(geometry: Geometry): boolean {
    return !!(geometry.vertices && geometry.uvs && geometry.normals);
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
    pass.setVertexBuffer(2, geometry.normalBuffer);
    pass.setIndexBuffer(geometry.indexBuffer, 'uint32');

    this.sharedUniformsTracker.prepareMeshUniforms(
      renderer,
      pass,
      camera,
      meshes
    );

    const tracker = this.perMeshTracker;
    const numIndices = geometry.indices!.length;

    for (const mesh of meshes) {
      tracker.prepareMeshUniforms(mesh, renderer, pass, camera);
      pass.drawIndexed(numIndices);
    }
  }
}
