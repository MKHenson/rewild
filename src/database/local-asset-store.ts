import type { IAsset } from 'models';
import { confirmUpload, listServerAssets, requestUploadUrl } from '../api/assets/asset-api';
import { authService } from '../api/auth/auth-service';
import { LocalDataTable } from './local-db';

export class LocalAssetStore extends LocalDataTable<IAsset> {
  constructor() {
    super('rewild', 'assets');
  }

  async write(levelId: string, assetType: string, filename: string, data: ArrayBuffer): Promise<string> {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await this.resolveFileHandle(root, levelId, assetType, filename, true);
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();

    const existing = await this.findMetadata(levelId, assetType, filename);
    if (existing) {
      await this.patch(existing.id, {});
      return existing.id;
    }
    const record = await this.add({ levelId, assetType, filename });
    return record.id;
  }

  async read(levelId: string, assetType: string, filename: string): Promise<ArrayBuffer | null> {
    try {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await this.resolveFileHandle(root, levelId, assetType, filename, false);
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  }

  async sync(): Promise<void> {
    if (!authService.getToken()) return;

    // Push: upload all dirty assets via the presigned URL flow
    const dirty = await this.getDirty();
    for (const asset of dirty) {
      try {
        const binary = await this.read(asset.levelId, asset.assetType, asset.filename);
        if (!binary) continue;

        const { uploadUrl, storageKey } = await requestUploadUrl(asset.levelId, asset.assetType, asset.filename);
        const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: binary });
        if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

        await confirmUpload(storageKey);
        await this.markSynced(asset.id, Date.now(), null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sync failed';
        await this.markSynced(asset.id, asset.syncedAt, msg);
      }
    }

    // Pull: fetch server assets not present in OPFS and cache them locally
    const serverAssets = await listServerAssets();
    for (const serverAsset of serverAssets) {
      const existing = await this.read(serverAsset.levelId, serverAsset.assetType, serverAsset.filename);
      if (existing) continue;

      try {
        const res = await fetch(serverAsset.publicUrl);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const data = await res.arrayBuffer();
        const id = await this.write(serverAsset.levelId, serverAsset.assetType, serverAsset.filename, data);
        await this.markSynced(id, Date.now(), null);
      } catch {}
    }
  }

  async removeByLevel(levelId: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      const levelsDir = await root.getDirectoryHandle('levels', { create: false });
      await levelsDir.removeEntry(levelId, { recursive: true });
    } catch {}

    const result = await this.getMany({ where: [['levelId', '==', levelId]] });
    await Promise.all(result.items.map((item) => this.hardRemove(item.id)));
  }

  private async findMetadata(levelId: string, assetType: string, filename: string) {
    const result = await this.getMany({ where: [['levelId', '==', levelId]] });
    return result.items.find((i) => i.assetType === assetType && i.filename === filename) ?? null;
  }

  private async resolveFileHandle(
    root: FileSystemDirectoryHandle,
    levelId: string,
    assetType: string,
    filename: string,
    create: boolean
  ): Promise<FileSystemFileHandle> {
    const levelsDir = await root.getDirectoryHandle('levels', { create });
    const levelDir = await levelsDir.getDirectoryHandle(levelId, { create });
    const typeDir = await levelDir.getDirectoryHandle(assetType, { create });
    return typeDir.getFileHandle(filename, { create });
  }
}
