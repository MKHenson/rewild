import type { Renderer } from '../../Renderer';
import { CUBE_FACE_COUNT, SkyCaptureScheduler } from './SkyCaptureScheduler';

/**
 * Edge length of one captured face.
 *
 * The atmosphere has no high-frequency content to preserve — its sharpest
 * feature is the sun halo, a `pow(0.5 + 0.5 * mu, 15)` lobe tens of degrees
 * wide (see `getAtmosphereColor` in fog.wgsl) — so resolution here buys
 * nothing beyond enough mips for the roughness chain in #200. 128 gives eight
 * of them and costs 786KB.
 *
 * Deliberately *not* scaled by quality tier. Six faces at this size is 98k
 * texels, under 5% of a 1080p frame, and the whole point of the amortisation
 * below is that only a sixth of that is drawn on a typical frame. Dropping it
 * on a low tier would degrade the ambient term on every lit surface to save
 * something already too small to measure.
 */
export const SKY_CUBE_SIZE = 128;

/**
 * Mips on the captured cube: 128, 64, ... 1.
 *
 * The capture pass only ever writes mip 0. The rest are box-filtered by the IBL
 * prefilter, which needs them for two things — picking a source level from the
 * sample pdf when importance-sampling the specular chain, and giving the
 * irradiance convolution a pre-averaged level to integrate. Both amount to the
 * same thing: they are what stops a handful of samples over a sky containing
 * point-like stars from turning into fireflies.
 */
export const SKY_CUBE_MIP_COUNT = 8;

// Basis vectors per cube face: [A | B | C], where the world-space ray direction
// for a fragment at NDC (x, y) is A*x + B*y + C.
//
// Transcribed from getCubeDirection() in starfield.wgsl — which the night sky
// cubemap has already validated end to end — rather than derived from a lookAt
// plus a perspective inverse. That shortcut is on purpose: cube *sampling* is
// left-handed while a camera is right-handed, so a face built the camera way
// comes out mirrored, and the mirror is invisible on a starfield or a gradient
// until something asymmetric shows up in a reflection much later. Going
// straight from the sampling convention removes the flip from the problem.
//
// The mapping from starfield's face UVs to NDC is u = ndc.x, v = -ndc.y, since
// fragCoord.y counts downward while NDC y counts up.
// prettier-ignore
const FACE_BASIS: number[][] = [
  //  A (per ndc.x)      B (per ndc.y)      C (constant)
  [  0,  0, -1,          0,  1,  0,         1,  0,  0 ], // 0: +X
  [  0,  0,  1,          0,  1,  0,        -1,  0,  0 ], // 1: -X
  [  1,  0,  0,          0,  0, -1,         0,  1,  0 ], // 2: +Y
  [  1,  0,  0,          0,  0,  1,         0, -1,  0 ], // 3: -Y
  [  1,  0,  0,          0,  1,  0,         0,  0,  1 ], // 4: +Z
  [ -1,  0,  0,          0,  1,  0,         0,  0, -1 ], // 5: -Z
];

/**
 * Per-face replacements for `ObjectStruct.invViewProjectionMatrix`.
 *
 * The sky vertex shader already reconstructs its ray direction as
 * `invViewProjectionMatrix * vec4f(ndc.xy, 1, 1)`, so pointing that matrix at a
 * cube face is the entire mechanism by which the screen sky becomes a captured
 * sky — no shader variant, and no way for the two to drift apart.
 *
 * Column-major, matching how WGSL reads a `mat4x4<f32>` out of a uniform
 * buffer. The third column carries the constant term because NDC z is 1 at the
 * far plane, which leaves the result a plain rotation: orthonormal, det +1, and
 * w exactly 1 so the perspective divide in the shader is a no-op.
 */
export const SKY_CUBE_FACE_MATRICES: Float32Array[] = FACE_BASIS.map(
  (b) =>
    // prettier-ignore
    new Float32Array([
      b[0], b[1], b[2], 0,
      b[3], b[4], b[5], 0,
      b[6], b[7], b[8], 0,
      0,    0,    0,    1,
    ])
);

