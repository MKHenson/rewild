import {
  ALPHA_MODES,
  AlphaMode,
  Mesh,
  PhongPass,
  Renderer,
  StandardPass,
  LambertPass,
} from 'rewild-renderer';

// A way to look at StandardPass on an object that is already in the scene.
//
// Since #197 a `standard` material can simply be named in materials.json, so
// this is no longer how the pass reaches the bundle. What it still does that a
// template cannot is *rebind an existing mesh*: the same crate under Phong and
// under PBR, one command apart, which is the only honest way to judge the
// shading models against each other. It also reaches parameters no material in
// the template sets, so a slot can be exercised before an asset uses it.
//
// #203's metallic x roughness grid supersedes the comparison half of this.
export function registerStandardMaterialCommands(renderer: Renderer) {
  (window as any).useStandardMaterial = (
    materialId?: string,
    metallic: number = 0,
    roughness: number = 0.5,
    maps?: {
      baseColor?: string;
      normal?: string;
      metallicRoughness?: string;
      occlusion?: string;
      emissive?: string;
      ambient?: number;
      alphaMode?: AlphaMode;
      alphaCutoff?: number;
      opacity?: number;
      doubleSided?: boolean;
      emissiveColor?: [number, number, number];
      emissiveStrength?: number;
    }
  ) => {
    if (materialId === undefined) {
      console.log(
        'useStandardMaterial(materialId, metallic = 0, roughness = 0.5, opts?) — ' +
          'rebinds every mesh using materialId onto a StandardPass.\n' +
          'opts: { baseColor, normal, metallicRoughness, occlusion, emissive } are ' +
          'textureManager names; ambient is a grey level for the placeholder ' +
          'ambient term.\n' +
          "glTF material semantics: alphaMode ('OPAQUE' | 'MASK' | 'BLEND'), " +
          'alphaCutoff, opacity (baseColorFactor alpha), doubleSided, ' +
          'emissiveColor, emissiveStrength.\n' +
          "e.g. useStandardMaterial('crate', 0, 1, { " +
          "metallicRoughness: 'block-concrete-4-roughness', " +
          "occlusion: 'block-concrete-4-ao', ambient: 0.3 })\n" +
          "e.g. useStandardMaterial('alient-plant', 0, 0.8, { " +
          "alphaMode: 'MASK', alphaCutoff: 0.5, doubleSided: true })"
      );
      return;
    }

    let source;
    try {
      source = renderer.materialManager.get(materialId);
    } catch {
      console.warn(`No material with id "${materialId}"`);
      return;
    }

    if (!Number.isFinite(metallic) || metallic < 0 || metallic > 1) {
      console.warn(`metallic must be between 0 and 1, got ${metallic}`);
      return;
    }
    if (!Number.isFinite(roughness) || roughness < 0 || roughness > 1) {
      console.warn(`roughness must be between 0 and 1, got ${roughness}`);
      return;
    }

    const pass = new StandardPass();
    pass.material.metallic = metallic;
    pass.material.roughness = roughness;

    // Carry over whatever maps the source pass had, so the comparison is
    // between the two shading models rather than between two texture sets.
    // Both fall back to their own neutral defaults when the source has none.
    if (source instanceof PhongPass || source instanceof LambertPass) {
      if (source.material.diffuseTexture)
        pass.material.baseColorTexture = source.material.diffuseTexture;
      if (source.material.emissiveTexture)
        pass.material.emissiveTexture = source.material.emissiveTexture;
    }
    if (source instanceof PhongPass && source.material.normalTexture) {
      pass.material.normalTexture = source.material.normalTexture;
    }

    // Explicit maps win over whatever came off the source pass. There is no
    // material in the bucket carrying a metallic-roughness or occlusion map of
    // its own yet, so this is the only way to exercise those two slots.
    const named = (name?: string) =>
      name === undefined ? undefined : renderer.textureManager.get(name).gpuTexture;

    try {
      const baseColor = named(maps?.baseColor);
      const normal = named(maps?.normal);
      const metallicRoughness = named(maps?.metallicRoughness);
      const occlusion = named(maps?.occlusion);
      const emissive = named(maps?.emissive);

      if (baseColor) pass.material.baseColorTexture = baseColor;
      if (normal) pass.material.normalTexture = normal;
      if (metallicRoughness)
        pass.material.metallicRoughnessTexture = metallicRoughness;
      if (occlusion) pass.material.occlusionTexture = occlusion;
      if (emissive) pass.material.emissiveTexture = emissive;
    } catch (err) {
      console.warn(`${(err as Error).message} — no meshes were changed.`);
      return;
    }

    // Occlusion only affects indirect light, so without an ambient term an
    // occlusion map does nothing at all. Offering the knob here is what makes
    // that slot observable before #201's IBL provides a real indirect term.
    if (maps?.ambient !== undefined) {
      pass.material.ambientColor = [maps.ambient, maps.ambient, maps.ambient];
    }

    if (maps?.alphaMode !== undefined) {
      if (!ALPHA_MODES.includes(maps.alphaMode)) {
        console.warn(
          `alphaMode must be one of ${ALPHA_MODES.join(', ')}, got ${maps.alphaMode}`
        );
        return;
      }
      pass.alphaMode = maps.alphaMode;
    }
    if (maps?.alphaCutoff !== undefined)
      pass.material.alphaCutoff = maps.alphaCutoff;
    // Opacity is baseColorFactor's fourth component, and it only reaches the
    // frame in BLEND — in OPAQUE or MASK the shader writes 1.0 whatever it says.
    if (maps?.opacity !== undefined)
      pass.material.baseColorFactor = [1, 1, 1, maps.opacity];
    if (maps?.doubleSided !== undefined) pass.doubleSided = maps.doubleSided;
    if (maps?.emissiveColor !== undefined)
      pass.material.emissiveColor = maps.emissiveColor;
    if (maps?.emissiveStrength !== undefined)
      pass.material.emissiveStrength = maps.emissiveStrength;

    // The renderer calls init() lazily on any pass whose requiresRebuild is
    // set, so there is nothing to build here.
    let rebound = 0;
    renderer.scene.traverse((transform) => {
      const component = transform.component;
      if (component instanceof Mesh && component.material === source) {
        component.setMaterial(pass);
        rebound++;
      }
    });

    if (rebound === 0) {
      console.warn(
        `Material "${materialId}" exists but no mesh in the scene is using it.`
      );
      return;
    }

    console.log(
      `${rebound} mesh(es) using "${materialId}" → StandardPass ` +
        `(metallic=${metallic}, roughness=${roughness})`
    );
  };
}
