import { IPostProcess } from '../../types/IPostProcess';
import { Renderer } from '../Renderer';
import godRaysShader from '../shaders/godRays.wgsl';
import vertexScreenQuadShader from '../shaders/utils/vertexScreenQuad.wgsl';
import { PostProcessManager } from './PostProcessManager';
import { Camera } from '../core/Camera';
import { Matrix4, Vector3 } from 'rewild-common';

// Uniform layout (matches GodRayUniforms in godRays.wgsl):
//   offset  0: sunScreenPos (vec2<f32>)
//   offset  8: density (f32)
//   offset 12: weight (f32)
//   offset 16: decay (f32)
//   offset 20: exposure (f32)
//   offset 24: numSamples (f32)
//   offset 28: frameIndex (f32)
//   offset 32: sunColor (vec3<f32>)
//   offset 44: _pad2
//   offset 48: resolution (vec2<f32>)
//   offset 56: _pad3 (vec2)
// Total: 64 bytes → aligned to 256
const godRayUniformByteSize = 64;
const alignedUniformBufferSize = Math.ceil(godRayUniformByteSize / 256) * 256;
const uniformData = new Float32Array(alignedUniformBufferSize / 4);

const _vpMatrix = new Matrix4();

export interface GodRayConfig {
  numSamples: number;
  density: number;
  weight: number;
  decay: number;
  exposure: number;
  enabled: boolean;
}

export class GodRaysPostProcess implements IPostProcess {
  renderTarget: GPUTexture;
  pipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  manager: PostProcessManager;
  cloudTexture: GPUTexture | null;

  /** Master brightness multiplier, applied on top of config.weight. */
  intensityScale: number;

  config: GodRayConfig;

  /** Depth texture the bind group currently points at, so a resize can be detected. */
  private boundDepthTexture: GPUTexture | null;
  private frameIndex: number;

  constructor() {
    this.cloudTexture = null;
    this.boundDepthTexture = null;
    this.frameIndex = 0;
    this.intensityScale = 1.0;
    // density is a fraction of the pixel->sun distance (not a UV length), so it
    // wants to sit near 1.0 for the march to actually reach the sun.
    this.config = {
      numSamples: 48,
      density: 0.9,
      weight: 0.5,
      decay: 0.96,
      exposure: 1.0,
      enabled: true,
    };
  }

  init(renderer: Renderer): IPostProcess {
    const { device, canvas } = renderer;

    const width = Math.floor(canvas.width / 2);
    const height = Math.floor(canvas.height / 2);

    const module = device.createShaderModule({
      label: 'god rays fragment shader',
      code: godRaysShader,
    });

    const vertexModule = device.createShaderModule({
      label: 'god rays vertex shader',
      code: vertexScreenQuadShader,
    });

    // HDR, because the compositor folds this into the scene radiance before ACES
    // rather than painting it over the tonemapped image. An 8-bit target would
    // clip the shafts flat and hide them from the tone curve's shoulder.
    this.renderTarget?.destroy();
    this.renderTarget = device.createTexture({
      label: 'god rays render target',
      size: [width, height, 1],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'god rays pipeline',
      layout: 'auto',
      vertex: {
        entryPoint: 'vs',
        module: vertexModule,
      },
      fragment: {
        entryPoint: 'fs',
        module,
        targets: [{ format: 'rgba16float' }],
      },
    });

    this.uniformBuffer?.destroy();
    this.uniformBuffer = device.createBuffer({
      label: 'god rays uniforms',
      size: alignedUniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.createBindGroup(renderer);

    return this;
  }

  /**
   * The depth texture is destroyed and recreated whenever the canvas resizes, so
   * the bind group holding a view of it has to be rebuilt alongside it.
   */
  private createBindGroup(renderer: Renderer): void {
    this.boundDepthTexture = renderer.depthTexture;
    this.bindGroup = renderer.device.createBindGroup({
      label: 'god rays bind group',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.cloudTexture!.createView() },
        { binding: 2, resource: renderer.samplerManager.get('linear-clamped') },
        { binding: 3, resource: renderer.depthTexture.createView() },
      ],
    });
  }

