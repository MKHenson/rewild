import {
  Mesh,
  PhongPass,
  Renderer,
  StandardPass,
  LambertPass,
} from 'rewild-renderer';

// A way to actually look at StandardPass before anything else can reach it.
//
// The pass is deliberately not wired into materials.json yet — that schema work
// is #197, and the metallic x roughness reference grid is #203. Without one of
// those, nothing in the app ever constructs a StandardPass, so esbuild strips
// it from the bundle and its shader is never even compiled. This command is the
// stopgap: it rebinds meshes that are already in the scene, so a familiar
// object can be compared against its Phong version directly.
//
// Expected to be deleted once #197 lands and a `standard` material can simply
// be named in the template.
export function registerStandardMaterialCommands(renderer: Renderer) {
  (window as any).useStandardMaterial = (
    materialId?: string,
    metallic: number = 0,
    roughness: number = 0.5
  ) => {
    if (materialId === undefined) {
      console.log(
        'useStandardMaterial(materialId, metallic = 0, roughness = 0.5) — ' +
          'rebinds every mesh using materialId onto a StandardPass'
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
