import { BitmapCubeTexture } from '../textures/BitmapCubeTexture';
import { BitmapTexture } from '../textures/BitmapTexture';
import { Renderer } from '../Renderer';
import { ITexture } from '../textures/ITexture';
import { TextureProperties } from '../textures/Texture';
import { DataTexture } from '../textures/DataTexture';
import { IMaterialsTemplate } from './types';

const MEDIA_URL = process.env.MEDIA_URL;

export class TextureManager {
  textures: Map<string, ITexture>;
  initialized: boolean;

  constructor() {
    this.textures = new Map();
    this.initialized = false;
  }

  get(name: string) {
    const toRet = this.textures.get(name);
    if (!toRet) throw new Error(`Could not find asset with name ${name}`);
    return toRet;
  }

  async initialize(renderer: Renderer, template: IMaterialsTemplate) {
    if (this.initialized) return;

    template.textures.forEach((textureTemplate) => {
      let texture: ITexture;
      if (textureTemplate.type === 'cubemap' && textureTemplate.urls) {
        texture = new BitmapCubeTexture(
          new TextureProperties(textureTemplate.name),
          textureTemplate.urls.map((url) => MEDIA_URL + url)
        );
      } else if (textureTemplate.url) {
        texture = new BitmapTexture(
          new TextureProperties(textureTemplate.name),
          MEDIA_URL + textureTemplate.url
        );
      } else {
        throw new Error(
          `Texture template ${textureTemplate.name} is missing url(s)`
        );
      }
      this.textures.set(textureTemplate.name, texture);
    });

    this.createDataTextures();

    await Promise.all(
      Array.from(this.textures.values()).map((texture) => {
        return texture.load(renderer);
      })
    );

    this.initialized = true;
  }

  createDataTextures() {
    const r = [255, 0, 0, 255]; // red
    const y = [255, 255, 0, 255]; // yellow
    const b = [0, 0, 255, 255]; // blue
    const dg = [200, 200, 200, 255]; // light grey
    const g = [100, 100, 100, 255]; // grey

    const fTextureWidth = 5;
    const fTextureHeight = 7;

    // prettier-ignore
    const fTextureData = new Uint8Array([
      b, r, r, r, r,
      r, y, y, y, r,
      r, y, r, r, r,
      r, y, y, r, r,
      r, y, r, r, r,
      r, y, r, r, r,
      r, r, r, r, r,
    ].flat());

    this.addTexture(
      new DataTexture(
        new TextureProperties('f-data', false),
        fTextureData,
        fTextureWidth,
        fTextureHeight
      )
    );

    const gridTextureWidth = 4;
    const gridTextureHeight = 4;

    // prettier-ignore
    const gridTextureData = new Uint8Array([
      dg, dg, g, g,
      dg, dg, g, g,
      g, g, dg, dg,
      g, g, dg, dg
    ].flat());

    this.addTexture(
      new DataTexture(
        new TextureProperties('grid-data', false),
        gridTextureData,
        gridTextureWidth,
        gridTextureHeight
      )
    );

    // Create noise texture
    const width = 256;
    const height = 256;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < data.length; i++) {
      data[i] = Math.floor(Math.random() * 255);

      // Set alpha to 255
      if (i % 4 === 3) {
        data[i] = 255;
      }
    }

    this.addTexture(
      new DataTexture(
        new TextureProperties('data-rgba-noise-256', false),
        data,
        width,
        height
      )
    );
  }

  addTexture(texture: ITexture) {
    this.textures.set(texture.properties.name, texture);
    return texture;
  }

  dispose() {
    this.textures.forEach((texture) => {
      texture.gpuTexture.destroy();
    });
    this.textures.clear();
    this.initialized = false;
  }
}
