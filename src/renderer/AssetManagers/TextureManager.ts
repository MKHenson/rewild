import { BitmapCubeTexture } from "../../core/textures/BitmapCubeTexture";
import { BitmapTexture } from "../../core/textures/BitmapTexture";
import { Texture } from "../../core/textures/Texture";
import { Renderer } from "../Renderer";
import { AssetManager } from "./AssetManager";

const MEDIA_URL = process.env.MEDIA_URL;

class TextureManager extends AssetManager<Texture> {
  textures: Texture[];

  async initialize(renderer: Renderer) {
    const { device } = renderer;

    const assets: [string, string | string[]][] = [
      ["grid", "uv-grid.jpg"],
      ["crate", "crate-wooden.jpg"],
      ["basketball", "basketball.png"],
      ["earth", "earth-day-2k.jpg"],
      ["ground-coastal-1", "nature/dirt/TexturesCom_Ground_Coastal1_2x2_1K_albedo.png"],
      ["block-concrete-4", "construction/walls/TexturesCom_Wall_BlockConcrete4_2x2_B_1K_albedo.png"],
      [
        "desert-sky",
        [
          "skyboxes/desert/px.jpg",
          "skyboxes/desert/nx.jpg",
          "skyboxes/desert/py.jpg",
          "skyboxes/desert/ny.jpg",
          "skyboxes/desert/pz.jpg",
          "skyboxes/desert/nz.jpg",
        ],
      ],
      [
        "starry-sky",
        [
          "skyboxes/stars/left.png",
          "skyboxes/stars/right.png",
          "skyboxes/stars/top.png",
          "skyboxes/stars/bottom.png",
          "skyboxes/stars/front.png",
          "skyboxes/stars/back.png",
        ],
      ],
    ];

    let texture: Texture;
    for (const asset of assets) {
      if (asset[1] instanceof Array) {
        texture = new BitmapCubeTexture(
          asset[0],
          asset[1].map((url) => MEDIA_URL + url),
          device
        );
      } else {
        texture = new BitmapTexture(asset[0], MEDIA_URL + asset[1], device);
      }

      this.assets.push(texture);
    }

    this.assets = await Promise.all(
      this.assets.map((texture) => {
        return texture.load(device);
      })
    );
  }

  addTexture(texture: Texture) {
    this.assets.push(texture);
    return texture;
  }
}

export const textureManager = new TextureManager();
