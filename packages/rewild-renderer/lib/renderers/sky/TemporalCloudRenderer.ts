import { Renderer } from '../../Renderer';
import { Camera } from '../../core/Camera';
import { Matrix4 } from 'rewild-common';
import commonShaderFns from '../../shaders/sky/skyCommon.wgsl';
import constantsFns from '../../shaders/sky/skyConstants.wgsl';
import fogFns from '../../shaders/sky/fog.wgsl';
import cloudDensityFns from '../../shaders/sky/cloudDensity.wgsl';
import temporalShader from '../../shaders/sky/cloudsTemporal.wgsl';

// ──────────────────────────────────────────────────────────────────────────────
// Temporal uniform layout (matches TemporalUniforms struct in cloudsTemporal.wgsl):
//
//  offset  0  – prevViewProjMatrix : mat4x4<f32>  (16 × f32 = 64 bytes)
//  offset 64  – currentSampleIndex : u32           (4 bytes)
//  offset 68  – historyValid       : u32           (4 bytes)
//  offset 72  – blendFactor        : f32           (4 bytes)
//  offset 76  – _padding           : f32           (4 bytes)
//  total: 80 bytes → rounded up to 256
// ──────────────────────────────────────────────────────────────────────────────

const TEMPORAL_UNIFORM_BYTE_SIZE = 80;
const ALIGNED_TEMPORAL_UNIFORM_SIZE =
  Math.ceil(TEMPORAL_UNIFORM_BYTE_SIZE / 256) * 256;

/** Default EMA weight for reprojected pixels (0 = all history, 1 = all current). */
const DEFAULT_BLEND_FACTOR = 0.6;

/**
 * Camera jump thresholds that trigger history invalidation.
 * Position in world units, rotation in radians.
 */
const TELEPORT_POSITION_THRESHOLD = 100;
const TELEPORT_ROTATION_THRESHOLD = Math.PI / 8;

/**
 * TemporalCloudRenderer replaces CloudRenderer in SkyRenderer.
 *
 * Each frame only 1/16 of pixels are raymarched (4×4 checkerboard pattern).
 * The remaining 15/16 pixels are reprojected from the previous frame's
 * accumulated history via direction-based reprojection.  An exponential
 * moving-average blend (blendFactor ≈ 0.6) smooths convergence and hides
 * the checkerboard seam as the pattern cycles through all 4 groups.
 *
 * History is invalidated (full re-render) on first frame, after a camera
 * teleport, or after a resolution change.
 *
 * Drop-in replacement: `renderTarget` has the same size/format as
 * CloudRenderer.renderTarget so all downstream passes are unaffected.
 */
export class TemporalCloudRenderer {
  /** Output texture fed into downstream passes (BloomPass, GodRaysPass, etc.). */
  renderTarget: GPUTexture;

  /** Accumulated history from previous frames (ping-ponged each frame). */
  historyTexture: GPUTexture;

  pipeline: GPURenderPipeline;
  bindGroup0: GPUBindGroup;
  bindGroup1: GPUBindGroup;

  temporalUniformBuffer: GPUBuffer;

  resolutionScale: number;

  /** Stored on init so render() can write uniforms without a renderer reference. */
  private device: GPUDevice;

  /** Frame counter cycling 0-15 to select the active checkerboard group. */
  private currentFrame = 0;

  /** False until the first frame has been fully rendered. */
  private historyValid = false;

  // Two-slot view-projection tracking.
  // prevViewProjMatrix  = what is written to the shader (previous frame's VP).
  // lastViewProjMatrix  = current frame's VP, promoted to prev at the START of
  //                       the next updateTemporalState() call.
  // This ensures the shader never accidentally gets the current-frame matrix.
  private prevViewProjMatrix = new Float32Array(16);
  private lastViewProjMatrix = new Float32Array(16);

  // Camera state from the last frame (NaN = not yet initialised).
  // Used for teleport detection.
  private lastCameraX = NaN;
  private lastCameraY = NaN;
  private lastCameraZ = NaN;
  private lastQuatX = NaN;
  private lastQuatY = NaN;
  private lastQuatZ = NaN;
  private lastQuatW = NaN;

  /** Shared ArrayBuffer backing both float32 and uint32 typed-array views. */
  private uniformRawBuffer = new ArrayBuffer(ALIGNED_TEMPORAL_UNIFORM_SIZE);
  private uniformFloat32 = new Float32Array(this.uniformRawBuffer);
  private uniformUint32 = new Uint32Array(this.uniformRawBuffer);

  constructor() {
    this.resolutionScale = 1.0;
  }

  // ────────────────────────────────────────────
  // Init
  // ────────────────────────────────────────────

