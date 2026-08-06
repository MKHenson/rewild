import type { Renderer } from '../../Renderer';
import downsampleShader from '../../shaders/sky/iblDownsample.wgsl';
import specularShader from '../../shaders/sky/iblSpecular.wgsl';
import irradianceShader from '../../shaders/sky/iblIrradiance.wgsl';
import brdfLutShader from '../../shaders/sky/iblBrdfLut.wgsl';
import { CUBE_FACE_COUNT } from './SkyCaptureScheduler';
import { SKY_CUBE_MIP_COUNT, SKY_CUBE_SIZE } from './SkyCubeCapture';
import {
  IBL_IRRADIANCE_STEP,
  IBL_STEP_DOWNSAMPLE,
  IBL_STEP_SPECULAR_BASE,
  SkyIblSchedule,
} from './SkyIblSchedule';

/**
 * Edge length of the diffuse irradiance cube.
 */
export const IRRADIANCE_SIZE = 16;

/** Cosine-weighted samples per irradiance texel. */
const IRRADIANCE_SAMPLES = 128;

/**
 * Source mip the irradiance integral reads. 32x32 per face: fine enough that a
 * hemisphere's worth of sky structure survives, coarse enough that stars have
 * been averaged into their neighbourhood before the estimator sees them.
 */
const IRRADIANCE_SOURCE_MIP = 2;

/** GGX samples per prefiltered specular texel. */
const SPECULAR_SAMPLES = 64;

/**
 * Edge length of the BRDF integration map.
 *
 * 128 is the reference size and there is no reason to exceed it: the function
 * is smooth in both parameters, and the one place it moves quickly — grazing
 * angles at low roughness — is handled by sample count rather than resolution.
 */
export const BRDF_LUT_SIZE = 128;

/** Samples per LUT texel. Paid once, at startup, and never again. */
const BRDF_LUT_SAMPLES = 512;

/** 256-byte slots, so a uniform range can be bound at any step's offset. */
const UNIFORM_STRIDE = 256;

/**
 * Turns the captured sky cube into the three things a PBR shader can actually
 * use: a diffuse irradiance cube, a roughness-mipped prefiltered specular cube,
 * and the split-sum BRDF map that ties them to a material's F0.
 */
export class SkyIblPrefilter {
  /** Diffuse ambient: irradiance/pi, ready to multiply by albedo. */
  irradianceCube: GPUTexture;

  /** Specular ambient: mip m holds roughness m / (SKY_CUBE_MIP_COUNT - 1). */
  specularCube: GPUTexture;

  /** Split-sum scale/bias for F0, indexed by (NdotV, roughness). */
  brdfLut: GPUTexture;

  /** Paces the passes below against the capture feeding them. */
  schedule: SkyIblSchedule = new SkyIblSchedule();

  /** Master switch; when false no prefilter passes are encoded. */
  enabled: boolean = true;

  private sourceCube: GPUTexture | null = null;

  private downsamplePipeline: GPURenderPipeline | null = null;
  private specularPipeline: GPURenderPipeline | null = null;
  private irradiancePipeline: GPURenderPipeline | null = null;

  // Indexed [mip - 1][face] — mip 0 is never downsampled into.
  private downsampleBindGroups: GPUBindGroup[][] = [];
  private downsampleDescriptors: GPURenderPassDescriptor[][] = [];

  // Indexed [mip - 1][face] — specular mip 0 is a copy, not a draw.
  private specularBindGroups: GPUBindGroup[][] = [];
  private specularDescriptors: GPURenderPassDescriptor[][] = [];

  private irradianceBindGroups: GPUBindGroup[] = [];
  private irradianceDescriptors: GPURenderPassDescriptor[] = [];

  private uniformBuffer: GPUBuffer;
  private uniformScratch = new ArrayBuffer(UNIFORM_STRIDE);
  private uniformFloats = new Float32Array(this.uniformScratch);
  private uniformUints = new Uint32Array(this.uniformScratch);

  // Source and destination of the specular mip 0 copy, built once so the
  // per-frame path allocates nothing.
  private copySource: GPUImageCopyTexture;
  private copyDest: GPUImageCopyTexture;
  private copyExtent: GPUExtent3DStrict;

