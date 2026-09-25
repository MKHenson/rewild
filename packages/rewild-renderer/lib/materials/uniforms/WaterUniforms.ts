import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';
import { MAX_WATER_TYPES, WaterType } from '../../renderers/terrain/Water';

// WaterParams layout — must match water.wgsl:
//   texels      f32               offset 0
//   roughness   f32               offset 4
//   scatter     array<vec4f, 4>   offset 16
//   extinction  array<vec4f, 4>   offset 80
const SCATTER_OFFSET = 4;
const EXTINCTION_OFFSET = SCATTER_OFFSET + MAX_WATER_TYPES * 4;
const PARAMS_FLOATS = EXTINCTION_OFFSET + MAX_WATER_TYPES * 4;

// Perceptual roughness of the calm surface. The floor the BRDF allows is 0.045.
const WATER_ROUGHNESS = 0.06;

/** Packs a water palette into WaterParams. Unused slots stay zero. */
export function packWaterParams(
  palette: readonly WaterType[],
  texels: number,
  out: Float32Array = new Float32Array(PARAMS_FLOATS)
): Float32Array {
  out.fill(0);
  out[0] = texels;
  out[1] = WATER_ROUGHNESS;
  for (let i = 0; i < Math.min(palette.length, MAX_WATER_TYPES); i++) {
    const type = palette[i];
    const s = SCATTER_OFFSET + i * 4;
    out[s] = type.scatter[0];
    out[s + 1] = type.scatter[1];
    out[s + 2] = type.scatter[2];
    const e = EXTINCTION_OFFSET + i * 4;
    out[e] = type.absorption[0];
    out[e + 1] = type.absorption[1];
    out[e + 2] = type.absorption[2];
    out[e + 3] = type.turbidity;
  }
  return out;
}

export class WaterUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean = true;

  private _surfaceTexture: GPUTexture | null = null;
  private _typeTexture: GPUTexture | null = null;
  private _palette: readonly WaterType[] = [];
  private _paramsBuffer: GPUBuffer | null = null;
  private _paramsData = new Float32Array(PARAMS_FLOATS);

  constructor(group: number) {
    this.group = group;
  }

  setTextures(surface: GPUTexture, types: GPUTexture) {
    this._surfaceTexture = surface;
    this._typeTexture = types;
    this.requiresBuild = true;
  }

  set palette(palette: readonly WaterType[]) {
    this._palette = palette;
    this.requiresBuild = true;
  }

  destroy(): void {
    this._paramsBuffer?.destroy();
    this._paramsBuffer = null;
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    const surface = this._surfaceTexture!;

    this._paramsBuffer?.destroy();
    this._paramsBuffer = device.createBuffer({
      label: 'water params',
      size: PARAMS_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    packWaterParams(this._palette, surface.width, this._paramsData);
    device.queue.writeBuffer(this._paramsBuffer, 0, this._paramsData);

    this.bindGroup = device.createBindGroup({
      label: 'water surface',
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: renderer.samplerManager.get('linear-clamped'),
        },
        { binding: 1, resource: surface.createView() },
        { binding: 2, resource: { buffer: this._paramsBuffer } },
        { binding: 3, resource: this._typeTexture!.createView() },
      ],
    });

    this.requiresBuild = false;
  }

  setNumInstances(numInstances: number): void {}
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {}
}
