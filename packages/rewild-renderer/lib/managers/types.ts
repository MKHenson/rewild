import { TextureColorSpace } from '../textures/Texture';

export interface IMaterialsTemplate {
  textures: {
    name: string;
    type?: 'texture' | 'cubemap';
    url?: string;
    urls?: string[];
    /**
     * Required, with no default: sampling an sRGB file as though it were
     * linear is invisible in the source and only shows up as washed-out
     * shading, so a missing declaration throws at load rather than guessing.
     *
     * `srgb` for anything the eye reads as colour, `linear` for data maps.
     * One exception worth knowing — textures consumed by the sprite, gizmo and
     * UI passes are `linear` even when they are colour. Those passes draw
     * straight to the non-sRGB swapchain with no encode on the way out (see
     * `Renderer.sceneColorFormat`), so their bytes have to pass through
     * untouched. Decoding them would land linear values in a buffer the
     * display reads as sRGB.
     */
    colorSpace: TextureColorSpace;
  }[];
  materials: {
    name: string;
    type: 'lambert' | 'lambert-instanced' | 'phong' | 'wireframe' | 'gizmo' | 'sprite';
    diffuseMap?: string;
    normalMap?: string;
    specularMap?: string;
    emissiveMap?: string;
    color?: [number, number, number];
    opacity?: number;
    specularColor?: [number, number, number];
    shininess?: number;
    emissiveColor?: [number, number, number];
    emissiveIntensity?: number;
    ambientColor?: [number, number, number];
  }[];
}

export interface IGeometryTemplates {
  [name: string]: {
    type: string;
    url: string;
  };
}