  /**
   * @param sourceCube  the capture cube from SkyCubeCapture. It must carry a
   *                    full mip chain: the specular estimator picks a source
   *                    level per sample, and the irradiance integral reads a
   *                    coarse one.
   */
  init(renderer: Renderer, sourceCube: GPUTexture): void {
    const { device } = renderer;

    this.sourceCube = sourceCube;

    if (!this.irradianceCube) {
      this.irradianceCube = device.createTexture({
        label: 'ibl irradiance cube',
        size: [IRRADIANCE_SIZE, IRRADIANCE_SIZE, CUBE_FACE_COUNT],
        format: 'rgba16float',
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
    }

    if (!this.specularCube) {
      this.specularCube = device.createTexture({
        label: 'ibl prefiltered specular cube',
        size: [SKY_CUBE_SIZE, SKY_CUBE_SIZE, CUBE_FACE_COUNT],
        format: 'rgba16float',
        mipLevelCount: SKY_CUBE_MIP_COUNT,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          // Mip 0 is roughness 0 — a perfect mirror, which is the capture
          // itself. A copy beats re-deriving it through an estimator that
          // degenerates at zero roughness.
          GPUTextureUsage.COPY_DST,
      });
    }

    this.buildPipelines(device);
    this.buildUniforms(device);
    this.buildDownsampleResources(device, sourceCube);
    this.buildSpecularResources(device, sourceCube, renderer);
    this.buildIrradianceResources(device, sourceCube, renderer);
    this.buildCopyDescriptors();

    // Generated once. Nothing about it depends on the sky, so it is not part of
    // the amortised schedule and never re-runs.
    if (!this.brdfLut) this.generateBrdfLut(renderer);

    // Fresh bind groups mean the previous pass's outputs are no longer
    // reachable through them; refill everything before anything samples it.
    this.schedule.refresh(true);
  }

  private buildPipelines(device: GPUDevice): void {
    if (this.downsamplePipeline) return;

    const downsampleModule = device.createShaderModule({
      label: 'ibl downsample shader',
      code: downsampleShader,
    });
    this.downsamplePipeline = device.createRenderPipeline({
      label: 'ibl downsample pipeline',
      layout: 'auto',
      vertex: { module: downsampleModule, entryPoint: 'vs' },
      fragment: {
        module: downsampleModule,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float' }],
      },
    });

    const specularModule = device.createShaderModule({
      label: 'ibl specular prefilter shader',
      code: specularShader,
    });
    this.specularPipeline = device.createRenderPipeline({
      label: 'ibl specular prefilter pipeline',
      layout: 'auto',
      vertex: { module: specularModule, entryPoint: 'vs' },
      fragment: {
        module: specularModule,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float' }],
      },
    });

    const irradianceModule = device.createShaderModule({
      label: 'ibl irradiance shader',
      code: irradianceShader,
    });
    this.irradiancePipeline = device.createRenderPipeline({
      label: 'ibl irradiance pipeline',
      layout: 'auto',
      vertex: { module: irradianceModule, entryPoint: 'vs' },
      fragment: {
        module: irradianceModule,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float' }],
      },
    });
  }

  /**
   * One buffer with a 256-byte slot per draw that needs uniforms. Separate
   * slots for the same reason the capture uses them: a discontinuity encodes
   * every step into one submission, and queue.writeBuffer is ordered against
   * the submit rather than against the passes inside it.
   */
  private buildUniforms(device: GPUDevice): void {
    const slots = (SKY_CUBE_MIP_COUNT - 1) * CUBE_FACE_COUNT + CUBE_FACE_COUNT;

    this.uniformBuffer?.destroy();
    this.uniformBuffer = device.createBuffer({
      label: 'ibl prefilter uniforms',
      size: slots * UNIFORM_STRIDE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private specularSlot(mip: number, face: number): number {
    return (mip - 1) * CUBE_FACE_COUNT + face;
  }

  private irradianceSlot(face: number): number {
    return (SKY_CUBE_MIP_COUNT - 1) * CUBE_FACE_COUNT + face;
  }

  private buildDownsampleResources(
    device: GPUDevice,
    sourceCube: GPUTexture
  ): void {
    const layout = this.downsamplePipeline!.getBindGroupLayout(0);
    // Nearest would alias; this sampler's linear filter is what makes a single
    // centre tap equal the average of the four texels underneath it.
    const sampler = device.createSampler({
      label: 'ibl downsample sampler',
      minFilter: 'linear',
      magFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    this.downsampleBindGroups.length = 0;
    this.downsampleDescriptors.length = 0;

    for (let mip = 1; mip < SKY_CUBE_MIP_COUNT; mip++) {
      const groups: GPUBindGroup[] = [];
      const descriptors: GPURenderPassDescriptor[] = [];

      for (let face = 0; face < CUBE_FACE_COUNT; face++) {
        groups.push(
          device.createBindGroup({
            label: `ibl downsample mip ${mip} face ${face}`,
            layout,
            entries: [
              {
                binding: 0,
                resource: sourceCube.createView({
                  dimension: '2d',
                  baseMipLevel: mip - 1,
                  mipLevelCount: 1,
                  baseArrayLayer: face,
                  arrayLayerCount: 1,
                }),
              },
              { binding: 1, resource: sampler },
            ],
          })
        );

        descriptors.push({
          label: `ibl downsample pass mip ${mip} face ${face}`,
          colorAttachments: [
            {
              view: sourceCube.createView({
                dimension: '2d',
                baseMipLevel: mip,
                mipLevelCount: 1,
                baseArrayLayer: face,
                arrayLayerCount: 1,
              }),
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: [0, 0, 0, 1],
            },
          ],
        });
      }

      this.downsampleBindGroups.push(groups);
      this.downsampleDescriptors.push(descriptors);
    }
  }

  private buildSpecularResources(
    device: GPUDevice,
    sourceCube: GPUTexture,
    renderer: Renderer
  ): void {
    const layout = this.specularPipeline!.getBindGroupLayout(0);
    const sampler = renderer.samplerManager.get('linear-clamped');
    const sourceView = sourceCube.createView({ dimension: 'cube' });

    this.specularBindGroups.length = 0;
    this.specularDescriptors.length = 0;

    for (let mip = 1; mip < SKY_CUBE_MIP_COUNT; mip++) {
      const groups: GPUBindGroup[] = [];
      const descriptors: GPURenderPassDescriptor[] = [];

      for (let face = 0; face < CUBE_FACE_COUNT; face++) {
        groups.push(
          device.createBindGroup({
            label: `ibl specular mip ${mip} face ${face}`,
            layout,
            entries: [
              { binding: 0, resource: sourceView },
              { binding: 1, resource: sampler },
              {
                binding: 2,
                resource: {
                  buffer: this.uniformBuffer,
                  offset: this.specularSlot(mip, face) * UNIFORM_STRIDE,
                  size: UNIFORM_STRIDE,
                },
              },
            ],
          })
        );

        descriptors.push({
          label: `ibl specular pass mip ${mip} face ${face}`,
          colorAttachments: [
            {
              view: this.specularCube.createView({
                dimension: '2d',
                baseMipLevel: mip,
                mipLevelCount: 1,
                baseArrayLayer: face,
                arrayLayerCount: 1,
              }),
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: [0, 0, 0, 1],
            },
          ],
        });
      }

      this.specularBindGroups.push(groups);
      this.specularDescriptors.push(descriptors);
    }
  }

  private buildIrradianceResources(
    device: GPUDevice,
    sourceCube: GPUTexture,
    renderer: Renderer
  ): void {
    const layout = this.irradiancePipeline!.getBindGroupLayout(0);
    const sampler = renderer.samplerManager.get('linear-clamped');
    const sourceView = sourceCube.createView({ dimension: 'cube' });

    this.irradianceBindGroups.length = 0;
    this.irradianceDescriptors.length = 0;

    for (let face = 0; face < CUBE_FACE_COUNT; face++) {
      this.irradianceBindGroups.push(
        device.createBindGroup({
          label: `ibl irradiance face ${face}`,
          layout,
          entries: [
            { binding: 0, resource: sourceView },
            { binding: 1, resource: sampler },
            {
              binding: 2,
              resource: {
                buffer: this.uniformBuffer,
                offset: this.irradianceSlot(face) * UNIFORM_STRIDE,
                size: UNIFORM_STRIDE,
              },
            },
          ],
        })
      );

      this.irradianceDescriptors.push({
        label: `ibl irradiance pass face ${face}`,
        colorAttachments: [
          {
            view: this.irradianceCube.createView({
              dimension: '2d',
              baseArrayLayer: face,
              arrayLayerCount: 1,
            }),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [0, 0, 0, 1],
          },
        ],
      });
    }
  }

  private buildCopyDescriptors(): void {
    this.copySource = { texture: this.sourceCube!, mipLevel: 0 };
    this.copyDest = { texture: this.specularCube, mipLevel: 0 };
    this.copyExtent = {
      width: SKY_CUBE_SIZE,
      height: SKY_CUBE_SIZE,
      depthOrArrayLayers: CUBE_FACE_COUNT,
    };
  }

  /**
   * One draw over the whole LUT, on its own encoder, during init. Everything
   * about it is constant, so it is deliberately outside the amortised path.
   */
  private generateBrdfLut(renderer: Renderer): void {
    const { device } = renderer;

    this.brdfLut = device.createTexture({
      label: 'ibl brdf integration lut',
      size: [BRDF_LUT_SIZE, BRDF_LUT_SIZE],
      // Two channels is all the split sum needs, and 16-bit float keeps the
      // bias term's small values from quantising against the scale term.
      format: 'rg16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    const module = device.createShaderModule({
      label: 'ibl brdf lut shader',
      code: brdfLutShader,
    });

    const pipeline = device.createRenderPipeline({
      label: 'ibl brdf lut pipeline',
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: 'rg16float' }],
      },
    });

    const uniformBuffer = device.createBuffer({
      label: 'ibl brdf lut uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const scratch = new ArrayBuffer(16);
    new Float32Array(scratch, 0, 1)[0] = BRDF_LUT_SIZE;
    new Uint32Array(scratch, 4, 1)[0] = BRDF_LUT_SAMPLES;
    device.queue.writeBuffer(uniformBuffer, 0, scratch);

    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    const encoder = device.createCommandEncoder({ label: 'ibl brdf lut' });
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.brdfLut.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 1],
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  /**
   * Encodes this frame's prefilter steps into `encoder` — the sky's own, so
   * these passes ride the submission the capture is already paying for.
   *
   * @param facesCaptured  what SkyCubeCapture.render() returned this frame.
   */
  render(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    facesCaptured: number,
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    if (!this.enabled || !this.specularPipeline) return;

    const steps = this.schedule.plan(facesCaptured, CUBE_FACE_COUNT);

    for (let i = 0; i < steps; i++) {
      const step = this.schedule.takeStep();

      if (step === IBL_STEP_DOWNSAMPLE) {
        this.encodeDownsample(encoder);
        encoder.copyTextureToTexture(
          this.copySource,
          this.copyDest,
          this.copyExtent
        );
      } else if (step === IBL_IRRADIANCE_STEP) {
        this.encodeIrradiance(device, encoder);
      } else {
        // Steps SPECULAR_BASE..IBL_IRRADIANCE_STEP-1 map to mips 1..n-1.
        this.encodeSpecularLevel(
          device,
          encoder,
          step - IBL_STEP_SPECULAR_BASE + 1,
          // Only the first specular level is timed; it is the largest by far,
          // and the rest quarter in size from there.
          step === IBL_STEP_SPECULAR_BASE ? timestampWrites : undefined
        );
      }
    }
  }

  private encodeDownsample(encoder: GPUCommandEncoder): void {
    for (let mip = 1; mip < SKY_CUBE_MIP_COUNT; mip++) {
      const groups = this.downsampleBindGroups[mip - 1];
      const descriptors = this.downsampleDescriptors[mip - 1];

      for (let face = 0; face < CUBE_FACE_COUNT; face++) {
        const pass = encoder.beginRenderPass(descriptors[face]);
        pass.setPipeline(this.downsamplePipeline!);
        pass.setBindGroup(0, groups[face]);
        pass.draw(6);
        pass.end();
      }
    }
  }

  private encodeSpecularLevel(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    mip: number,
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    // Perceptual roughness spread evenly over the chain, so mip 0 is a mirror
    // and the last mip is fully rough. #201 inverts this to pick a level.
    const roughness = mip / (SKY_CUBE_MIP_COUNT - 1);
    const destSize = Math.max(1, SKY_CUBE_SIZE >> mip);

    const groups = this.specularBindGroups[mip - 1];
    const descriptors = this.specularDescriptors[mip - 1];

    for (let face = 0; face < CUBE_FACE_COUNT; face++) {
      this.uniformUints[0] = face;
      this.uniformUints[1] = SPECULAR_SAMPLES;
      this.uniformFloats[2] = roughness;
      this.uniformFloats[3] = SKY_CUBE_SIZE;
      this.uniformFloats[4] = destSize;

      device.queue.writeBuffer(
        this.uniformBuffer,
        this.specularSlot(mip, face) * UNIFORM_STRIDE,
        this.uniformScratch
      );

      const descriptor = descriptors[face];
      descriptor.timestampWrites = face === 0 ? timestampWrites : undefined;

      const pass = encoder.beginRenderPass(descriptor);
      pass.setPipeline(this.specularPipeline!);
      pass.setBindGroup(0, groups[face]);
      pass.draw(6);
      pass.end();
    }
  }

  private encodeIrradiance(
    device: GPUDevice,
    encoder: GPUCommandEncoder
  ): void {
    for (let face = 0; face < CUBE_FACE_COUNT; face++) {
      this.uniformUints[0] = face;
      this.uniformUints[1] = IRRADIANCE_SAMPLES;
      this.uniformFloats[2] = IRRADIANCE_SIZE;
      this.uniformFloats[3] = IRRADIANCE_SOURCE_MIP;

      device.queue.writeBuffer(
        this.uniformBuffer,
        this.irradianceSlot(face) * UNIFORM_STRIDE,
        this.uniformScratch
      );

      const pass = encoder.beginRenderPass(this.irradianceDescriptors[face]);
      pass.setPipeline(this.irradiancePipeline!);
      pass.setBindGroup(0, this.irradianceBindGroups[face]);
      pass.draw(6);
      pass.end();
    }
  }

  dispose(): void {
    this.uniformBuffer?.destroy();
    this.irradianceCube?.destroy();
    this.specularCube?.destroy();
    this.brdfLut?.destroy();
  }
}
