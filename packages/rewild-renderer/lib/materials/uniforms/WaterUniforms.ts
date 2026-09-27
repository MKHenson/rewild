import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { Camera } from '../../core/Camera';
import { Mesh } from '../../core/Mesh';
import { MAX_WATER_TYPES, WaterType } from '../../renderers/terrain/Water';

// WaterParams layout — must match water.wgsl:
//   texels      f32               offset 0
//   roughness   f32               offset 4
//   originX     f32               offset 8
//   originZ     f32               offset 12
//   scatter     array<vec4f, 4>   offset 16
//   extinction  array<vec4f, 4>   offset 80
//   baseLevel   f32               offset 144
const SCATTER_OFFSET = 4;
const EXTINCTION_OFFSET = SCATTER_OFFSET + MAX_WATER_TYPES * 4;
const BASE_LEVEL_OFFSET = EXTINCTION_OFFSET + MAX_WATER_TYPES * 4;
const PARAMS_FLOATS = BASE_LEVEL_OFFSET + 4;

/** Where a chunk's water sits: its centre in world xz, and the world height
 *  its levels are relative to. */
export interface WaterGridPlacement {
  originX: number;
  originZ: number;
  baseLevel: number;
}

// Perceptual roughness of the calm surface. The floor the BRDF allows is 0.045.
export const WATER_ROUGHNESS = 0.06;

/** Packs a water palette into WaterParams. Unused slots stay zero. */
export function packWaterParams(
  palette: readonly WaterType[],
  texels: number,
  grid: WaterGridPlacement,
  out: Float32Array = new Float32Array(PARAMS_FLOATS)
): Float32Array {
  out.fill(0);
  out[0] = texels;
  out[1] = WATER_ROUGHNESS;
  out[2] = grid.originX;
  out[3] = grid.originZ;
  out[BASE_LEVEL_OFFSET] = grid.baseLevel;
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
  private _grid: WaterGridPlacement = { originX: 0, originZ: 0, baseLevel: 0 };
  private _wavesBuffer: GPUBuffer | null = null;
  private _paramsBuffer: GPUBuffer | null = null;
  private _paramsData = new Float32Array(PARAMS_FLOATS);
  private _refraction: GPUTexture | null = null;

  /** `refracts`: bind the renderer's refraction capture, for the pipeline
   *  whose shader reads it. A pipeline built with `layout: 'auto'` rejects a
   *  binding it does not use. */
  constructor(group: number, readonly refracts = false) {
    this.group = group;
  }

  /** True when the capture this was built with has since been replaced. */
  isStale(renderer: Renderer): boolean {
    return this.refracts && this._refraction !== renderer.refraction.texture;
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

  set grid(grid: WaterGridPlacement) {
    this._grid = grid;
    this.requiresBuild = true;
  }

  /** The shared Waves uniform (WaterWaveBuffer). */
  set wavesBuffer(buffer: GPUBuffer) {
    this._wavesBuffer = buffer;
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
    packWaterParams(this._palette, surface.width, this._grid, this._paramsData);
    device.queue.writeBuffer(this._paramsBuffer, 0, this._paramsData);

    const entries: GPUBindGroupEntry[] = [
      {
        binding: 0,
        resource: renderer.samplerManager.get('linear-clamped'),
      },
      { binding: 1, resource: surface.createView() },
      { binding: 2, resource: { buffer: this._paramsBuffer } },
      { binding: 3, resource: this._typeTexture!.createView() },
      { binding: 4, resource: { buffer: this._wavesBuffer! } },
    ];
    if (this.refracts) {
      this._refraction = renderer.refraction.texture;
      entries.push({ binding: 5, resource: this._refraction!.createView() });
    }
    this.bindGroup = device.createBindGroup({
      label: 'water surface',
      layout: pipelineLayout,
      entries,
    });

    this.requiresBuild = false;
  }

  setNumInstances(numInstances: number): void {}
  prepare(renderer: Renderer, camera: Camera, meshes: Mesh[]): void {}
}
