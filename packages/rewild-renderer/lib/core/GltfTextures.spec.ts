import type { GLTFPostprocessed } from '@loaders.gl/gltf';
import { collectGltfTextures } from './GltfTextures';

// postProcessGLTF resolves every index into an object, so these fixtures are
// the shape the collector actually walks rather than raw glTF JSON.
function image(overrides: Record<string, unknown>) {
  return { id: 'image-0', ...overrides };
}

/** An image embedded in the container, as a GLB's always is. */
function embedded(bytes: number[], mimeType = 'image/png') {
  return image({ mimeType, bufferView: { data: new Uint8Array(bytes) } });
}

function texture(
  source: ReturnType<typeof image>,
  sampler?: Record<string, number>
) {
  return { id: 'texture-0', source, sampler };
}

function material(
  overrides: {
    name?: string;
    baseColor?: ReturnType<typeof texture>;
    metallicRoughness?: ReturnType<typeof texture>;
    normal?: ReturnType<typeof texture>;
    occlusion?: ReturnType<typeof texture>;
    emissive?: ReturnType<typeof texture>;
    texCoord?: number;
  } = {}
) {
  return {
    id: 'material-0',
    name: overrides.name,
    pbrMetallicRoughness: {
      baseColorTexture: overrides.baseColor
        ? { texture: overrides.baseColor, texCoord: overrides.texCoord }
        : undefined,
      metallicRoughnessTexture: overrides.metallicRoughness
        ? { texture: overrides.metallicRoughness }
        : undefined,
    },
    normalTexture: overrides.normal ? { texture: overrides.normal } : undefined,
    occlusionTexture: overrides.occlusion
      ? { texture: overrides.occlusion }
      : undefined,
    emissiveTexture: overrides.emissive
      ? { texture: overrides.emissive }
      : undefined,
  };
}

function gltf(...materials: ReturnType<typeof material>[]): GLTFPostprocessed {
  return { materials } as unknown as GLTFPostprocessed;
}

