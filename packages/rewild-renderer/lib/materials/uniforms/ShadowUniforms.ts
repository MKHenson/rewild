import { Matrix4 } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { IVisualComponent } from '../../../types/interfaces';
import { NUM_CASCADES } from '../../renderers/shadow/DirectionalShadowRenderer';
import { SKY_CUBE_MIP_COUNT } from '../../renderers/sky/SkyCubeCapture';

const _tempMat = new Matrix4();

/**
 * Manages bind group 3 — the scene-wide resources a material pass shades with.
 *
 * Bindings 0–2:  cloud shadow (transmittance map, linear sampler, params buffer)
 * Bindings 3–5:  shadow atlas (depth texture, comparison sampler, directional params buffer)
 * Binding  6:    spot light shadow params buffer
 * Bindings 7–11: sky IBL (irradiance cube, specular cube, BRDF map, sampler, params) — opt-in
 *
 * All packed into a single bind group because WebGPU limits bind groups to 4 (0–3).
 *
 * The IBL bindings are opt-in because this group is shared with the Lambert,
 * Phong and terrain passes, whose shaders do not declare them. Their pipelines
 * use `layout: 'auto'`, so a layout is derived from what a shader actually
 * uses — and a bind group carrying entries the layout has no slot for fails
 * validation. Terrain flips this on in #202.
 */
export class ShadowUniforms implements ISharedUniformBuffer {
  group: number;
  /** Whether bindings 7–11 are populated. See the class comment. */
  private includeIbl: boolean;
  cloudBuffer: GPUBuffer;
  directionalBuffer: GPUBuffer;
  spotBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;

  // invViewMatrix (16) + worldSize, centerX, centerZ, shadowIntensity (4) = 20 floats
  private cloudData: Float32Array;
  // 3 × lightMVPFromView (192 bytes) + cascadeSplits (16 bytes) + debugMode u32 + 3× pad = 224 bytes
  private directionalData: ArrayBuffer;
  private directionalFloats: Float32Array;
  private directionalInts: Uint32Array;
  // lightMVPFromView (mat4x4f = 16 floats) + lightIndex (u32) + hasSpotShadow (u32) + 2× pad = 80 bytes
  private spotData: ArrayBuffer;
  private spotFloats: Float32Array;
  private spotInts: Uint32Array;

  // Textures the current bind group samples, so a swap can be detected. A
  // replaced texture is not an error the API reports — the old one stays alive
  // and readable, it just stops being rendered into — so the only way to notice
  // is to compare identity. Mirrors boundDepthTexture in GodRaysPostProcess.
  private boundCloudShadowMap: GPUTexture | null = null;
  private boundShadowAtlas: GPUTexture | null = null;
  private boundIrradianceMap: GPUTexture | null = null;

  /** viewToWorld (16) + intensity + maxSpecularMip + debugChannel + debugScale. */
  private iblData: Float32Array;
  /** Aliases iblData so debugChannel can be written as the u32 the shader reads. */
  private iblInts: Uint32Array;
  iblBuffer: GPUBuffer;

  constructor(group: number, includeIbl: boolean = false) {
    this.group = group;
    this.includeIbl = includeIbl;
    this.requiresBuild = true;
    this.cloudData = new Float32Array(20);
    this.directionalData = new ArrayBuffer(224);
    this.directionalFloats = new Float32Array(this.directionalData);
    this.directionalInts = new Uint32Array(this.directionalData);
    this.spotData = new ArrayBuffer(80);
    this.spotFloats = new Float32Array(this.spotData);
    this.spotInts = new Uint32Array(this.spotData);
    this.iblData = new Float32Array(20);
    this.iblInts = new Uint32Array(this.iblData.buffer);
  }

  get buffer(): GPUBuffer {
    return this.cloudBuffer;
  }

  destroy(): void {
    this.cloudBuffer?.destroy();
    this.directionalBuffer?.destroy();
    this.spotBuffer?.destroy();
    this.iblBuffer?.destroy();
  }

