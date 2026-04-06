import { Color } from 'rewild-common';
import { Renderer } from '../..';
import { ISharedUniformBuffer } from '../../../types/IUniformBuffer';
import { IVisualComponent } from '../../../types/interfaces';
import { Camera } from '../../core/Camera';

export class SpriteUniforms implements ISharedUniformBuffer {
  group: number;
  bindGroup: GPUBindGroup;
  requiresBuild: boolean;
  requiresUpdate: boolean;
  buffer: GPUBuffer;

  private _diffuseColor: Color;
  private _diffuseAlpha: f32;
  private _selectionTint: Color;
  private _selectionTintAlpha: f32;
  private _valuesArray: Float32Array;

  private _texture: GPUTexture | null;
  private _sampler: GPUSampler | null;
  private _defaultTexture: GPUTexture | null;

  constructor(group: number) {
    this.group = group;
    this.requiresBuild = true;
    this.requiresUpdate = true;
    // diffuseColor (vec4f = 16 bytes) + selectionTint (vec4f = 16 bytes) = 32 bytes
    this._valuesArray = new Float32Array(8);
    this._texture = null;
    this._sampler = null;
    this._defaultTexture = null;

    this.diffuseColor = new Color(1, 1, 1);
    this.diffuseAlpha = 1.0;
    this.selectionTint = new Color(0.3, 0.5, 1.0);
    this.selectionTintAlpha = 0.4;
  }

  destroy(): void {
    if (this.buffer) {
      this.buffer.destroy();
    }
    if (this._defaultTexture) {
      this._defaultTexture.destroy();
      this._defaultTexture = null;
    }
  }

  build(renderer: Renderer, pipelineLayout: GPUBindGroupLayout): void {
    const { device } = renderer;
    this.requiresBuild = false;

    if (this.buffer) this.buffer.destroy();

    // diffuseColor (vec4f) + selectionTint (vec4f) = 32 bytes
    const uniformBufferSize = 8 * 4;
    this.buffer = device.createBuffer({
      size: uniformBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create 1x1 white default texture if no texture set
    let texture = this._texture;
    if (!texture) {
      if (!this._defaultTexture) {
        this._defaultTexture =
          renderer.textureManager.get('grid-data').gpuTexture;
      }
      texture = this._defaultTexture;
    }

    const sampler = this._sampler || renderer.samplerManager.get('linear');

    this.bindGroup = device.createBindGroup({
      label: 'sprite shared uniforms bind group',
      layout: pipelineLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.buffer },
        },
        {
          binding: 1,
          resource: sampler,
        },
        {
          binding: 2,
          resource: texture.createView(),
        },
      ],
    });
  }

  set diffuseColor(color: Color) {
    this._diffuseColor = color;
    this.requiresUpdate = true;
    this._valuesArray[0] = color.r;
    this._valuesArray[1] = color.g;
    this._valuesArray[2] = color.b;
  }

  get diffuseColor(): Color {
    return this._diffuseColor;
  }

  set diffuseAlpha(alpha: f32) {
    this._diffuseAlpha = alpha;
    this.requiresUpdate = true;
    this._valuesArray[3] = alpha;
  }

  get diffuseAlpha(): f32 {
    return this._diffuseAlpha;
  }

  set selectionTint(color: Color) {
    this._selectionTint = color;
    this.requiresUpdate = true;
    this._valuesArray[4] = color.r;
    this._valuesArray[5] = color.g;
    this._valuesArray[6] = color.b;
  }

  get selectionTint(): Color {
    return this._selectionTint;
  }

  set selectionTintAlpha(alpha: f32) {
    this._selectionTintAlpha = alpha;
    this.requiresUpdate = true;
    this._valuesArray[7] = alpha;
  }

  get selectionTintAlpha(): f32 {
    return this._selectionTintAlpha;
  }

  set texture(texture: GPUTexture | null) {
    this._texture = texture;
    this.requiresBuild = true;
  }

  get texture(): GPUTexture | null {
    return this._texture;
  }

  set sampler(sampler: GPUSampler | null) {
    this._sampler = sampler;
    this.requiresBuild = true;
  }

  get sampler(): GPUSampler | null {
    return this._sampler;
  }

  setNumInstances(numInstances: number): void {}

  prepare(
    renderer: Renderer,
    camera: Camera,
    meshes: IVisualComponent[]
  ): void {
    const { device } = renderer;
    if (this.requiresUpdate) {
      this.requiresUpdate = false;
      device.queue.writeBuffer(
        this.buffer,
        0,
        this._valuesArray.buffer,
        this._valuesArray.byteOffset,
        this._valuesArray.byteLength
      );
    }
  }
}
