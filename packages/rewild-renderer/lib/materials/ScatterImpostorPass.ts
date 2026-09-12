import { Vector3 } from 'rewild-common';
import { Renderer } from '..';
import { IScatterInstanceGroup } from '../../types/interfaces';
import { Camera } from '../core/Camera';
import { Mesh } from '../core/Mesh';
import { Geometry } from '../geometry/Geometry';
import { ScatterImpostorAtlas } from '../renderers/terrain/ScatterImpostorBake';
import shader from '../shaders/scatter-impostor.wgsl';
import { IS_SCATTER_IMPOSTOR_PASS } from '../typeGuards';
import { IMaterialPass } from './IMaterialPass';
import { SharedUniformsTracker } from './SharedUniformsTracker';
import { Lighting } from './uniforms/Lighting';
import { ShadowUniforms } from './uniforms/ShadowUniforms';

const materialGroupIndex = 0;
const instanceGroupIndex = 1;
const lightingGroup = 2;
const shadowGroup = 3;

const _viewerLocal = new Vector3();

/**
 * The far scatter tier: a camera-facing billboard per instance, textured from
 * the layer's baked octahedral atlas and shaded like the mesh tiers.
 *
 * Shares ScatterInstancedPass's instance-group contract — the same buffer,
 * the same per-draw uniform, the same cell selection — so a chunk's impostor
 * group is just another ScatterChunkLayer with a quad for its geometry. What
 * differs is group 0: the atlas instead of a material.
 */
export class ScatterImpostorPass implements IMaterialPass {
  readonly [IS_SCATTER_IMPOSTOR_PASS] = true as const;

  pipeline: GPURenderPipeline;
  requiresRebuild = true;
  side: GPUFrontFace = 'ccw';
  readonly transparent = false;
  readonly doubleSided = true;
  perMeshTracker: SharedUniformsTracker;
  lightingUniforms: Lighting;
  shadowUniforms: ShadowUniforms;
  readonly atlas: ScatterImpostorAtlas;

  private atlasBindGroup: GPUBindGroup | null = null;

  constructor(atlas: ScatterImpostorAtlas) {
    this.atlas = atlas;
    this.lightingUniforms = new Lighting(lightingGroup);
    this.shadowUniforms = new ShadowUniforms(shadowGroup, true);
    this.perMeshTracker = new SharedUniformsTracker(this, [
      this.lightingUniforms,
      this.shadowUniforms,
    ]);
  }

  init(renderer: Renderer): void {
    this.requiresRebuild = false;
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'scatter impostor shader',
      code: shader,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'Scatter Impostor Pass',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module,
        buffers: [
          {
            arrayStride: 12,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
          },
          {
            arrayStride: 8,
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
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
    });

    const { atlas } = this;
    this.atlasBindGroup = device.createBindGroup({
      label: 'scatter impostor atlas',
      layout: this.pipeline.getBindGroupLayout(materialGroupIndex),
      entries: [
        { binding: 0, resource: atlas.sampler },
        { binding: 1, resource: atlas.albedo.createView() },
        { binding: 2, resource: atlas.normal.createView() },
        { binding: 3, resource: { buffer: atlas.params } },
      ],
    });

    for (const uniform of this.perMeshTracker.uniforms)
      uniform.requiresBuild = true;
  }

  dispose(): void {
    this.perMeshTracker.dispose();
    this.atlas.albedo.destroy();
    this.atlas.normal.destroy();
    this.atlas.params.destroy();
  }

  instanceBindGroupLayout(): GPUBindGroupLayout {
    return this.pipeline.getBindGroupLayout(instanceGroupIndex);
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
    pass.setBindGroup(materialGroupIndex, this.atlasBindGroup!);
    this.perMeshTracker.prepareMeshUniforms(renderer, pass, camera, meshes);

    const numIndices = geometry.indices!.length;
    const projection = camera.projectionMatrix.elements;
    const cameraWorld = camera.transform.matrixWorld.elements;

    for (let i = 0; i < meshes.length; i++) {
      const group = meshes[i] as unknown as IScatterInstanceGroup;
      if (group.instanceCount === 0) continue;

      const world = group.transform.matrixWorld.elements;
      _viewerLocal.set(
        cameraWorld[12] - world[12],
        cameraWorld[13] - world[13],
        cameraWorld[14] - world[14]
      );
      group.selectInstances(_viewerLocal);
      if (group.rangeCount === 0) continue;

      const bindGroup = group.prepareInstances(renderer, this);
      if (!bindGroup) continue;

      group.writeFrameUniforms(
        renderer,
        projection,
        group.transform.modelViewMatrix.elements
      );

      pass.setBindGroup(instanceGroupIndex, bindGroup);
      for (let r = 0; r < group.rangeCount; r++)
        pass.drawIndexed(
          numIndices,
          group.rangeCounts[r],
          0,
          0,
          group.rangeStarts[r]
        );
    }
  }
}
