import { Color } from 'rewild-common';
import { LambertInstancedPass } from '../materials/LambertInstancedPass';
import { LambertPass } from '../materials/LambertPass';
import { PhongPass } from '../materials/PhongPass';
import { GizmoPass } from '../materials/GizmoPass';
import { IMaterialPass } from '../materials/IMaterialPass';
import { SpritePass } from '../materials/SpritePass';
import { WireframePass } from '../materials/WireframePass';
import { Renderer } from '../Renderer';
import { IMaterialsTemplate } from './types';
import { UIElementPass } from '../materials/UIElementPass';
import { UIElementHealthPass } from '../materials/UIElementHealthPass';

export interface IMaterial {
  type: 'lambert' | 'lambert-instanced' | 'phong';
  id: string;
  diffuseMap?: string;
  normalMap?: string;
  specularMap?: string;
  emissiveMap?: string;
  specularColor?: [number, number, number];
  shininess?: number;
  emissiveColor?: [number, number, number];
  emissiveIntensity?: number;
  ambientColor?: [number, number, number];
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

    this.addMaterial('ui-material', new UIElementPass());
    this.addMaterial('ui-health-material', new UIElementHealthPass());

    templates.materials.forEach((t) => {
      let materialPass: IMaterialPass;

      switch (t.type) {
        case 'lambert': {
          const pass = new LambertPass();
          if (t.diffuseMap)
            pass.material.diffuseTexture = renderer.textureManager.get(t.diffuseMap).gpuTexture;
          if (t.emissiveMap)
            pass.material.emissiveTexture = renderer.textureManager.get(t.emissiveMap).gpuTexture;
          if (t.emissiveColor) pass.material.emissiveColor = t.emissiveColor;
          if (t.emissiveIntensity !== undefined) pass.material.emissiveIntensity = t.emissiveIntensity;
          if (t.ambientColor) pass.material.ambientColor = t.ambientColor;
          materialPass = pass;
          break;
        }
        case 'lambert-instanced': {
          const pass = new LambertInstancedPass();
          if (t.diffuseMap)
            pass.diffuse.texture = renderer.textureManager.get(t.diffuseMap).gpuTexture;
          materialPass = pass;
          break;
        }
        case 'phong': {
          const pass = new PhongPass();
          if (t.diffuseMap)
            pass.material.diffuseTexture = renderer.textureManager.get(t.diffuseMap).gpuTexture;
          if (t.normalMap)
            pass.material.normalTexture = renderer.textureManager.get(t.normalMap).gpuTexture;
          if (t.specularMap)
            pass.material.specularTexture = renderer.textureManager.get(t.specularMap).gpuTexture;
          if (t.emissiveMap)
            pass.material.emissiveTexture = renderer.textureManager.get(t.emissiveMap).gpuTexture;
          if (t.specularColor) pass.material.specularColor = t.specularColor;
          if (t.shininess !== undefined) pass.material.shininess = t.shininess;
          if (t.emissiveColor) pass.material.emissiveColor = t.emissiveColor;
          if (t.emissiveIntensity !== undefined) pass.material.emissiveIntensity = t.emissiveIntensity;
          if (t.ambientColor) pass.material.ambientColor = t.ambientColor;
          materialPass = pass;
          break;
        }
        case 'wireframe':
          materialPass = new WireframePass();
          (materialPass as WireframePass).wireframeUniforms.color = new Color().setRGB(
            t.color?.[0] ?? 1,
            t.color?.[1] ?? 1,
            t.color?.[2] ?? 1
          );
          (materialPass as WireframePass).wireframeUniforms.opacity = t.opacity || 1;
          break;
        case 'gizmo':
          materialPass = new GizmoPass();
          (materialPass as GizmoPass).gizmoUniforms.color = new Color().setRGB(
            t.color?.[0] ?? 1,
            t.color?.[1] ?? 1,
            t.color?.[2] ?? 1
          );
          (materialPass as GizmoPass).gizmoUniforms.opacity = t.opacity ?? 1;
          break;
        case 'sprite':
          materialPass = new SpritePass();
          (materialPass as SpritePass).spriteUniforms.diffuseColor = new Color().setRGB(
            t.color?.[0] ?? 1,
            t.color?.[1] ?? 1,
            t.color?.[2] ?? 1
          );
          (materialPass as SpritePass).spriteUniforms.diffuseAlpha = t.opacity ?? 1;
          if (t.diffuseMap)
            (materialPass as SpritePass).spriteUniforms.texture =
              renderer.textureManager.get(t.diffuseMap).gpuTexture;
          break;
        default:
          throw new Error(`Unknown material type: ${(t as { type: string }).type}`);
      }

      this.addMaterial(t.name, materialPass);
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
