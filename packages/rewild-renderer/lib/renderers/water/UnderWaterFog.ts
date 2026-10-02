import { Renderer } from '../../Renderer';
import shader from '../../shaders/sky/waterFog.wgsl';
import vertexScreenQuadShader from '../../shaders/utils/vertexScreenQuad.wgsl';

/**
 * Fog in the water (waterFog.wgsl): two full-screen draws in the atmosphere
 * composite's pass, which skips the air's fog while the camera is under
 * water. The first multiplies the scene by what survives the water, per
 * channel; the second adds what the water scatters in. Both discard while the
 * camera is above the surface.
 */
export class UnderWaterFog {
  private absorbPipeline: GPURenderPipeline | null = null;
  private scatterPipeline: GPURenderPipeline | null = null;
  private absorbGroup: GPUBindGroup | null = null;
  private scatterGroup: GPUBindGroup | null = null;
  // What the groups were built against; a resize or a new sky replaces them.
  private boundDepth: GPUTexture | null = null;
  private boundIrradiance: GPUTexture | null = null;
  private boundAtmosphere: GPUBuffer | null = null;

  /** Draws into `pass`, the composite's, after the atmosphere. `underWater`
   *  is the UnderWater uniform. */
  draw(
    renderer: Renderer,
    pass: GPURenderPassEncoder,
    underWater: GPUBuffer
  ): void {
    const irradiance = renderer.iblIrradianceMap;
    const atmosphere = renderer.sky?.skyRenderer?.finalPass?.uniformBuffer;
    if (!irradiance || !atmosphere) return;
    if (!this.absorbPipeline || !this.scatterPipeline)
      this.createPipelines(renderer);
    if (
      !this.absorbGroup ||
      this.boundDepth !== renderer.depthTexture ||
      this.boundIrradiance !== irradiance ||
      this.boundAtmosphere !== atmosphere
    ) {
      this.boundDepth = renderer.depthTexture;
      this.boundIrradiance = irradiance;
      this.boundAtmosphere = atmosphere;
      this.absorbGroup = this.createGroup(
        renderer,
        this.absorbPipeline!,
        underWater,
        irradiance,
        atmosphere
      );
      this.scatterGroup = this.createGroup(
        renderer,
        this.scatterPipeline!,
        underWater,
        irradiance,
        atmosphere
      );
    }

    pass.setPipeline(this.absorbPipeline!);
    pass.setBindGroup(0, this.absorbGroup);
    pass.draw(6);
    pass.setPipeline(this.scatterPipeline!);
    pass.setBindGroup(0, this.scatterGroup!);
    pass.draw(6);
  }

  private createPipelines(renderer: Renderer) {
    const { device, sceneColorFormat } = renderer;
    const module = device.createShaderModule({
      label: 'water fog',
      code: shader,
    });
    const vertex = {
      module: device.createShaderModule({ code: vertexScreenQuadShader }),
      entryPoint: 'vs',
    };
    const keepAlpha: GPUBlendComponent = {
      srcFactor: 'zero',
      dstFactor: 'one',
    };
    this.absorbPipeline = device.createRenderPipeline({
      label: 'water fog absorb',
      layout: 'auto',
      vertex,
      fragment: {
        module,
        entryPoint: 'fs_absorb',
        targets: [
          {
            format: sceneColorFormat,
            blend: {
              color: { srcFactor: 'zero', dstFactor: 'src' },
              alpha: keepAlpha,
            },
          },
        ],
      },
    });
    this.scatterPipeline = device.createRenderPipeline({
      label: 'water fog scatter',
      layout: 'auto',
      vertex,
      fragment: {
        module,
        entryPoint: 'fs_scatter',
        targets: [
          {
            format: sceneColorFormat,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one' },
              alpha: keepAlpha,
            },
          },
        ],
      },
    });
  }

  private createGroup(
    renderer: Renderer,
    pipeline: GPURenderPipeline,
    underWater: GPUBuffer,
    irradiance: GPUTexture,
    atmosphere: GPUBuffer
  ): GPUBindGroup {
    const scatters = pipeline === this.scatterPipeline;
    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: atmosphere } },
      {
        binding: 1,
        resource: renderer.depthTexture.createView({ aspect: 'depth-only' }),
      },
      { binding: 2, resource: { buffer: underWater } },
    ];
    if (scatters)
      entries.push(
        { binding: 3, resource: irradiance.createView({ dimension: 'cube' }) },
        { binding: 4, resource: renderer.samplerManager.get('linear-clamped') }
      );
    return renderer.device.createBindGroup({
      label: scatters ? 'water fog scatter' : 'water fog absorb',
      layout: pipeline.getBindGroupLayout(0),
      entries,
    });
  }
}
