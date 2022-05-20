import { EventDispatcher } from "../core/EventDispatcher";
import { Mapping, Wrapping, TextureFilter, PixelFormat, TextureDataType, TextureEncoding } from "../../common/GLEnums";
import * as MathUtils from "../../common//math/MathUtils";
import { EngineVector2 } from "../math/Vector2";
import { Matrix3 } from "../../common/math/Matrix3";
// import { ImageUtils } from "../extras/ImageUtils";
import { Event } from "../core/Event";

let textureId: u32 = 0;

type UpdateCallback = () => void;

export class Image {}

export class Texture extends EventDispatcher {
  static DEFAULT_IMAGE: Image | null = null;
  static DEFAULT_MAPPING: Mapping = Mapping.UVMapping;

  uuid: string;
  name: string;
  image: Image | null; // TODO: ?
  mipmaps: Image[]; // TODO: ?
  wrapS: Wrapping;
  wrapT: Wrapping;
  mapping: Mapping;
  magFilter: TextureFilter;
  minFilter: TextureFilter;
  anisotropy: f32;
  format: PixelFormat;
  internalFormat: PixelFormat; // TODO: THis should be null
  type: TextureDataType;
  offset: EngineVector2;
  repeat: EngineVector2;
  center: EngineVector2;
  rotation: f32;
  matrixAutoUpdate: boolean;
  matrix: Matrix3;
  encoding: TextureEncoding;
  version: i32;
  onUpdate: UpdateCallback | null;

  generateMipmaps: boolean;
  premultiplyAlpha: boolean;
  flipY: boolean;
  unpackAlignment: f32;
  readonly id: u32 = textureId++;

  isTexture: boolean = true;

  disposeEvent: Event = new Event("dispose");

  constructor(
    image: Image | null = Texture.DEFAULT_IMAGE,
    mapping: Mapping = Texture.DEFAULT_MAPPING,
    wrapS: Wrapping = Wrapping.ClampToEdgeWrapping,
    wrapT: Wrapping = Wrapping.ClampToEdgeWrapping,
    magFilter: TextureFilter = TextureFilter.LinearFilter,
    minFilter: TextureFilter = TextureFilter.LinearMipMapLinearFilter,
    format: PixelFormat = PixelFormat.RGBAFormat,
    type: TextureDataType = TextureDataType.UnsignedByteType,
    anisotropy: f32 = 1,
    encoding: TextureEncoding = TextureEncoding.LinearEncoding
  ) {
    super();

    this.uuid = MathUtils.generateUUID();

    this.name = "";

    this.image = image;
    this.mipmaps = [];
    this.mapping = mapping;

    this.wrapS = wrapS;
    this.wrapT = wrapT;

    this.magFilter = magFilter;
    this.minFilter = minFilter;

    this.anisotropy = anisotropy;

    this.format = format;
    this.internalFormat = PixelFormat.RGBAFormat;
    this.type = type;

    this.offset = new EngineVector2(0, 0);
    this.repeat = new EngineVector2(1, 1);
    this.center = new EngineVector2(0, 0);
    this.rotation = 0;

    this.matrixAutoUpdate = true;
    this.matrix = new Matrix3();

    this.generateMipmaps = true;
    this.premultiplyAlpha = false;
    this.flipY = true;
    this.unpackAlignment = 4; // valid values: 1, 2, 4, 8 (see http://www.khronos.org/opengles/sdk/docs/man/xhtml/glPixelStorei.xml)

    // Values of encoding !== THREE.LinearEncoding only supported on map, envMap and emissiveMap.
    //
    // Also changing the encoding after already used by a Material will not automatically make the Material
    // update. You need to explicitly call Material.needsUpdate to trigger it to recompile.
    this.encoding = encoding;

    this.version = 0;
    this.onUpdate = null;
    this.disposeEvent.target = this;
  }

  updateMatrix(): void {
    this.matrix.setUvTransform(
      this.offset.x,
      this.offset.y,
      this.repeat.x,
      this.repeat.y,
      this.rotation,
      this.center.x,
      this.center.y
    );
  }

  clone(): Texture {
    return new Texture().copy(this);
  }

  copy(source: Texture): Texture {
    this.name = source.name;

    this.image = source.image;
    this.mipmaps = source.mipmaps.slice(0);

    this.mapping = source.mapping;

    this.wrapS = source.wrapS;
    this.wrapT = source.wrapT;

    this.magFilter = source.magFilter;
    this.minFilter = source.minFilter;

    this.anisotropy = source.anisotropy;

    this.format = source.format;
    this.internalFormat = source.internalFormat;
    this.type = source.type;

    this.offset.copy(source.offset);
    this.repeat.copy(source.repeat);
    this.center.copy(source.center);
    this.rotation = source.rotation;

    this.matrixAutoUpdate = source.matrixAutoUpdate;
    this.matrix.copy(source.matrix);

    this.generateMipmaps = source.generateMipmaps;
    this.premultiplyAlpha = source.premultiplyAlpha;
    this.flipY = source.flipY;
    this.unpackAlignment = source.unpackAlignment;
    this.encoding = source.encoding;

    return this;
  }

