import { AlphaMode } from '../materials/uniforms/StandardMaterial';
import { TextureColorSpace } from '../textures/Texture';

export type TemplateColor = [number, number, number];

export interface IStandardMaterialTemplate {
  name: string;
  type: 'standard' | 'standard-instanced';
  baseColorMap?: string;
  normalMap?: string;
  /** Roughness in G, metallic in B. */
  metallicRoughnessMap?: string;
  /** Occlusion in R. Name the same texture as metallicRoughnessMap to use a
   *  packed ORM atlas — glTF models it as two slots precisely so that works. */
  occlusionMap?: string;
  emissiveMap?: string;
  /** RGB only. glTF's fourth component is `opacity` below, because that is
   *  already this schema's word for alpha. */
  baseColorFactor?: TemplateColor;
  opacity?: number;
  metallic?: number;
  roughness?: number;
  /** glTF's emissiveFactor. */
  emissiveColor?: TemplateColor;
  /** KHR_materials_emissive_strength — may exceed 1. */
  emissiveStrength?: number;
  occlusionStrength?: number;
  normalScale?: number;
  /** Placeholder flat ambient; #201's IBL replaces it. */
  ambientColor?: TemplateColor;
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  /** Requires the geometry to carry COLOR_0 — a mesh without it cannot be
   *  assigned this material at all. */
  vertexColors?: boolean;
}

export interface IClassicMaterialTemplate {
  name: string;
  type:
    | 'lambert'
    | 'lambert-instanced'
    | 'phong'
    | 'wireframe'
    | 'gizmo'
    | 'sprite';
  diffuseMap?: string;
  normalMap?: string;
  specularMap?: string;
  emissiveMap?: string;
  color?: TemplateColor;
  opacity?: number;
  specularColor?: TemplateColor;
  shininess?: number;
  emissiveColor?: TemplateColor;
  emissiveIntensity?: number;
  ambientColor?: TemplateColor;
}

export type IMaterialTemplate =
  | IStandardMaterialTemplate
  | IClassicMaterialTemplate;

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
  materials: IMaterialTemplate[];
}

export interface IGeometryTemplates {
  [name: string]: {
    type: string;
    url: string;
  };
}
