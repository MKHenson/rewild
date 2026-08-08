import { Renderer } from '../../Renderer';
import { Camera } from '../../core/Camera';
import { Matrix4 } from 'rewild-common';
import commonShaderFns from '../../shaders/sky/skyCommon.wgsl';
import constantsFns from '../../shaders/sky/skyConstants.wgsl';
import fogFns from '../../shaders/sky/fog.wgsl';
import cloudDensityFns from '../../shaders/sky/cloudDensity.wgsl';
import cirrusFns from '../../shaders/sky/cloudsCirrus.wgsl';
import temporalShader from '../../shaders/sky/cloudsTemporal.wgsl';
import { RenderQuality } from '../../utils/RenderQuality';
import { composeShader } from '../../utils/shaderDefines';
import { cloudShaderDefines } from './SkyQuality';

// ──────────────────────────────────────────────────────────────────────────────
// Temporal uniform layout (matches TemporalUniforms struct in cloudsTemporal.wgsl):
//
//  offset  0  – prevViewProjMatrix : mat4x4<f32>  (16 × f32 = 64 bytes)
//  offset 64  – currentSampleIndex : u32           (4 bytes)
//  offset 68  – historyValid       : u32           (4 bytes)
//  offset 72  – blendFactor        : f32           (4 bytes)
//  offset 76  – _padding           : f32           (4 bytes)
//  offset 80  – jitter             : vec2<f32>     (8 bytes)
//  total: 88 bytes → 96 with the struct's 16-byte alignment → rounded up to 256
//
// jitter sits at 80 rather than reusing _padding at 76 because a vec2<f32> needs
// an 8-byte-aligned offset; 76 is not one.
// ──────────────────────────────────────────────────────────────────────────────

const TEMPORAL_UNIFORM_BYTE_SIZE = 96;
const ALIGNED_TEMPORAL_UNIFORM_SIZE =
  Math.ceil(TEMPORAL_UNIFORM_BYTE_SIZE / 256) * 256;

/**
 * Adaptive blend factor for freshly-raymarched pixels.
 * STILL: camera not moving → accumulate many frames → less noise (~10 effective samples).
 * MOVING: camera rotating → prefer fresh data → avoids smear artefacts.
 * Interpolated each frame based on measured rotation rate.
 */
const BLEND_FACTOR_STILL = 0.1;
const BLEND_FACTOR_MOVING = 0.6;

/**
 * Rotation rate (°/frame) at which the blend factor reaches BLEND_FACTOR_MOVING.
 * This is the pass's motion-aware defence against ghosting, so it must sit at a
 * rate a first-person camera actually turns at — 1.0 is 60°/s at 60fps. Raise it
 * and ordinary mouse-look never reaches BLEND_FACTOR_MOVING; lower it and a
 * near-still camera loses the accumulation depth the jitter needs.
 */
const MOVEMENT_RAMP_DEG = 1.0;

/** Assumed typical distance to the clouds being reprojected, used to convert
 *  camera translation into an equivalent angular (parallax) rate. */
const CLOUD_PARALLAX_DISTANCE = 1500;

/**
 * Camera jump thresholds that trigger history invalidation.
 * Position in world units, rotation in radians.
 */
const TELEPORT_POSITION_THRESHOLD = 100;
const TELEPORT_ROTATION_THRESHOLD = Math.PI / 8;

/**
 * Length of the sub-pixel jitter sequence.
 *
 * Must be coprime with the 4-frame checkerboard period, or a pixel — which
 * marches only every 4th frame — sees a fixed subset of the offsets forever and
 * converges on a biased sample position instead of the texel average.
 */
const JITTER_SEQUENCE_LENGTH = 9;

/** Radical inverse of `index` in `base` — the Halton sequence. */
function halton(index: number, base: number): number {
  let result = 0;
  let f = 1;
  let i = index;
  while (i > 0) {
    f /= base;
    result += f * (i % base);
    i = Math.floor(i / base);
  }
  return result;
}

/**
 * Halton(2,3) sub-texel offsets in [-0.5, 0.5], flattened as x,y pairs. Halton
 * rather than a hash so the handful of offsets in an averaging window stratify
 * the texel instead of clustering. Index starts at 1; Halton(0) is the centre.
 */
const JITTER_OFFSETS = (() => {
  const offsets = new Float32Array(JITTER_SEQUENCE_LENGTH * 2);
  for (let i = 0; i < JITTER_SEQUENCE_LENGTH; i++) {
    offsets[i * 2] = halton(i + 1, 2) - 0.5;
    offsets[i * 2 + 1] = halton(i + 1, 3) - 0.5;
  }
  return offsets;
})();

/**
 * Jitter amplitude in cloud texels, interpolated by the same movementFactor as
 * the blend. Jitter only antialiases once several offsets have averaged, so a
 * moving camera — few effective samples — gets less of it or the residual reads
 * as a wobbling edge. Non-zero at MOVING so the edge doesn't snap on stopping.
 */
const JITTER_SCALE_STILL = 1.0;
const JITTER_SCALE_MOVING = 0.25;