describe('collectGltfTextures', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('takes colour space from the slot, not the file', () => {
    const set = collectGltfTextures(
      gltf(
        material({
          baseColor: texture(embedded([1])),
          normal: texture(embedded([2])),
          metallicRoughness: texture(embedded([3])),
          occlusion: texture(embedded([4])),
          emissive: texture(embedded([5])),
        })
      )
    );
    const spaceOf = (key?: string) =>
      set.textures.find((t) => t.key === key)!.colorSpace;
    const [imported] = set.materials;

    expect(spaceOf(imported.baseColorMap)).toBe('srgb');
    expect(spaceOf(imported.emissiveMap)).toBe('srgb');
    expect(spaceOf(imported.normalMap)).toBe('linear');
    expect(spaceOf(imported.metallicRoughnessMap)).toBe('linear');
    expect(spaceOf(imported.occlusionMap)).toBe('linear');
  });

  // An ORM atlas is one image in two slots, which is glTF's own way of packing
  // occlusion with roughness and metallic. Uploading it twice would be a waste
  // of the larger half of a material's memory.
  it('shares one texture between slots that agree on colour space', () => {
    const orm = embedded([9, 9, 9]);
    const set = collectGltfTextures(
      gltf(
        material({
          metallicRoughness: texture(orm),
          occlusion: texture(orm),
        })
      )
    );

    expect(set.textures).toHaveLength(1);
    expect(set.materials[0].metallicRoughnessMap).toBe(
      set.materials[0].occlusionMap
    );
  });

  // sRGB is a property of the *format* in WebGPU, so the same bytes read two
  // ways are genuinely two GPU textures.
  it('splits one image used as both colour and data', () => {
    const shared = embedded([7, 7]);
    const set = collectGltfTextures(
      gltf(material({ baseColor: texture(shared), normal: texture(shared) }))
    );

    expect(set.textures).toHaveLength(2);
    expect(set.materials[0].baseColorMap).not.toBe(set.materials[0].normalMap);
  });

  // The point of hashing: two models exported separately embed their own copy
  // of a shared material's textures, and must still land on one upload.
  it('gives byte-identical embedded images the same key across files', () => {
    const bytes = [3, 1, 4, 1, 5, 9];
    const first = collectGltfTextures(
      gltf(material({ baseColor: texture(embedded(bytes)) }))
    );
    const second = collectGltfTextures(
      gltf(material({ baseColor: texture(embedded(bytes)) }))
    );

    expect(second.materials[0].baseColorMap).toBe(
      first.materials[0].baseColorMap
    );
  });

  it('separates images that differ only in length', () => {
    const first = collectGltfTextures(
      gltf(material({ baseColor: texture(embedded([1, 2, 3])) }))
    );
    const second = collectGltfTextures(
      gltf(material({ baseColor: texture(embedded([1, 2, 3, 0])) }))
    );

    expect(second.materials[0].baseColorMap).not.toBe(
      first.materials[0].baseColorMap
    );
  });

  it('keys a sibling file by its resolved url, so two models share one fetch', () => {
    const uri = '../textures/rock_diff.webp';
    const first = collectGltfTextures(
      gltf(material({ baseColor: texture(image({ uri })) })),
      'https://assets.test/nature/rocks/rock_01.gltf'
    );
    const second = collectGltfTextures(
      gltf(material({ baseColor: texture(image({ uri })) })),
      'https://assets.test/nature/rocks/rock_02.gltf'
    );

    expect(first.textures[0].url).toBe(
      'https://assets.test/nature/textures/rock_diff.webp'
    );
    expect(second.materials[0].baseColorMap).toBe(
      first.materials[0].baseColorMap
    );
  });

  it('reads an inline data uri as embedded bytes', () => {
    const set = collectGltfTextures(
      gltf(
        material({
          baseColor: texture(image({ uri: 'data:image/png;base64,AAECAw==' })),
        })
      )
    );

    expect(set.textures[0].url).toBeUndefined();
    expect(Array.from(set.textures[0].bytes!)).toEqual([0, 1, 2, 3]);
    expect(set.textures[0].mimeType).toBe('image/png');
  });

  it('maps glTF sampler state onto the WebGPU equivalent', () => {
    const set = collectGltfTextures(
      gltf(
        material({
          baseColor: texture(embedded([1]), {
            magFilter: 9728, // NEAREST
            minFilter: 9986, // NEAREST_MIPMAP_LINEAR
            wrapS: 33071, // CLAMP_TO_EDGE
            wrapT: 33648, // MIRRORED_REPEAT
          }),
        })
      )
    );

    expect(set.materials[0].sampler).toEqual({
      magFilter: 'nearest',
      minFilter: 'nearest',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'mirror-repeat',
    });
  });

  it("falls back to glTF's default sampler when the texture states none", () => {
    const set = collectGltfTextures(
      gltf(material({ baseColor: texture(embedded([1])) }))
    );

    expect(set.materials[0].sampler).toEqual({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });
  });

  // An unresolvable image is a broken file. Rendering it white says so; failing
  // the load takes the whole level down with it.
  it('warns and skips a texture with no usable image', () => {
    const set = collectGltfTextures(
      gltf(material({ name: 'broken', baseColor: texture(image({})) }))
    );

    expect(set.textures).toHaveLength(0);
    expect(set.materials[0].baseColorMap).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('broken')
    );
  });

  it('warns when a slot asks for a UV set the engine does not carry', () => {
    collectGltfTextures(
      gltf(material({ baseColor: texture(embedded([1])), texCoord: 1 }))
    );

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('TEXCOORD_1')
    );
  });

  it('leaves a model with no materials with nothing to load', () => {
    expect(collectGltfTextures({} as GLTFPostprocessed)).toEqual({
      textures: [],
      materials: [],
    });
  });
});