  // TODO:
  //   toJSON(meta) {
  //     const isRootObject = meta === undefined || typeof meta === "string";

  //     if (!isRootObject && meta.textures[this.uuid] !== undefined) {
  //       return meta.textures[this.uuid];
  //     }

  //     const output = {
  //       metadata: {
  //         version: 4.5,
  //         type: "Texture",
  //         generator: "Texture.toJSON",
  //       },

  //       uuid: this.uuid,
  //       name: this.name,

  //       mapping: this.mapping,

  //       repeat: [this.repeat.x, this.repeat.y],
  //       offset: [this.offset.x, this.offset.y],
  //       center: [this.center.x, this.center.y],
  //       rotation: this.rotation,

  //       wrap: [this.wrapS, this.wrapT],

  //       format: this.format,
  //       type: this.type,
  //       encoding: this.encoding,

  //       minFilter: this.minFilter,
  //       magFilter: this.magFilter,
  //       anisotropy: this.anisotropy,

  //       flipY: this.flipY,

  //       premultiplyAlpha: this.premultiplyAlpha,
  //       unpackAlignment: this.unpackAlignment,
  //     };

  //     if (this.image !== undefined) {
  //       // TODO: Move to THREE.Image

  //       const image = this.image;

  //       if (image.uuid === undefined) {
  //         image.uuid = MathUtils.generateUUID(); // UGH
  //       }

  //       if (!isRootObject && meta.images[image.uuid] === undefined) {
  //         let url;

  //         if (Array.isArray(image)) {
  //           // process array of images e.g. CubeTexture

  //           url = [];

  //           for (let i = 0, l = image.length; i < l; i++) {
  //             // check cube texture with data textures

  //             if (image[i].isDataTexture) {
  //               url.push(serializeImage(image[i].image));
  //             } else {
  //               url.push(serializeImage(image[i]));
  //             }
  //           }
  //         } else {
  //           // process single image

  //           url = serializeImage(image);
  //         }

  //         meta.images[image.uuid] = {
  //           uuid: image.uuid,
  //           url: url,
  //         };
  //       }

  //       output.image = image.uuid;
  //     }

  //     if (!isRootObject) {
  //       meta.textures[this.uuid] = output;
  //     }

  //     return output;
  //   }

  dispose(): void {
    this.dispatchEvent(this.disposeEvent);
  }

  transformUv(uv: EngineVector2): EngineVector2 {
    if (this.mapping != Mapping.UVMapping) return uv;

    uv.applyMatrix3(this.matrix);

    if (uv.x < 0 || uv.x > 1) {
      switch (this.wrapS) {
        case Wrapping.RepeatWrapping:
          uv.x = uv.x - Math.floor(uv.x);
          break;

        case Wrapping.ClampToEdgeWrapping:
          uv.x = uv.x < 0 ? 0 : 1;
          break;

        case Wrapping.MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.x) % 2) === 1) {
            uv.x = Math.ceil(uv.x) - uv.x;
          } else {
            uv.x = uv.x - Math.floor(uv.x);
          }

          break;
      }
    }

    if (uv.y < 0 || uv.y > 1) {
      switch (this.wrapT) {
        case Wrapping.RepeatWrapping:
          uv.y = uv.y - Math.floor(uv.y);
          break;

        case Wrapping.ClampToEdgeWrapping:
          uv.y = uv.y < 0 ? 0 : 1;
          break;

        case Wrapping.MirroredRepeatWrapping:
          if (Math.abs(Math.floor(uv.y) % 2) === 1) {
            uv.y = Math.ceil(uv.y) - uv.y;
          } else {
            uv.y = uv.y - Math.floor(uv.y);
          }

          break;
      }
    }

    if (this.flipY) {
      uv.y = 1 - uv.y;
    }

    return uv;
  }

  set needsUpdate(value: boolean) {
    if (value === true) this.version++;
  }
}

// TODO
// function serializeImage(image) {
//   if (
//     (typeof HTMLImageElement !== "undefined" &&
//       image instanceof HTMLImageElement) ||
//     (typeof HTMLCanvasElement !== "undefined" &&
//       image instanceof HTMLCanvasElement) ||
//     (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap)
//   ) {
//     // default images

//     return ImageUtils.getDataURL(image);
//   } else {
//     if (image.data) {
//       // images of DataTexture

//       return {
//         data: Array.prototype.slice.call(image.data),
//         width: image.width,
//         height: image.height,
//         type: image.data.constructor.name,
//       };
//     } else {
//       console.warn("THREE.Texture: Unable to serialize Texture.");
//       return {};
//     }
//   }
// }
