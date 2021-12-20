// import { Texture } from "./Texture";
// import {
//   NearestFilter,
//   UnsignedShortType,
//   UnsignedInt248Type,
//   DepthFormat,
//   DepthStencilFormat,
//   PixelType,
//   Mapping,
//   Wrapping,
//   TextureFilter,
//   PixelFormat,
// } from "../_constants";

// export class DepthTexture extends Texture {
//   isDepthTexture: boolean = true;

//   constructor(
//     width: u32,
//     height: u32,
//     type: PixelType,
//     mapping: Mapping,
//     wrapS: Wrapping,
//     wrapT: Wrapping,
//     magFilter: TextureFilter,
//     minFilter: TextureFilter,
//     anisotropy: f32,
//     format: PixelFormat
//   ) {
//     format = format !== undefined ? format : DepthFormat;

//     if (format !== DepthFormat && format !== DepthStencilFormat) {
//       throw new Error(
//         "DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat"
//       );
//     }

//     if (type === undefined && format === DepthFormat) type = UnsignedShortType;
//     if (type === undefined && format === DepthStencilFormat)
//       type = UnsignedInt248Type;

//     super(
//       null,
//       mapping,
//       wrapS,
//       wrapT,
//       magFilter,
//       minFilter,
//       format,
//       type,
//       anisotropy
//     );

//     this.image = { width: width, height: height };

//     this.magFilter = magFilter !== undefined ? magFilter : NearestFilter;
//     this.minFilter = minFilter !== undefined ? minFilter : NearestFilter;

//     this.flipY = false;
//     this.generateMipmaps = false;
//   }
// }
