import { BitmapCubeTexture } from '../textures/BitmapCubeTexture';
import { BitmapTexture } from '../textures/BitmapTexture';
import { Renderer } from '../Renderer';
import { ITexture } from './ITexture';
import { TextureProperties } from './Texture';
import { DataTexture } from './DataTexture';

const MEDIA_URL = process.env.MEDIA_URL;

const assets: [string, string | string[]][] = [
  ['grid', 'uv-grid.jpg'],
  ['f-texture', 'utils/f-texture.png'],
  ['bw-noise-64', 'utils/bw-noise-64.png'],
  ['pebbles-512', 'utils/pebbles-512.png'],
  ['rgba-noise-256', 'utils/rgba-noise-256.png'],
  ['crate', 'crate-wooden.jpg'],
  ['basketball', 'basketball.png'],
  ['earth', 'earth-day-2k.jpg'],
  [
    'rocky-mountain-texture-seamless',
    'nature/landscapes/rocky-mountain-texture-seamless.png',
  ],
  [
    'ground-coastal-1',
    'nature/dirt/TexturesCom_Ground_Coastal1_2x2_1K_albedo.png',
  ],
  [
    'block-concrete-4',
    'construction/walls/TexturesCom_Wall_BlockConcrete4_2x2_B_1K_albedo.png',
  ],
  [
    'desert-sky',
    [
      'skyboxes/desert/px.jpg',
      'skyboxes/desert/nx.jpg',
      'skyboxes/desert/py.jpg',
      'skyboxes/desert/ny.jpg',
      'skyboxes/desert/pz.jpg',
      'skyboxes/desert/nz.jpg',
    ],
  ],
  [
    'starry-sky',
    [
      'skyboxes/stars/left.png',
      'skyboxes/stars/right.png',
      'skyboxes/stars/top.png',
      'skyboxes/stars/bottom.png',
      'skyboxes/stars/front.png',
      'skyboxes/stars/back.png',
    ],
  ],
];

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

  async initialize(renderer: Renderer) {
    if (this.initialized) return;

    let texture: ITexture;
    for (const asset of assets) {
      if (asset[1] instanceof Array) {
        texture = new BitmapCubeTexture(
          new TextureProperties(asset[0]),
          asset[1].map((url) => MEDIA_URL + url)
        );
      } else {
        texture = new BitmapTexture(
          new TextureProperties(asset[0]),
          MEDIA_URL + asset[1]
        );
      }

      this.textures.set(asset[0], texture);
    }

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
