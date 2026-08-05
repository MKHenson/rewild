import { Renderer } from '../Renderer';
import { StandardPass } from '../materials/StandardPass';
import { MaterialManager } from './MaterialManager';
import { IMaterialTemplate } from './types';

// Every pass constructor is device-free — the GPU only appears in init(), which
// the renderer calls lazily on first draw. So the whole template-to-pass
// translation can be tested with a renderer that is nothing but a texture
// lookup.
function fakeRenderer(): Renderer {
  return {
    textureManager: {
      get(name: string) {
        if (name.startsWith('missing')) {
          throw new Error(`Could not find texture with id ${name}`);
        }
        // Tagged so a test can tell which texture landed in which slot.
        return { gpuTexture: { label: name } };
      },
    },
  } as unknown as Renderer;
}

async function passFor(template: IMaterialTemplate): Promise<StandardPass> {
  const manager = new MaterialManager();
  await manager.initialize(fakeRenderer(), {
    textures: [],
    materials: [template],
  });
  return manager.get(template.name) as StandardPass;
}

describe("MaterialManager type: 'standard'", () => {
  it('maps every template field onto the pass', async () => {
    const pass = await passFor({
      name: 'full',
      type: 'standard',
      baseColorMap: 'albedo',
      normalMap: 'normal',
      metallicRoughnessMap: 'orm',
      occlusionMap: 'orm',
      emissiveMap: 'glow',
      baseColorFactor: [0.2, 0.4, 0.6],
      opacity: 0.5,
      metallic: 0.25,
      roughness: 0.75,
      emissiveColor: [1, 0.5, 0],
      emissiveStrength: 4,
      occlusionStrength: 0.8,
      normalScale: 1.5,
      ambientColor: [0.1, 0.1, 0.1],
      alphaMode: 'BLEND',
      alphaCutoff: 0.25,
      doubleSided: true,
    });

    const { material } = pass;
    expect(material.baseColorTexture.label).toBe('albedo');
    expect(material.normalTexture.label).toBe('normal');
    // The same texture in both slots is an ORM atlas — glTF's own way of
    // expressing it, and the reason these are two fields rather than one.
    expect(material.metallicRoughnessTexture.label).toBe('orm');
    expect(material.occlusionTexture.label).toBe('orm');
    expect(material.emissiveTexture.label).toBe('glow');

    expect(material.baseColorFactor).toEqual([0.2, 0.4, 0.6, 0.5]);
    expect(material.metallic).toBe(0.25);
    expect(material.roughness).toBe(0.75);
    expect(material.emissiveColor).toEqual([1, 0.5, 0]);
    expect(material.emissiveStrength).toBe(4);
    expect(material.occlusionStrength).toBe(0.8);
    expect(material.normalScale).toBe(1.5);
    expect(material.ambientColor).toEqual([0.1, 0.1, 0.1]);
    expect(material.alphaCutoff).toBe(0.25);

    // alphaMode has to reach both halves: the pass picks blend and depth-write
    // state from it, the shader reads it out of the uniform block.
    expect(pass.alphaMode).toBe('BLEND');
    expect(material.alphaMode).toBe('BLEND');
    expect(pass.transparent).toBe(true);
    expect(pass.doubleSided).toBe(true);
  });

  it('leaves the glTF defaults alone for a bare entry', async () => {
    const pass = await passFor({ name: 'bare', type: 'standard' });

    expect(pass.material.baseColorFactor).toEqual([1, 1, 1, 1]);
    expect(pass.material.metallic).toBe(0);
    expect(pass.material.roughness).toBe(0.5);
    expect(pass.alphaMode).toBe('OPAQUE');
    expect(pass.doubleSided).toBe(false);
    expect(pass.vertexColors).toBe(false);
    // Textures are left unset so StandardMaterial.build() can fall back to its
    // neutral 1x1s — naming none is not the same as naming a black one.
    expect(pass.material.baseColorTexture).toBeUndefined();
  });

  it('applies opacity without a baseColorFactor', async () => {
    const pass = await passFor({ name: 'glass', type: 'standard', opacity: 0.3 });
    expect(pass.material.baseColorFactor).toEqual([1, 1, 1, 0.3]);
  });

  // The template is cast from JSON and never validated, so this is the only
  // thing between a typo and a cutout material that silently renders opaque.
  it('throws on an alphaMode outside the spec, naming the material', async () => {
    await expect(
      passFor({
        name: 'leaves',
        type: 'standard',
        alphaMode: 'CUTOUT' as never,
      })
    ).rejects.toThrow(/Material "leaves": alphaMode/);
  });

  it('propagates an unknown texture rather than falling back', async () => {
    await expect(
      passFor({ name: 'typo', type: 'standard', baseColorMap: 'missing-map' })
    ).rejects.toThrow(/missing-map/);
  });
});