  setNumInstances(_numInstances: number): void {}

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    this.destroy();

    // Cloud shadow params: invViewMatrix (mat4, 64 bytes) + worldSize/centerX/centerZ/intensity (4 floats, 16 bytes) = 80 bytes
    this.cloudBuffer = device.createBuffer({
      label: 'cloud shadow params',
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Directional shadow params: 3 × lightMVPFromView (192) + cascadeSplits (16) + debugMode + 3×pad = 224 bytes
    this.directionalBuffer = device.createBuffer({
      label: 'directional shadow params',
      size: 224,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Spot light shadow params: lightMVPFromView (64 bytes) + lightIndex u32 + hasSpotShadow u32 + 2× pad = 80 bytes
    this.spotBuffer = device.createBuffer({
      label: 'spot light shadow params',
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const cloudShadowMap = renderer.cloudShadowMap;
    const shadowAtlas = renderer.shadowAtlas;
    const irradianceMap = renderer.iblIrradianceMap;
    const specularMap = renderer.iblSpecularMap;
    const brdfLut = renderer.iblBrdfLut;

    // Every one of these belongs to a subsystem that initialises lazily, and the
    // scene pass runs before the sky each frame — so on the first frame some are
    // still null. Deferring is the established answer: requiresBuild is checked
    // again next frame and this self-heals.
    if (!cloudShadowMap || !shadowAtlas) {
      this.requiresBuild = true;
      return;
    }
    if (this.includeIbl && (!irradianceMap || !specularMap || !brdfLut)) {
      this.requiresBuild = true;
      return;
    }

    this.boundCloudShadowMap = cloudShadowMap;
    this.boundShadowAtlas = shadowAtlas;
    this.boundIrradianceMap = irradianceMap;

    const entries: GPUBindGroupEntry[] = [
      // Cloud shadow (bindings 0–2)
      { binding: 0, resource: cloudShadowMap.createView() },
      { binding: 1, resource: renderer.samplerManager.get('linear-clamped') },
      { binding: 2, resource: { buffer: this.cloudBuffer } },
      // Shadow atlas — directional cascades + spot quadrant (bindings 3–5)
      {
        binding: 3,
        resource: shadowAtlas.createView({ aspect: 'depth-only' }),
      },
      {
        binding: 4,
        resource: renderer.samplerManager.get('depth-comparison'),
      },
      { binding: 5, resource: { buffer: this.directionalBuffer } },
      // Spot light shadow params (binding 6)
      { binding: 6, resource: { buffer: this.spotBuffer } },
    ];

    if (this.includeIbl) {
      this.iblBuffer = device.createBuffer({
        label: 'ibl params',
        size: 80,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      entries.push(
        {
          binding: 7,
          resource: irradianceMap!.createView({ dimension: 'cube' }),
        },
        {
          binding: 8,
          resource: specularMap!.createView({ dimension: 'cube' }),
        },
        { binding: 9, resource: brdfLut!.createView() },
        // linear-clamped, so the roughness chain interpolates between levels
        // rather than snapping, and the BRDF map does not wrap at its edges.
        {
          binding: 10,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        { binding: 11, resource: { buffer: this.iblBuffer } }
      );
    }

    this.bindGroup = device.createBindGroup({
      layout: pipelineLayout,
      entries,
    });
  }

  prepare(
    renderer: Renderer,
    camera: Camera,
    _meshes: IVisualComponent[]
  ): void {
    const { device } = renderer;
    if (
      !this.cloudBuffer ||
      !this.directionalBuffer ||
      !this.spotBuffer ||
      !this.bindGroup
    )
      return;

    // Either source can replace its texture — the sky rebuilds the cloud shadow
    // map if its resolution changes, and the shadow atlas is recreated with the
    // cascade config. The bind group would go on sampling the old texture, which
    // nothing renders into any more: shadows frozen mid-drift, no error. The
    // tracker checks this flag before prepare() each frame, so flagging here
    // costs one stale frame and then self-heals.
    if (
      this.boundCloudShadowMap !== renderer.cloudShadowMap ||
      this.boundShadowAtlas !== renderer.shadowAtlas ||
      (this.includeIbl && this.boundIrradianceMap !== renderer.iblIrradianceMap)
    ) {
      this.requiresBuild = true;
    }

    // --- Sky IBL ---
    // The cubes themselves are written by the prefilter, so nothing per-frame is
    // needed for them. What is needed is the rotation that takes a view-space
    // direction into the world space they are indexed in, which changes as soon
    // as the camera turns.
    if (this.includeIbl && this.iblBuffer) {
      this.iblData.set(camera.transform.matrixWorld.elements, 0);
      this.iblData[16] = renderer.iblIntensity;
      this.iblData[17] = SKY_CUBE_MIP_COUNT - 1;
      this.iblInts[18] = renderer.materialDebugChannel;
      const exposure = camera.exposure;
      this.iblData[19] = exposure > 1e-6 ? 1 / exposure : 1;
      device.queue.writeBuffer(this.iblBuffer, 0, this.iblData.buffer);
    }

    // --- Cloud shadow ---
    const shadowRenderer = renderer.sky?.skyRenderer?.cloudShadowRenderer;
    if (shadowRenderer) {
      this.cloudData.set(camera.transform.matrixWorld.elements, 0);
      this.cloudData[16] = shadowRenderer.config.worldSize;
      this.cloudData[17] = camera.transform.position.x;
      this.cloudData[18] = camera.transform.position.z;
      this.cloudData[19] = renderer.sky.skyRenderer.cloudShadowIntensity;
      device.queue.writeBuffer(this.cloudBuffer, 0, this.cloudData.buffer);
    }

    // --- Directional shadow (CSM) ---
    const dirShadowRenderer = renderer.directionalShadowRenderer;
    if (dirShadowRenderer) {
      // lightMVPFromView[i] = lightVPs[i] * camera.matrixWorld
      // Transforms a view-space position into cascade i's light clip space.
      for (let i = 0; i < NUM_CASCADES; i++) {
        _tempMat.multiplyMatrices(
          dirShadowRenderer.lightVPs[i],
          camera.transform.matrixWorld
        );
        this.directionalFloats.set(_tempMat.elements, i * 16);
      }
      this.directionalFloats.set(
        dirShadowRenderer.cascadeSplitDistances,
        NUM_CASCADES * 16
      );
      // debugMode is at byte offset 208 (float index 52 = u32 index 52).
      this.directionalInts[52] = dirShadowRenderer.debugMode ? 1 : 0;
      device.queue.writeBuffer(this.directionalBuffer, 0, this.directionalData);
    }

    // --- Spot light shadow ---
    // Two independent systems must agree before the shader may use the spot
    // shadow: the shadow renderer found a castShadow spot in the scene
    // (hasSpotShadow), AND Lighting.prepare actually packed that light into
    // this frame's light buffer (index >= 0). They can disagree — e.g. the
    // light-budget once dropped the flashlight while its shadow map still
    // rendered — and writing -1 into the u32 index then made the shader read a
    // zeroed light slot. Treat "not packed" as "no spot shadow".
    const spotRenderer = renderer.spotLightShadowRenderer;
    if (
      spotRenderer?.hasSpotShadow &&
      renderer.shadowCastingSpotLightIndex >= 0
    ) {
      // lightMVPFromView = lightVP * camera.matrixWorld
      // Transforms a view-space position into spot light clip space.
      _tempMat.multiplyMatrices(
        spotRenderer.lightVP,
        camera.transform.matrixWorld
      );
      this.spotFloats.set(_tempMat.elements, 0);
      this.spotInts[16] = renderer.shadowCastingSpotLightIndex;
      this.spotInts[17] = 1; // hasSpotShadow = true
      this.spotInts[18] = 0;
      this.spotInts[19] = 0;
    } else {
      this.spotInts[17] = 0; // hasSpotShadow = false — shader skips PCF
    }
    device.queue.writeBuffer(this.spotBuffer, 0, this.spotData);
  }
}
