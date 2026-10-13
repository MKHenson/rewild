import type { IAsset } from 'models';
import { confirmUpload, listServerAssets, requestUploadUrl, uploadProjectImage } from '../api/assets/asset-api';
import { authService } from '../api/auth/auth-service';
import { LocalDataTable, StoredRecord } from './local-db';

/** Identifies a level's files: they live under its project. */
export interface LevelRef {
  projectId: string;
  levelId: string;
}

/** Reads one of a level's files, or resolves null when the level has no such file. */
export type AssetReader = (assetType: string, filename: string) => Promise<ArrayBuffer | null>;

/** The ref of a project's start level, or null when it has none. */
export function startLevelRef(project: { id?: string; levelId?: string } | null | undefined): LevelRef | null {
  return project?.id && project.levelId ? { projectId: project.id, levelId: project.levelId } : null;
}

/** Called after a project image upload with the URL the server gave it. */
export type ProjectImageUploaded = (projectId: string, imageUrl: string) => Promise<void>;

const IMAGE = 'image';
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Project files in OPFS, laid out like the bucket:
 * `projects/{projectId}/levels/{levelId}/{assetType}/{filename}` for level files and
 * `projects/{projectId}/{assetType}/{filename}` for project files such as the image.
 * Each file has a metadata record that tracks its sync state.
 */
export class LocalAssetStore extends LocalDataTable<IAsset> {
  constructor() {
    super('rewild', 'assets');
  }

  async write(level: LevelRef, assetType: string, filename: string, data: ArrayBuffer): Promise<string> {
    const asset = { projectId: level.projectId, levelId: level.levelId, assetType, filename };
    return this.writeAsset(asset, data);
  }

  async read(level: LevelRef, assetType: string, filename: string): Promise<ArrayBuffer | null> {
    const asset = { projectId: level.projectId, levelId: level.levelId, assetType, filename };
    return this.readAsset(asset);
  }

  /** Stores a project image, replacing any other. Only a pending image is kept: the upload removes it. */
  async writeProjectImage(projectId: string, file: File): Promise<void> {
    const extension = IMAGE_EXTENSIONS[file.type];
    if (!extension) throw new Error(`Unsupported image type: ${file.type}`);

    await this.removeProjectImage(projectId);
    await this.writeAsset({ projectId, levelId: null, assetType: IMAGE, filename: `image.${extension}` }, file);
  }

  /** The project image waiting for upload, or null. */
  async readProjectImage(projectId: string): Promise<File | null> {
    const record = (await this.projectImages(projectId))[0];
    if (!record) return null;
    const data = await this.readAsset(record);
    if (!data) return null;
    const extension = record.filename.split('.').pop()!;
    const type = Object.keys(IMAGE_EXTENSIONS).find((t) => IMAGE_EXTENSIONS[t] === extension)!;
    return new File([data], record.filename, { type });
  }

