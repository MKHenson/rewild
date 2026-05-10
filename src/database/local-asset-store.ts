import type { IAsset } from 'models';
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

  async removeByLevel(levelId: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      const levelsDir = await root.getDirectoryHandle('levels', { create: false });
      await levelsDir.removeEntry(levelId, { recursive: true });
    } catch {}

    const result = await this.getMany({ where: [['levelId', '==', levelId]] });
    await Promise.all(result.items.map((item) => this.remove(item.id)));
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
