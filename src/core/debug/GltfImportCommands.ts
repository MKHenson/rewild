import { Renderer } from 'rewild-renderer';

// Imported-model inspection.
//
// A glTF's textures and materials are pulled in behind the scenes — nothing in
// the editor lists them, and a wrong colour space or a texture uploaded twice
// looks exactly like one uploaded once until something shades wrong. This turns
// both into a table.

export function registerGltfImportCommands(renderer: Renderer) {
  (window as any).showImportedTextures = () => {
    const rows: Record<string, unknown>[] = [];

    for (const [key, texture] of renderer.textureManager.textures) {
      if (!key.startsWith('gltf:')) continue;

      const { gpuTexture } = texture;
      rows.push({
        key,
        colorSpace: texture.properties.colorSpace,
        size: gpuTexture
          ? `${gpuTexture.width}x${gpuTexture.height}`
          : 'pending',
        mips: gpuTexture?.mipLevelCount ?? 0,
      });
    }

    console.log(
      `showImportedTextures() — every texture the glTF importer pulled in.\n` +
        `Keys hold the image's identity: a url for a sibling file, a hash of ` +
        `its bytes when embedded. One row per image means models sharing a ` +
        `texture share the upload; two rows for the same picture means they ` +
        `did not.`
    );
    console.table(rows);
  };

  (window as any).showImportedMaterials = () => {
    const rows: Record<string, unknown>[] = [];

    for (const [id, model] of renderer.geometryManager.models)
      for (const material of model.materials)
        rows.push({
          model: id,
          authored: material.gltfName ?? material.gltfId,
          key: material.name,
          baseColor: material.baseColorMap ?? '—',
          normal: material.normalMap ?? '—',
          metallicRoughness: material.metallicRoughnessMap ?? '—',
          occlusion: material.occlusionMap ?? '—',
          emissive: material.emissiveMap ?? '—',
          metallic: material.metallic,
          roughness: material.roughness,
          alphaMode: material.alphaMode,
          doubleSided: material.doubleSided,
        });

    console.log(
      `showImportedMaterials() — the materials the glTF importer created.\n` +
        `'key' is a hash of what the material draws, so two rows sharing one ` +
        `key are one pass however their authors named them. Look them up with ` +
        `renderer.materialManager.get(key).`
    );
    console.table(rows);
  };
}
