import { BitmapCubeTexture } from "../core/textures/BitmapCubeTexture";
import { BitmapTexture } from "../core/textures/BitmapTexture";
import { Texture } from "../core/textures/Texture";

const MEDIA_URL = process.env.MEDIA_URL;

class TextureManager {
  textures: Texture[];

  async init(device: GPUDevice) {
    // TEXTURES
    const textures: Texture[] = [
      new BitmapTexture("grid", MEDIA_URL + "uv-grid.jpg", device),
      new BitmapTexture("crate", MEDIA_URL + "crate-wooden.jpg", device),
      new BitmapTexture("earth", MEDIA_URL + "earth-day-2k.jpg", device),
      new BitmapTexture(
        "ground-coastal-1",
        MEDIA_URL + "nature/dirt/TexturesCom_Ground_Coastal1_2x2_1K_albedo.png",
        device
      ),
      new BitmapTexture(
        "block-concrete-4",
        MEDIA_URL + "construction/walls/TexturesCom_Wall_BlockConcrete4_2x2_B_1K_albedo.png",
        device
      ),
      new BitmapCubeTexture(
        "desert-sky",
        [
          MEDIA_URL + "skyboxes/desert/px.jpg",
          MEDIA_URL + "skyboxes/desert/nx.jpg",
          MEDIA_URL + "skyboxes/desert/py.jpg",
          MEDIA_URL + "skyboxes/desert/ny.jpg",
          MEDIA_URL + "skyboxes/desert/pz.jpg",
          MEDIA_URL + "skyboxes/desert/nz.jpg",
        ],
        device
      ),
      new BitmapCubeTexture(
        "starry-sky",
        [
          MEDIA_URL + "skyboxes/stars/left.png",
          MEDIA_URL + "skyboxes/stars/right.png",
          MEDIA_URL + "skyboxes/stars/top.png",
          MEDIA_URL + "skyboxes/stars/bottom.png",
          MEDIA_URL + "skyboxes/stars/front.png",
          MEDIA_URL + "skyboxes/stars/back.png",
        ],
        device
      ),
    ];

    this.textures = await Promise.all(
      textures.map((texture) => {
        return texture.load(device);
      })
    );
  }

  find(name: string) {
    return this.textures.find((texture) => texture.name === name);
  }
}

export const textureManager = new TextureManager();