  init(renderer: Renderer, uniformBuffer: GPUBuffer): void {
    const { device, canvas } = renderer;
    this.device = device;
    const w = Math.floor(canvas.width * this.resolutionScale);
    const h = Math.floor(canvas.height * this.resolutionScale);

    // ── Shader module (self-contained: temporal shader + helpers) ──
    const module = device.createShaderModule({
      label: 'temporal clouds shader',
      code:
        temporalShader +
        constantsFns +
        fogFns +
        commonShaderFns +
        cloudDensityFns,
    });

    // ── Render target (output — same format/size as CloudRenderer) ──
    // COPY_SRC needed so we can ping-pong into historyTexture each frame.
    this.renderTarget = device.createTexture({
      size: [w, h, 1],
      label: 'temporal clouds render target',
      format: 'rgba16float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    // ── History texture (previous frame's accumulated result) ──
    this.historyTexture = device.createTexture({
      size: [w, h, 1],
      label: 'temporal clouds history',
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // ── Pipeline ──
    this.pipeline = device.createRenderPipeline({
      label: 'Temporal Clouds Pipeline',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: 'rgba16float' }],
      },
    });

    // ── Temporal uniform buffer ──
    this.temporalUniformBuffer = device.createBuffer({
      label: 'temporal clouds uniforms',
      size: ALIGNED_TEMPORAL_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // ── Bind group 0: standard cloud bindings (same as CloudRenderer) ──
    this.bindGroup0 = device.createBindGroup({
      label: 'temporal clouds bind group 0',
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: renderer.samplerManager.get('linear') },
        {
          binding: 2,
          resource: renderer.textureManager
            .get('rgba-noise-256')
            .gpuTexture.createView(),
        },
        {
          binding: 3,
          resource: renderer.textureManager
            .get('pebbles-512')
            .gpuTexture.createView(),
        },
        { binding: 4, resource: renderer.depthTexture.createView() },
        {
          binding: 5,
          resource: renderer.samplerManager.get('depth-comparison'),
        },
      ],
    });

    // ── Bind group 1: temporal bindings ──
    this.bindGroup1 = device.createBindGroup({
      label: 'temporal clouds bind group 1',
      layout: this.pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: this.historyTexture.createView() },
        {
          binding: 1,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        { binding: 2, resource: { buffer: this.temporalUniformBuffer } },
      ],
    });
  }

  // ────────────────────────────────────────────
  // Per-frame temporal state update
  // Called by SkyRenderer BEFORE render() each frame.
  // ────────────────────────────────────────────

  /**
   * Update temporal state from the current camera.  Must be called once per
   * frame, BEFORE render().
   *
   * Internally rotates the two-slot VP buffers so the shader always receives
   * the PREVIOUS frame's matrix, never the current one.
   *
   * @param camera          - current camera (position / rotation for teleport detection)
   * @param viewProjMatrix  - current frame's view-projection matrix
   */
  updateTemporalState(camera: Camera, viewProjMatrix: Matrix4): void {
    const pos = camera.transform.position;
    const quat = camera.transform.quaternion;

    // ── Rotate slots: last frame's VP becomes this frame's "previous" ──
    this.prevViewProjMatrix.set(this.lastViewProjMatrix);

    // ── Teleport / discontinuity detection (skip on very first call) ──
    if (!isNaN(this.lastCameraX)) {
      const dx = pos.x - this.lastCameraX;
      const dy = pos.y - this.lastCameraY;
      const dz = pos.z - this.lastCameraZ;
      const positionDelta = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Quaternion dot product → cosine of half the rotation angle between frames.
      // dot < cos(threshold/2) means the rotation exceeds the threshold.
      const quatDot = Math.abs(
        this.lastQuatX * quat.x +
          this.lastQuatY * quat.y +
          this.lastQuatZ * quat.z +
          this.lastQuatW * quat.w
      );
      const rotationExceeded =
        quatDot < Math.cos(TELEPORT_ROTATION_THRESHOLD / 2);

      if (positionDelta > TELEPORT_POSITION_THRESHOLD || rotationExceeded) {
        this.historyValid = false;
      }
    }

    // ── Store current frame's data in the "last" slot for next frame ──
    this.lastViewProjMatrix.set(viewProjMatrix.elements);
    this.lastCameraX = pos.x;
    this.lastCameraY = pos.y;
    this.lastCameraZ = pos.z;
    this.lastQuatX = quat.x;
    this.lastQuatY = quat.y;
    this.lastQuatZ = quat.z;
    this.lastQuatW = quat.w;
  }

  // ────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────

  render(
    encoder: GPUCommandEncoder,
    timestampWrites?: GPURenderPassTimestampWrites
  ): void {
    this.writeTemporalUniforms();
    this.device.queue.writeBuffer(
      this.temporalUniformBuffer,
      0,
      this.uniformRawBuffer
    );

    // ── Temporal cloud render pass ──
    const cloudPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.renderTarget.createView(),
          clearValue: [0.0, 0.0, 0.0, 0.0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      timestampWrites,
    });

    cloudPass.setPipeline(this.pipeline);
    cloudPass.setBindGroup(0, this.bindGroup0);
    cloudPass.setBindGroup(1, this.bindGroup1);
    cloudPass.draw(6);
    cloudPass.end();

    // ── Ping-pong: copy renderTarget → historyTexture for next frame ──
    // Safe to do in the same encoder after the render pass has ended.
    encoder.copyTextureToTexture(
      { texture: this.renderTarget },
      { texture: this.historyTexture },
      [this.renderTarget.width, this.renderTarget.height, 1]
    );

    // ── Advance temporal state ──
    // Mark history valid after the first frame has been written
    this.historyValid = true;
    this.currentFrame = (this.currentFrame + 1) % 4;
  }

  // ────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────

  private writeTemporalUniforms(): void {
    const f32 = this.uniformFloat32;
    const u32 = this.uniformUint32;

    // prevViewProjMatrix at byte offset 0 → float32 indices 0-15
    f32.set(this.prevViewProjMatrix, 0);

    // currentSampleIndex at byte offset 64 → uint32 index 16
    u32[16] = this.currentFrame;

    // historyValid at byte offset 68 → uint32 index 17
    u32[17] = this.historyValid ? 1 : 0;

    // blendFactor at byte offset 72 → float32 index 18
    f32[18] = DEFAULT_BLEND_FACTOR;

    // _padding at byte offset 76 → float32 index 19
    f32[19] = 0.0;

    // Both u32 and f32 views share the same ArrayBuffer so setting one does
    // not corrupt the other as long as byte offsets don't overlap.
  }

  dispose(): void {
    this.renderTarget?.destroy();
    this.historyTexture?.destroy();
    this.temporalUniformBuffer?.destroy();
  }
}
