import { BitmapCubeTexture } from '../textures/BitmapCubeTexture';
import { BitmapTexture } from '../textures/BitmapTexture';
import { Renderer } from '../Renderer';
import { ITexture } from '../textures/ITexture';
import { TextureProperties } from '../textures/Texture';
import { DataTexture } from '../textures/DataTexture';
import { IMaterialsTemplate } from './types';

const MEDIA_URL = process.env.SHARED_ASSETS_BASE_URL;

// Resolves a materials.json `url` against the shared asset bucket. Exported so
// loaders that build textures from the template outside this manager (the
// terrain material arrays) resolve them the same way.
export function resolveAssetUrl(url: string): string {
  return MEDIA_URL + url;
}

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

    this.createSmoothNoiseTexture();

    this.addTexture(
      new DataTexture(
        new TextureProperties('white-1x1', false),
        new Uint8Array([255, 255, 255, 255]),
        1,
        1
      )
    );

    // Flat normal: (0.5, 0.5, 1.0) in [0,1] = tangent-space (0,0,1)
    this.addTexture(
      new DataTexture(
        new TextureProperties('flat-normal-1x1', false),
        new Uint8Array([128, 128, 255, 255]),
        1,
        1
      )
    );

    const glowSize = 64;
    const half = glowSize / 2;
    const glowData = new Uint8Array(glowSize * glowSize * 4);
    for (let y = 0; y < glowSize; y++) {
      for (let x = 0; x < glowSize; x++) {
        const dx = (x - half + 0.5) / half;
        const dy = (y - half + 0.5) / half;
        const d = Math.sqrt(dx * dx + dy * dy);
        const t = Math.max(0, 1 - d);
        const i = (y * glowSize + x) * 4;
        glowData[i] = 255;
        glowData[i + 1] = 255;
        glowData[i + 2] = 255;
        glowData[i + 3] = Math.round(t * t * 255);
      }
    }
    this.addTexture(
      new DataTexture(
        new TextureProperties('point-light-glow', false),
        glowData,
        glowSize,
        glowSize
      )
    );
  }

  // Smooth, tileable, low-frequency value noise.
  //
  // Distinct from `data-rgba-noise-256`, which is *white* noise — every texel
  // independently random. A stochastic no-tile blend (terrain.wgsl) indexes its
  // offset regions from a field like this and needs it smooth: with white noise
  // the region index changes every texel, chopping the surface into tiny
  // patches sampled from unrelated parts of the texture. That reads as a
  // warbling, swirling mess wherever the material is stretched enough to see
  // the patch edges.
  //
  // Built by interpolating a coarse grid of random values with a smoothstep
  // fade and wrapping at the edges, so the result tiles seamlessly. Seeded, so
  // terrain looks the same every session rather than reshuffling on reload.
  private createSmoothNoiseTexture() {
    const size = 256;
    const cells = 16; // Grid of random values; a feature every size/cells texels.

    let seed = 1337;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const grid = new Float32Array(cells * cells);
    for (let i = 0; i < grid.length; i++) grid[i] = random();

    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        // Wrap the far edge back to the first cell so the texture tiles.
        const x1 = (x0 + 1) % cells;
        const y1 = (y0 + 1) % cells;

        // Smoothstep the interpolant: plain bilinear leaves visible diamond
        // creases along the cell grid.
        let tx = fx - x0;
        let ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);

        const top =
          grid[y0 * cells + x0] +
          (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * tx;
        const bottom =
          grid[y1 * cells + x0] +
          (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * tx;
        const value = Math.round((top + (bottom - top) * ty) * 255);

        const i = (y * size + x) * 4;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 255;
      }
    }

    this.addTexture(
      new DataTexture(
        new TextureProperties('smooth-noise-256'),
        data,
        size,
        size
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
