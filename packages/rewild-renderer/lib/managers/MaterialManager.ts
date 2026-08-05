import { Color } from 'rewild-common';
import { LambertInstancedPass } from '../materials/LambertInstancedPass';
import { LambertPass } from '../materials/LambertPass';
import { PhongPass } from '../materials/PhongPass';
import { GizmoPass } from '../materials/GizmoPass';
import { IMaterialPass } from '../materials/IMaterialPass';
import { SpritePass } from '../materials/SpritePass';
import { WireframePass } from '../materials/WireframePass';
import { Renderer } from '../Renderer';
import { IMaterialsTemplate, IStandardMaterialTemplate } from './types';
import { UIElementPass } from '../materials/UIElementPass';
import { UIElementHealthPass } from '../materials/UIElementHealthPass';
import { StandardPass } from '../materials/StandardPass';
import { StandardInstancedPass } from '../materials/StandardInstancedPass';
import { ALPHA_MODES } from '../materials/uniforms/StandardMaterial';

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
            pass.material.diffuseTexture = renderer.textureManager.get(
              t.diffuseMap
            ).gpuTexture;
          if (t.emissiveMap)
            pass.material.emissiveTexture = renderer.textureManager.get(
              t.emissiveMap
            ).gpuTexture;
          if (t.emissiveColor) pass.material.emissiveColor = t.emissiveColor;
          if (t.emissiveIntensity !== undefined)
            pass.material.emissiveIntensity = t.emissiveIntensity;
          if (t.ambientColor) pass.material.ambientColor = t.ambientColor;
          materialPass = pass;
          break;
        }
        case 'lambert-instanced': {
          const pass = new LambertInstancedPass();
          if (t.diffuseMap)
            pass.diffuse.texture = renderer.textureManager.get(
              t.diffuseMap
            ).gpuTexture;
          materialPass = pass;
          break;
        }
        case 'phong': {
          const pass = new PhongPass();
          if (t.diffuseMap)
            pass.material.diffuseTexture = renderer.textureManager.get(
              t.diffuseMap
            ).gpuTexture;
          if (t.normalMap)
            pass.material.normalTexture = renderer.textureManager.get(
              t.normalMap
            ).gpuTexture;
          if (t.specularMap)
            pass.material.specularTexture = renderer.textureManager.get(
              t.specularMap
            ).gpuTexture;
          if (t.emissiveMap)
            pass.material.emissiveTexture = renderer.textureManager.get(
              t.emissiveMap
            ).gpuTexture;
          if (t.specularColor) pass.material.specularColor = t.specularColor;
          if (t.shininess !== undefined) pass.material.shininess = t.shininess;
          if (t.emissiveColor) pass.material.emissiveColor = t.emissiveColor;
          if (t.emissiveIntensity !== undefined)
            pass.material.emissiveIntensity = t.emissiveIntensity;
          if (t.ambientColor) pass.material.ambientColor = t.ambientColor;
          materialPass = pass;
          break;
        }
        case 'standard':
        case 'standard-instanced':
          materialPass = createStandardPass(renderer, t);
          break;
        case 'wireframe':
          materialPass = new WireframePass();
          (materialPass as WireframePass).wireframeUniforms.color =
            new Color().setRGB(
              t.color?.[0] ?? 1,
              t.color?.[1] ?? 1,
              t.color?.[2] ?? 1
            );
          (materialPass as WireframePass).wireframeUniforms.opacity =
            t.opacity || 1;
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
          (materialPass as SpritePass).spriteUniforms.diffuseColor =
            new Color().setRGB(
              t.color?.[0] ?? 1,
              t.color?.[1] ?? 1,
              t.color?.[2] ?? 1
            );
          (materialPass as SpritePass).spriteUniforms.diffuseAlpha =
            t.opacity ?? 1;
          if (t.diffuseMap)
            (materialPass as SpritePass).spriteUniforms.texture =
              renderer.textureManager.get(t.diffuseMap).gpuTexture;
          break;
        default:
          throw new Error(
            `Unknown material type: ${(t as { type: string }).type}`
          );
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

/**
 * A standard material is enough parameters that inlining it in the switch
 * would bury the other five types, so it gets a function.
 *
 * Every field is optional and every default lives on StandardMaterial, so a
 * `{ name, type }` entry is glTF's default material: white, dielectric, half
 * rough. Only what the template names is written.
 *
 * One function for both the per-mesh and instanced passes, because the template
 * is the same in both cases — the choice between them is about how the meshes
 * are drawn, not about what the material is.
 */
function createStandardPass(
  renderer: Renderer,
  t: IStandardMaterialTemplate
): StandardPass | StandardInstancedPass {
  const pass =
    t.type === 'standard-instanced'
      ? new StandardInstancedPass()
      : new StandardPass();
  const { material } = pass;
  const texture = (name?: string) =>
    name === undefined
      ? undefined
      : renderer.textureManager.get(name).gpuTexture;

  const baseColor = texture(t.baseColorMap);
  const normal = texture(t.normalMap);
  const metallicRoughness = texture(t.metallicRoughnessMap);
  const occlusion = texture(t.occlusionMap);
  const emissive = texture(t.emissiveMap);

  if (baseColor) material.baseColorTexture = baseColor;
  if (normal) material.normalTexture = normal;
  if (metallicRoughness) material.metallicRoughnessTexture = metallicRoughness;
  if (occlusion) material.occlusionTexture = occlusion;
  if (emissive) material.emissiveTexture = emissive;

  // glTF carries opacity as baseColorFactor's fourth component; this schema
  // splits it out under the name the other material types already use.
  if (t.baseColorFactor || t.opacity !== undefined) {
    const rgb = t.baseColorFactor ?? [1, 1, 1];
    material.baseColorFactor = [rgb[0], rgb[1], rgb[2], t.opacity ?? 1];
  }

  if (t.metallic !== undefined) material.metallic = t.metallic;
  if (t.roughness !== undefined) material.roughness = t.roughness;
  if (t.emissiveColor) material.emissiveColor = t.emissiveColor;
  if (t.emissiveStrength !== undefined)
    material.emissiveStrength = t.emissiveStrength;
  if (t.occlusionStrength !== undefined)
    material.occlusionStrength = t.occlusionStrength;
  if (t.normalScale !== undefined) material.normalScale = t.normalScale;
  if (t.ambientColor) material.ambientColor = t.ambientColor;
  if (t.alphaCutoff !== undefined) material.alphaCutoff = t.alphaCutoff;

  if (t.alphaMode !== undefined) {
    // The template is cast, never validated, so a typo would otherwise pack an
    // out-of-range mode the shader reads as OPAQUE — a material that silently
    // loses its cutout. Same stance as the texture colour space: throw at load.
    if (!ALPHA_MODES.includes(t.alphaMode))
      throw new Error(
        `Material "${t.name}": alphaMode must be one of ${ALPHA_MODES.join(
          ', '
        )}, got "${t.alphaMode}"`
      );
    pass.alphaMode = t.alphaMode;
  }

  if (t.doubleSided !== undefined) pass.doubleSided = t.doubleSided;
  if (t.vertexColors !== undefined) pass.vertexColors = t.vertexColors;

  return pass;
}