  dispose(): void {
    if (this.renderTarget) {
      this.renderTarget.destroy();
      this.renderTarget = null as any;
    }
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
      this.uniformBuffer = null as any;
    }
  }

  /**
   * Render the god rays pass.
   *
   * @param renderer      The WebGPU renderer
   * @param sunWorldPos   Sun position in world space (already normalized direction × orbit radius)
   * @param camera        Active camera (for view-projection)
   * @param sunDotUp      dot(sunDir, up) — used to fade near horizon and disable at night
   */
  private clearRenderTarget(renderer: Renderer): void {
    const commandEncoder = renderer.device.createCommandEncoder();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTarget.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.end();
    renderer.device.queue.submit([commandEncoder.finish()]);
  }

  render(
    renderer: Renderer,
    sunWorldPos: Vector3,
    camera: Camera,
    sunDotUp: number,
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    const config = this.config;

    if (!config.enabled) { this.clearRenderTarget(renderer); return; }

    // --- Auto-disable: sun below horizon ---
    if (sunDotUp < -0.05) { this.clearRenderTarget(renderer); return; }

    // --- Project sun to screen UV ---
    _vpMatrix
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    const e = _vpMatrix.elements;
    // Treat the sun as a direction (w=0), not a world-space point (w=1).
    // The cloud shader finds the sun disc where the camera ray direction equals the
    // sun direction — a purely rotational operation that ignores camera translation.
    // Using w=1 includes the translation column of VP and diverges when the sun's
    // orbit radius is small relative to camera displacement (most visible at horizon).
    // With w=0 the translation terms (e[12], e[13], e[15]) are dropped, matching
    // the cloud shader's directional projection exactly.
    const sx = sunWorldPos.x;
    const sy = sunWorldPos.y;
    const sz = sunWorldPos.z;

    // Clip-space W for a direction (w=0) — if <= 0 the sun is behind the camera
    const clipW = e[3] * sx + e[7] * sy + e[11] * sz;
    if (clipW <= 0) { this.clearRenderTarget(renderer); return; }

    const clipX = (e[0] * sx + e[4] * sy + e[8] * sz) / clipW;
    const clipY = (e[1] * sx + e[5] * sy + e[9] * sz) / clipW;

    const sunUVx = (clipX + 1.0) * 0.5;
    const sunUVy = (1.0 - clipY) * 0.5;

    // Off-screen fade. This is a screen-space effect, so it has to die out as the
    // sun leaves the frame — but as a ramp, not a cutoff. A hard threshold makes
    // the whole effect pop off mid-pan.
    const overshoot = Math.max(
      0,
      Math.max(-sunUVx, sunUVx - 1.0),
      Math.max(-sunUVy, sunUVy - 1.0)
    );
    const margin = 0.35;
    if (overshoot >= margin) { this.clearRenderTarget(renderer); return; }
    const edgeFade = 1.0 - overshoot / margin;

    // --- Horizon fade ---
    const horizonFade = Math.max(
      0,
      Math.min(1, (sunDotUp + 0.05) / 0.15)  // smoothstep(-0.05, 0.1, sunDotUp)
    );
    const effectiveWeight =
      config.weight * this.intensityScale * horizonFade * edgeFade;
    if (effectiveWeight <= 0) { this.clearRenderTarget(renderer); return; }

    // --- Sun color (warm at sunset, white at noon) ---
    const t = Math.max(0, sunDotUp / (Math.PI / 2));
    const sunColorR = 1.0;
    const sunColorG = 0.4 + 0.6 * t;
    const sunColorB = 0.1 + 0.8 * t;

    // Rebuild the bind group if the canvas resized out from under the depth texture.
    if (this.boundDepthTexture !== renderer.depthTexture) {
      this.createBindGroup(renderer);
    }

    this.frameIndex = (this.frameIndex + 1) % 64;

    // --- Upload uniforms ---
    const rt = this.renderTarget;
    uniformData[0] = sunUVx;          // sunScreenPos.x
    uniformData[1] = sunUVy;          // sunScreenPos.y
    uniformData[2] = config.density;  // density
    uniformData[3] = effectiveWeight; // weight
    uniformData[4] = config.decay;    // decay
    uniformData[5] = config.exposure; // exposure
    uniformData[6] = config.numSamples; // numSamples
    uniformData[7] = this.frameIndex;  // frameIndex (dither rotation)
    uniformData[8] = sunColorR;       // sunColor.r
    uniformData[9] = sunColorG;       // sunColor.g
    uniformData[10] = sunColorB;      // sunColor.b
    uniformData[11] = 0;              // _pad2
    uniformData[12] = rt.width;       // resolution.x
    uniformData[13] = rt.height;      // resolution.y
    uniformData[14] = 0;              // _pad3.x
    uniformData[15] = 0;              // _pad3.y

    renderer.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

    // --- Render pass ---
    const commandEncoder = renderer.device.createCommandEncoder();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTarget.createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      timestampWrites,
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6);
    pass.end();

    renderer.device.queue.submit([commandEncoder.finish()]);
  }
}