/**
 * TemporalCloudRenderer replaces CloudRenderer in SkyRenderer.
 *
 * Each frame only 1/4 of pixels are raymarched (2×2 checkerboard pattern).
 * The remaining 3/4 pixels are reprojected from the previous frame's
 * accumulated history via direction-based reprojection.  An adaptive EMA
 * blend (BLEND_FACTOR_STILL..BLEND_FACTOR_MOVING) smooths convergence and
 * the checkerboard seam as the pattern cycles through all 4 groups.
 *
 * Each march is offset by a per-frame sub-texel jitter (JITTER_OFFSETS), so the
 * EMA accumulates a spread of sample positions within the texel. That is what
 * antialiases the cloud silhouette.
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

  /** Frame counter cycling 0-3 to select the active 2×2 checkerboard group. */
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

  /** Adaptive EMA weight for freshly-raymarched pixels, updated each frame. */
  private currentBlendFactor = BLEND_FACTOR_STILL;

  /** Cursor into JITTER_OFFSETS, advanced once per rendered frame. */
  private jitterIndex = 0;

  /** Jitter amplitude for this frame, interpolated with camera movement. */
  private currentJitterScale = JITTER_SCALE_STILL;

  /** Shared ArrayBuffer backing both float32 and uint32 typed-array views. */
  private uniformRawBuffer = new ArrayBuffer(ALIGNED_TEMPORAL_UNIFORM_SIZE);
  private uniformFloat32 = new Float32Array(this.uniformRawBuffer);
  private uniformUint32 = new Uint32Array(this.uniformRawBuffer);

  /**
   * Quality tier, read when init() builds the shader module.
   *
   * Assigned by SkyRenderer.init() rather than set directly: the tier is baked
   * into WGSL as compile-time constants, so it only takes effect on a rebuild,
   * and rebuilding this pass alone would leave the passes that read its render
   * target bound to a dead texture. Set `skyRenderer.quality` instead.
   */
  quality: RenderQuality = 'high';

  constructor() {
    this.resolutionScale = 0.7;
  }

  // ────────────────────────────────────────────
  // Init
  // ────────────────────────────────────────────

  init(renderer: Renderer, uniformBuffer: GPUBuffer): void {
    // The history texture below is recreated empty, so anything accumulated by
    // a previous init (a resize, or a quality change) no longer corresponds to
    // it. Without this reset the first frames blend fresh marches against a
    // zeroed history and the clouds darken briefly.
    this.historyValid = false;

    const { device, canvas } = renderer;
    this.device = device;
    const w = Math.floor(canvas.width * this.resolutionScale);
    const h = Math.floor(canvas.height * this.resolutionScale);

    // ── Shader module (self-contained: temporal shader + helpers) ──
    const module = device.createShaderModule({
      label: 'temporal clouds shader',
      code: composeShader(
        [
          temporalShader,
          constantsFns,
          fogFns,
          cirrusFns,
          commonShaderFns,
          cloudDensityFns,
        ],
        cloudShaderDefines(this.quality)
      ),
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
        // No binding 1: the shader's history sampler is gone (see cloudsTemporal.wgsl).
        // With layout:'auto' the derived layout omits it, so passing one here would
        // fail bind group validation.
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

      // Adaptive blend: increase toward BLEND_FACTOR_MOVING as rotation rate rises.
      // quatDot = cos(θ/2) so 2·acos(quatDot) gives the full rotation angle in radians.
      const rotAngleDeg =
        (2.0 * Math.acos(Math.min(quatDot, 1.0)) * 180) / Math.PI;

      // Translation causes real parallax on clouds (~1.5 km typical viewing
      // distance) that the direction-based (infinite-distance) reprojection
      // cannot represent, so stale history smears radially while the camera
      // pans or zooms. Convert the per-frame translation into an equivalent
      // angular rate so the blend also ramps up under fast translation —
      // editor cameras translate hundreds of units per frame when zoomed out.
      const translationDeg =
        ((positionDelta / CLOUD_PARALLAX_DISTANCE) * 180) / Math.PI;

      const movementFactor = Math.min(
        (rotAngleDeg + translationDeg) / MOVEMENT_RAMP_DEG,
        1.0
      );
      this.currentBlendFactor =
        BLEND_FACTOR_STILL +
        movementFactor * (BLEND_FACTOR_MOVING - BLEND_FACTOR_STILL);

      // Same ramp: both depend on how many frames will average together, and
      // movement is what shortens that window.
      this.currentJitterScale =
        JITTER_SCALE_STILL +
        movementFactor * (JITTER_SCALE_MOVING - JITTER_SCALE_STILL);
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
    this.jitterIndex = (this.jitterIndex + 1) % JITTER_SEQUENCE_LENGTH;
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
    f32[18] = this.currentBlendFactor;

    // _padding at byte offset 76 → float32 index 19
    f32[19] = 0.0;

    // jitter at byte offset 80 → float32 indices 20-21
    const offset = this.jitterIndex * 2;
    f32[20] = JITTER_OFFSETS[offset] * this.currentJitterScale;
    f32[21] = JITTER_OFFSETS[offset + 1] * this.currentJitterScale;

    // Both u32 and f32 views share the same ArrayBuffer so setting one does
    // not corrupt the other as long as byte offsets don't overlap.
  }

  dispose(): void {
    this.renderTarget?.destroy();
    this.historyTexture?.destroy();
    this.temporalUniformBuffer?.destroy();
  }
}