/**
 * Renders the atmosphere into a cubemap so it can light the scene.
 *
 * This is the source texture for Lichen's image-based lighting: #200 prefilters
 * it into an irradiance cube and a roughness-mipped specular cube, and #201
 * samples those in place of the flat ambient constant. Because the atmosphere
 * model already responds to cloudiness, foginess and temperature, capturing it
 * is what makes ambient track time of day and weather without any authoring.
 *
 * Only the analytic sky gradient is captured; the volumetric clouds are not.
 * Raymarching them six more times is the one cost in the sky pipeline that
 * could not be absorbed, and the screen-space cloud buffer only covers the
 * camera frustum, so there is nothing cheap to reproject. Overcast still
 * greys and dims the capture, because the gradient and fog shaders take
 * cloudiness as an input in their own right — what is lost is the shadowing of
 * individual cloud shapes, which a prefiltered ambient term would blur away.
 *
 * There is deliberately **no sun disc** either. It is drawn by the cloud pass
 * (`sunDisc` in cloudsTemporal.wgsl), so excluding clouds excludes it for free
 * — but it would have to be excluded regardless, for two reasons. The sun is
 * already a DirectionLight shaded by the direct-lighting path, so a disc here
 * would add the scene's dominant light twice; and at 1000-9000 HDR across a
 * ~2.3° disc it would straddle about three texels of a 0.7°-per-texel face,
 * dumping radiance comparable to the whole rest of the sky into the irradiance
 * integral and swinging with sub-texel position as the sun moves. Specular sun
 * highlights come from the punctual light's GGX lobe, not from reflecting this
 * cube. The broad `sunProximity` halo *is* captured, and should be: that one
 * is scattered light.
 */
export class SkyCubeCapture {
  /** rgba16float cubemap holding the captured atmosphere. */
  cubemap: GPUTexture;

  /** Amortisation policy — which faces to redraw on this frame, and when. */
  scheduler: SkyCaptureScheduler = new SkyCaptureScheduler();

  /** Master switch. When false no capture passes are encoded at all. */
  enabled: boolean = true;

  private pipeline: GPURenderPipeline | null = null;
  private uniformBuffer: GPUBuffer;
  private bindGroups: GPUBindGroup[] = [];
  private passDescriptors: GPURenderPassDescriptor[] = [];
  private faceData: Float32Array;
  private stride: number = 0;

