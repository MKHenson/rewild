import { DiffuseIntancedPass } from '../materials/DiffuseIntancedPass';
import { DiffusePass } from '../materials/DiffusePass';
import { IMaterialPass } from '../materials/IMaterialPass';
import { Renderer } from '../Renderer';

export interface IMaterial {
  type: 'diffuse' | 'diffuse-instanced';
  id: string;
  diffuseMap?: string;
}

const allMaterials: IMaterial[] = [
  {
    id: 'crate',
    type: 'diffuse',
    diffuseMap: 'crate',
  },
  {
    id: 'basketball',
    type: 'diffuse',
    diffuseMap: 'basketball',
  },
  {
    id: 'earth',
    type: 'diffuse',
    diffuseMap: 'earth',
  },
];

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

  async initialize(renderer: Renderer) {
    if (this.initialized) return;

    for (const material of allMaterials) {
      let materialPass: IMaterialPass;

      switch (material.type) {
        case 'diffuse':
          materialPass = new DiffusePass();
          if (material.diffuseMap)
            (materialPass as DiffusePass).diffuse.texture =
              renderer.textureManager.get(material.diffuseMap).gpuTexture;
          break;
        case 'diffuse-instanced':
          materialPass = new DiffuseIntancedPass();
          if (material.diffuseMap)
            (materialPass as DiffuseIntancedPass).diffuse.texture =
              renderer.textureManager.get(material.diffuseMap).gpuTexture;
          break;
        default:
          throw new Error(`Unknown material type: ${material.type}`);
      }

      this.addMaterial(material.id, materialPass);
    }

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
