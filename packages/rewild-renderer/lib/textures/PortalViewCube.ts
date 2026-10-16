import type { Renderer } from '../Renderer';

/** Faces in a portal view strip, left to right: +X, -X, +Y, -Y, +Z, -Z. */
export const PORTAL_VIEW_FACES = 6;

/**
 * Forward and up of a camera that renders each cube face, in the order of
 * PORTAL_VIEW_FACES. Cube sampling is left-handed and a camera right-handed, so
 * a face rendered this way is mirrored left to right against the cube.
 */
// prettier-ignore
export const PORTAL_VIEW_FACE_AXES: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [ 1,  0,  0,   0, 1,  0],
  [-1,  0,  0,   0, 1,  0],
  [ 0,  1,  0,   0, 0, -1],
  [ 0, -1,  0,   0, 0,  1],
  [ 0,  0,  1,   0, 1,  0],
  [ 0,  0, -1,   0, 1,  0],
];

/** Uploads a strip of six square faces as an sRGB cube with a full mip chain. */
export function createPortalViewCube(
  renderer: Renderer,
  strip: ImageBitmap
): GPUTexture {
  const { device } = renderer;
  const size = strip.height;
  const texture = device.createTexture({
    label: 'portal view cube',
    size: [size, size, PORTAL_VIEW_FACES],
    mipLevelCount: Math.floor(Math.log2(size)) + 1,
    format: 'rgba8unorm-srgb',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  for (let face = 0; face < PORTAL_VIEW_FACES; face++)
    device.queue.copyExternalImageToTexture(
      { source: strip, origin: { x: face * size, y: 0 } },
      { texture, origin: { x: 0, y: 0, z: face } },
      [size, size]
    );

  for (let face = 0; face < PORTAL_VIEW_FACES; face++)
    renderer.mipmapGenerator.generateMips(device, texture, face);

  return texture;
}