  /**
   * @param skyUniformData  The sky's live uniform block. Its length fixes the
   *                        per-face stride; `render` copies it wholesale so the
   *                        capture sees exactly the sky the screen pass sees.
   * @param gradientPipeline `SkyGradientRenderer.pipeline`, reused rather than
   *                        rebuilt. Same shader, same rgba16float target — and
   *                        sharing the object means an edit to the atmosphere
   *                        cannot land on screen without also landing in the
   *                        capture. Its bind group layout is an `auto` layout,
   *                        which is not compatible across pipeline objects, so
   *                        this must be re-run whenever that pass rebuilds.
   */
  init(
    renderer: Renderer,
    skyUniformData: Float32Array,
    gradientPipeline: GPURenderPipeline,
    nightSkyCubemap: GPUTexture
  ): void {
    const { device } = renderer;

    this.pipeline = gradientPipeline;
    this.stride = skyUniformData.byteLength;
    this.faceData = new Float32Array(skyUniformData.length);

    // The cubemap is sized from a constant, not the canvas, so a re-init on
    // resize or a quality change must not replace it — the IBL prefilter and
    // every material bind group downstream bake a view of this texture and are
    // not told when it changes. Same reasoning as CloudShadowRenderer.shadowMap,
    // and the same failure mode if ignored: no validation error, just a
    // permanently frozen ambient term.
    if (!this.cubemap) {
      this.cubemap = device.createTexture({
        size: [SKY_CUBE_SIZE, SKY_CUBE_SIZE, CUBE_FACE_COUNT],
        format: 'rgba16float',
        label: 'sky environment cubemap',
        mipLevelCount: SKY_CUBE_MIP_COUNT,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.TEXTURE_BINDING |
          // The prefilter copies mip 0 straight across as the specular cube's
          // roughness-0 level rather than re-deriving a mirror through an
          // estimator that degenerates there.
          GPUTextureUsage.COPY_SRC,
      });
    }

    // One buffer, six slots. Separate slots rather than one rewritten buffer
    // because a full refresh encodes all six passes into the same submission,
    // and queue.writeBuffer is ordered against the submit rather than against
    // the passes inside it — every face would read whatever the last write left
    // behind. The stride doubles as the binding offset, which is legal because
    // SkyRenderer rounds its uniform block up to a multiple of 256.
    this.uniformBuffer?.destroy();
    this.uniformBuffer = device.createBuffer({
      label: 'sky cube capture uniforms',
      size: this.stride * CUBE_FACE_COUNT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const layout = gradientPipeline.getBindGroupLayout(0);
    const sampler = renderer.samplerManager.get('linear');

    this.bindGroups.length = 0;
    this.passDescriptors.length = 0;

    for (let face = 0; face < CUBE_FACE_COUNT; face++) {
      this.bindGroups.push(
        device.createBindGroup({
          label: `sky cube capture face ${face}`,
          layout,
          entries: [
            {
              binding: 0,
              resource: {
                buffer: this.uniformBuffer,
                offset: face * this.stride,
                size: this.stride,
              },
            },
            { binding: 1, resource: sampler },
            {
              binding: 5,
              resource: nightSkyCubemap.createView({ dimension: 'cube' }),
            },
          ],
        })
      );

      // Views and descriptors are built once and reused. render() runs every
      // frame, and createView() there would allocate six objects a frame for a
      // texture that never changes.
      this.passDescriptors.push({
        label: `sky cube capture pass ${face}`,
        colorAttachments: [
          {
            // mipLevelCount is mandatory now the texture has a chain: a render
            // attachment view must resolve to exactly one mip level.
            view: this.cubemap.createView({
              dimension: '2d',
              baseMipLevel: 0,
              mipLevelCount: 1,
              baseArrayLayer: face,
              arrayLayerCount: 1,
            }),
            clearValue: [0, 0, 0, 1],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
    }

    // On the first init the cubemap is empty, and nothing may ever be lit by a
    // half-black cube — so the opening cycle is collapsed into one frame rather
    // than spread over six. On a later re-init the contents are still valid and
    // this is redundant, but a single redraw is not worth a special case.
    this.scheduler.refresh(true);
  }

  /**
   * Encodes this frame's face updates into `encoder`. Shares the sky's own
   * command encoder rather than taking one of its own: a face is 16k pixels, so
   * what this costs is pass and submission overhead rather than shading, and a
   * separate submit per frame would be a meaningful fraction of it.
   *
   * The sun direction must be normalised: the scheduler compares its components
   * frame to frame to decide whether the sky has moved.
   *
   * `timestampWrites` times the first face only. Every face costs the same, so
   * one measurement times them all — and attaching the query to each of them in
   * turn would need a query slot per face for a number that never differs.
   *
   * @returns how many faces were redrawn. The IBL prefilter reads this to know
   *          the source moved, and reads a full six as the discontinuity signal
   *          that it should catch up in one frame rather than amortise.
   */
  render(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    skyUniformData: Float32Array,
    sunX: number,
    sunY: number,
    sunZ: number,
    cloudiness: number,
    foginess: number,
    temperature: number,
    cameraAltitude: number,
    timestampWrites?: GPURenderPassTimestampWrites
  ): number {
    if (!this.enabled || !this.pipeline) return 0;

    const count = this.scheduler.plan(
      sunX,
      sunY,
      sunZ,
      cloudiness,
      foginess,
      temperature,
      cameraAltitude
    );
    if (count === 0) return 0;

    const faceData = this.faceData;

    for (let i = 0; i < count; i++) {
      const face = this.scheduler.nextFace();

      // Take the sky's live state verbatim, then swap only the matrix that
      // decides which way the rays point.
      faceData.set(skyUniformData);
      faceData.set(SKY_CUBE_FACE_MATRICES[face], 0);
      device.queue.writeBuffer(
        this.uniformBuffer,
        face * this.stride,
        faceData.buffer,
        0,
        this.stride
      );

      const descriptor = this.passDescriptors[face];
      descriptor.timestampWrites = i === 0 ? timestampWrites : undefined;

      const pass = encoder.beginRenderPass(descriptor);
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroups[face]);
      pass.draw(6);
      pass.end();
    }

    return count;
  }

  dispose(): void {
    this.uniformBuffer?.destroy();
    this.cubemap?.destroy();
  }
}