  async sync(onProjectImage?: ProjectImageUploaded): Promise<void> {
    if (!authService.getToken()) return;

    // Push: level files via the presigned URL flow, project images via the image endpoints
    const dirty = await this.getDirty();
    for (const asset of dirty) {
      try {
        if (asset.levelId === null) {
          await this.pushProjectImage(asset, onProjectImage);
          continue;
        }

        const binary = await this.readAsset(asset);
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

    // Pull: fetch server level files not present in OPFS and cache them locally
    const serverAssets = await listServerAssets();
    for (const serverAsset of serverAssets) {
      const level = { projectId: serverAsset.projectId, levelId: serverAsset.levelId };
      const existing = await this.read(level, serverAsset.assetType, serverAsset.filename);
      if (existing) continue;

      try {
        const res = await fetch(serverAsset.publicUrl);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const data = await res.arrayBuffer();
        const id = await this.write(level, serverAsset.assetType, serverAsset.filename, data);
        await this.markSynced(id, Date.now(), null);
      } catch {}
    }
  }

  async removeByProject(projectId: string): Promise<void> {
    try {
      const projectsDir = await this.projectsDir(false);
      await projectsDir.removeEntry(projectId, { recursive: true });
    } catch {}

    const result = await this.getMany({ where: [['projectId', '==', projectId]] });
    await Promise.all(result.items.map((item) => this.hardRemove(item.id)));
  }

  async removeByLevel(levelId: string): Promise<void> {
    const records = await this.levelRecords(levelId);
    if (records.length === 0) return;

    try {
      const levelsDir = await this.levelsDir(records[0].projectId, false);
      await levelsDir.removeEntry(levelId, { recursive: true });
    } catch {}

    await Promise.all(records.map((item) => this.hardRemove(item.id)));
  }

  async removeChunksByLevel(levelId: string): Promise<void> {
    const records = await this.levelRecords(levelId);
    if (records.length === 0) return;

    try {
      const levelsDir = await this.levelsDir(records[0].projectId, false);
      const levelDir = await levelsDir.getDirectoryHandle(levelId, { create: false });
      await levelDir.removeEntry('chunk', { recursive: true });
    } catch {}

    const chunks = records.filter((i) => i.assetType === 'chunk');
    await Promise.all(chunks.map((item) => this.hardRemove(item.id)));
  }

  // The image lives on the server once uploaded, and other devices only know its URL,
  // so the local copy goes too.
  private async pushProjectImage(asset: StoredRecord<IAsset>, onProjectImage?: ProjectImageUploaded) {
    const file = await this.readProjectImage(asset.projectId);
    if (!file) return;
    const imageUrl = await uploadProjectImage(asset.projectId, file);
    await onProjectImage?.(asset.projectId, imageUrl);
    await this.removeProjectImage(asset.projectId);
  }

  private async removeProjectImage(projectId: string): Promise<void> {
    for (const record of await this.projectImages(projectId)) {
      try {
        const dir = await this.assetDir(record, false);
        await dir.removeEntry(record.filename);
      } catch {}
      await this.hardRemove(record.id);
    }
  }

  private async projectImages(projectId: string) {
    const result = await this.getMany({ where: [['projectId', '==', projectId]] });
    return result.items.filter((i) => i.levelId === null && i.assetType === IMAGE);
  }

  private async levelRecords(levelId: string) {
    return (await this.getMany({ where: [['levelId', '==', levelId]] })).items;
  }

  private async writeAsset(asset: IAsset, data: ArrayBuffer | Blob): Promise<string> {
    const dir = await this.assetDir(asset, true);
    const fileHandle = await dir.getFileHandle(asset.filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();

    const existing = await this.findMetadata(asset);
    if (existing) {
      await this.patch(existing.id, {});
      return existing.id;
    }
    const record = await this.add(asset);
    return record.id;
  }

  private async readAsset(asset: IAsset): Promise<ArrayBuffer | null> {
    try {
      const dir = await this.assetDir(asset, false);
      const fileHandle = await dir.getFileHandle(asset.filename, { create: false });
      const file = await fileHandle.getFile();
      return await file.arrayBuffer();
    } catch {
      return null;
    }
  }

  private async findMetadata(asset: IAsset) {
    const result = await this.getMany({ where: [['projectId', '==', asset.projectId]] });
    return (
      result.items.find(
        (i) => i.levelId === asset.levelId && i.assetType === asset.assetType && i.filename === asset.filename
      ) ?? null
    );
  }

  private async projectsDir(create: boolean): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('projects', { create });
  }

  private async levelsDir(projectId: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    const projectDir = await (await this.projectsDir(create)).getDirectoryHandle(projectId, { create });
    return projectDir.getDirectoryHandle('levels', { create });
  }

  private async assetDir(asset: IAsset, create: boolean): Promise<FileSystemDirectoryHandle> {
    const parent =
      asset.levelId === null
        ? await (await this.projectsDir(create)).getDirectoryHandle(asset.projectId, { create })
        : await (await this.levelsDir(asset.projectId, create)).getDirectoryHandle(asset.levelId, { create });
    return parent.getDirectoryHandle(asset.assetType, { create });
  }
}
