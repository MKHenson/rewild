import { Color } from 'rewild-common';
import { DiffuseIntancedPass } from '../materials/DiffuseIntancedPass';
import { DiffusePass } from '../materials/DiffusePass';
import { IMaterialPass } from '../materials/IMaterialPass';
import { WireframePass } from '../materials/WireframePass';
import { Renderer } from '../Renderer';
import { IMaterialsTemplate } from './types';

export interface IMaterial {
  type: 'diffuse' | 'diffuse-instanced';
  id: string;
  diffuseMap?: string;
}

export class MaterialManager {
  materials: Map<string, IMaterialPass>;
  initialized: boolean;

  constructor() {
    this.materials = new Map();
    this.initialized = false;
  }

  get(id: string) {
    const toRet = this.materials.get(id);
    if (!toRet) throw new Error(`Could not find material with id ${id}`);
    return toRet;
  }

  async initialize(renderer: Renderer, templates: IMaterialsTemplate) {
    if (this.initialized) return;

    templates.materials.forEach((materialTemplate) => {
      let materialPass: IMaterialPass;

      switch (materialTemplate.type) {
        case 'diffuse':
          materialPass = new DiffusePass();
          if (materialTemplate.diffuseMap)
            (materialPass as DiffusePass).diffuse.texture =
              renderer.textureManager.get(
                materialTemplate.diffuseMap
              ).gpuTexture;
          break;
        case 'wireframe':
          materialPass = new WireframePass();
          (materialPass as WireframePass).wireframeUniforms.color =
            new Color().setRGB(
              materialTemplate.color?.[0] ?? 1,
              materialTemplate.color?.[1] ?? 1,
              materialTemplate.color?.[2] ?? 1
            );
          (materialPass as WireframePass).wireframeUniforms.opacity =
            materialTemplate.opacity || 1;
          break;
        case 'diffuse-instanced':
          materialPass = new DiffuseIntancedPass();
          if (materialTemplate.diffuseMap)
            (materialPass as DiffuseIntancedPass).diffuse.texture =
              renderer.textureManager.get(
                materialTemplate.diffuseMap
              ).gpuTexture;
          break;
        default:
          throw new Error(`Unknown material type: ${materialTemplate.type}`);
      }

      this.addMaterial(materialTemplate.name, materialPass);
    });

    this.initialized = true;
  }

  dispose() {
    Array.from(this.materials.values()).forEach((material) => {
      material.dispose();
    });

    this.materials.clear();
    this.initialized = false;
  }

  addMaterial(id: string, material: IMaterialPass) {
    this.materials.set(id, material);
    return material;
  }
}
