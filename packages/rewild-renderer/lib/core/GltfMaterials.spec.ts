import type { GLTFPostprocessed } from '@loaders.gl/gltf';
import { GltfMaterialTextures } from './GltfTextures';
import { DEFAULT_MATERIAL_ID, toMaterialTemplates } from './GltfMaterials';

const SAMPLER: GPUSamplerDescriptor = {
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
  addressModeU: 'repeat',
  addressModeV: 'repeat',
};

function gltf(...materials: Record<string, unknown>[]): GLTFPostprocessed {
  return {
    materials: materials.map((material, i) => ({
      id: `material-${i}`,
      ...material,
    })),
  } as unknown as GLTFPostprocessed;
}

function textures(
  overrides: Partial<GltfMaterialTextures> = {},
  id = 'material-0'
): GltfMaterialTextures[] {
  return [{ id, name: null, sampler: SAMPLER, ...overrides }];
}

/** The templates a file yields, minus the default one every file carries. */
function authored(gltfDoc: GLTFPostprocessed, maps = textures()) {
  return toMaterialTemplates(gltfDoc, maps).filter(
    (template) => template.gltfId !== DEFAULT_MATERIAL_ID
  );
}

describe('toMaterialTemplates', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // glTF's unspecified material is a rough white metal; StandardMaterial's own
  // defaults are a half-rough dielectric. Reading one as the other turns every
  // untextured import into the wrong substance.
  it("writes glTF's defaults, not the engine's", () => {
    const [template] = authored(gltf({}));

    expect(template.metallic).toBe(1);
    expect(template.roughness).toBe(1);
    expect(template.baseColorFactor).toEqual([1, 1, 1]);
    expect(template.opacity).toBe(1);
    expect(template.emissiveColor).toEqual([0, 0, 0]);
    expect(template.emissiveStrength).toBe(1);
    expect(template.occlusionStrength).toBe(1);
    expect(template.normalScale).toBe(1);
    expect(template.alphaMode).toBe('OPAQUE');
    expect(template.alphaCutoff).toBe(0.5);
    expect(template.doubleSided).toBe(false);
  });

  it('splits baseColorFactor into colour and opacity', () => {
    const [template] = authored(
      gltf({ pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 0.5] } })
    );

    expect(template.baseColorFactor).toEqual([0.2, 0.4, 0.6]);
    expect(template.opacity).toBe(0.5);
  });

  it('takes the scalars each texture slot carries', () => {
    const [template] = authored(
      gltf({
        normalTexture: { scale: 2 },
        occlusionTexture: { strength: 0.25 },
        emissiveFactor: [1, 0, 0],
        extensions: {
          KHR_materials_emissive_strength: { emissiveStrength: 4 },
        },
      })
    );

    expect(template.normalScale).toBe(2);
    expect(template.occlusionStrength).toBe(0.25);
    expect(template.emissiveColor).toEqual([1, 0, 0]);
    expect(template.emissiveStrength).toBe(4);
  });

  it('carries alpha and sidedness through', () => {
    const [template] = authored(
      gltf({ alphaMode: 'MASK', alphaCutoff: 0.3, doubleSided: true })
    );

    expect(template.alphaMode).toBe('MASK');
    expect(template.alphaCutoff).toBe(0.3);
    expect(template.doubleSided).toBe(true);
  });

  it('falls back to OPAQUE on an alphaMode outside the spec', () => {
    const [template] = authored(gltf({ alphaMode: 'CUTOUT' }));

    expect(template.alphaMode).toBe('OPAQUE');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('CUTOUT')
    );
  });

  it('shades through the tangent frame only where there is a normal map', () => {
    const [without] = authored(gltf({}));
    const [with_] = authored(gltf({}), textures({ normalMap: 'normal-key' }));

    expect(without.vertexTangents).toBe(false);
    expect(with_.vertexTangents).toBe(true);
  });

  // COLOR_0 carries foliage bend weights, so a mesh having it is not a request
  // to tint by it.
  it('never turns on vertex colours', () => {
    const [template] = authored(gltf({}));

    expect(template.vertexColors).toBe(false);
  });

  describe('identity', () => {
    it('is what the material draws, not what it is called', () => {
      const [first] = authored(gltf({ name: 'Material.001' }));
      const [second] = authored(gltf({ name: 'Rock Surface' }));

      expect(second.name).toBe(first.name);
      expect(first.gltfName).toBe('Material.001');
    });

    it('separates materials that differ in a factor', () => {
      const [first] = authored(
        gltf({ pbrMetallicRoughness: { roughnessFactor: 0.2 } })
      );
      const [second] = authored(
        gltf({ pbrMetallicRoughness: { roughnessFactor: 0.8 } })
      );

      expect(second.name).not.toBe(first.name);
    });

    it('separates materials that differ in a texture', () => {
      const [first] = authored(gltf({}), textures({ baseColorMap: 'a' }));
      const [second] = authored(gltf({}), textures({ baseColorMap: 'b' }));

      expect(second.name).not.toBe(first.name);
    });

    it('separates materials that sample differently', () => {
      const [first] = authored(gltf({}));
      const [second] = authored(
        gltf({}),
        textures({ sampler: { ...SAMPLER, addressModeU: 'clamp-to-edge' } })
      );

      expect(second.name).not.toBe(first.name);
    });
  });

  // Emitted by every file so a primitive with no material of its own has
  // something to draw with; identical everywhere, so they collapse to one pass.
  it("appends glTF's default material", () => {
    const fromEmpty = toMaterialTemplates({} as GLTFPostprocessed, []);
    const [fallback] = toMaterialTemplates(gltf({}), textures()).filter(
      (template) => template.gltfId === DEFAULT_MATERIAL_ID
    );

    expect(fromEmpty).toHaveLength(1);
    expect(fallback.name).toBe(fromEmpty[0].name);
    expect(fallback.metallic).toBe(1);
    expect(fallback.gltfName).toBeNull();
  });
});
