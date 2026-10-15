import type { IAsset } from 'models';
import { confirmUpload, listServerAssets, requestUploadUrl, ServerAsset } from '../api/assets/asset-api';
import { authService } from '../api/auth/auth-service';
import { LocalDataTable, StoredRecord } from './local-db';

/** Identifies a level's files: they live under its project. */
export interface LevelRef {
  projectId: string;
  levelId: string;
}

/** Identifies one file of a project: on the project itself (`levelId` null) or on one of its levels. */
export type AssetRef = Pick<IAsset, 'projectId' | 'levelId' | 'assetType' | 'filename'>;

/** Reads one of a level's files, or resolves null when the level has no such file. */
export type AssetReader = (assetType: string, filename: string) => Promise<ArrayBuffer | null>;

/** The ref of a project's start level, or null when it has none. */
export function startLevelRef(project: { id?: string; levelId?: string } | null | undefined): LevelRef | null {
  return project?.id && project.levelId ? { projectId: project.id, levelId: project.levelId } : null;
}

const BINARY = 'application/octet-stream';

/**
 * Project files in OPFS, laid out like the bucket:
 * `projects/{projectId}/levels/{levelId}/{assetType}/{filename}` for level files and
 * `projects/{projectId}/{assetType}/{filename}` for project files.
 * Each file has a metadata record that tracks its sync state. The copy on this device comes first:
 * a sync pushes local changes, and a pull never replaces a file with unsynced changes.
 */
export class LocalAssetStore extends LocalDataTable<IAsset> {
  constructor() {
    super('rewild', 'assets');
  }

  /** Writes a file on this device. It stays pending until a sync uploads it. Returns the asset id. */
  async write(asset: AssetRef & { contentType?: string }, data: ArrayBuffer | Blob): Promise<string> {
    const contentType = asset.contentType ?? (data instanceof Blob && data.type ? data.type : BINARY);
    await this.writeFile(asset, data);

    const existing = await this.findMetadata(asset);
    if (existing) {
      await this.patch(existing.id, { contentType });
      return existing.id;
    }
    return (await this.add({ ...pickRef(asset), contentType })).id;
  }

  async read(asset: AssetRef): Promise<ArrayBuffer | null> {
    try {
      const dir = await this.assetDir(asset, false);
      const fileHandle = await dir.getFileHandle(asset.filename, { create: false });
      return await (await fileHandle.getFile()).arrayBuffer();
    } catch {
      return null;
    }
  }

  /** The file with its content type, or null. */
  async readBlob(asset: AssetRef): Promise<Blob | null> {
    const data = await this.read(asset);
    if (!data) return null;
    const record = await this.findMetadata(asset);
    return new Blob([data], { type: record?.contentType ?? BINARY });
  }

  /** True when the file on this device has changes a sync has not uploaded yet. */
  async isPending(asset: AssetRef): Promise<boolean> {
    const record = await this.findMetadata(asset);
    return !!record && isDirty(record);
  }

  /** Pushes pending files, then pulls every server file this device lacks or has an older version of. */
  async sync(): Promise<void> {
    if (!authService.getToken()) return;

    for (const asset of await this.getDirty()) {
      try {
        await this.push(asset);
      } catch (err) {
        await this.markSynced(asset.id, asset.syncedAt, err instanceof Error ? err.message : 'Sync failed');
      }
    }

    for (const serverAsset of await listServerAssets()) {
      try {
        await this.pull(serverAsset);
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

  private async push(asset: StoredRecord<IAsset>) {
    const data = await this.read(asset);
    if (!data) return;
    const contentType = asset.contentType ?? BINARY;

    const { uploadUrl, storageKey } = await requestUploadUrl({
      projectId: asset.projectId,
      levelId: asset.levelId,
      assetType: asset.assetType,
      filename: asset.filename,
      contentType,
      size: data.byteLength,
    });
    const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: data });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

    const confirmed = await confirmUpload(storageKey);
    // Synced as of the write that was uploaded: a write made during the upload stays pending.
    const current = await this.getOne(asset.id);
    if (current) await this.putSynced({ ...current, version: confirmed.updatedAt }, asset.updatedAt);
  }

  private async pull(serverAsset: ServerAsset) {
    const ref: AssetRef = pickRef({ ...serverAsset, levelId: serverAsset.levelId ?? null });
    const local = await this.findMetadata(ref);
    if (local && isDirty(local)) return;
    if (local?.version === serverAsset.updatedAt && (await this.read(ref))) return;

    const res = await fetch(serverAsset.publicUrl);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    await this.writeFile(ref, await res.arrayBuffer());

    const id = local?.id ?? (await this.add(ref)).id;
    const now = Date.now();
    await this.putSynced(
      { ...ref, id, contentType: serverAsset.contentType, version: serverAsset.updatedAt, updatedAt: now },
      now
    );
  }

  private async writeFile(asset: AssetRef, data: ArrayBuffer | Blob) {
    const dir = await this.assetDir(asset, true);
    const fileHandle = await dir.getFileHandle(asset.filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  private async levelRecords(levelId: string) {
    return (await this.getMany({ where: [['levelId', '==', levelId]] })).items;
  }

  private async findMetadata(asset: AssetRef) {
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

  private async assetDir(asset: AssetRef, create: boolean): Promise<FileSystemDirectoryHandle> {
    const parent =
      asset.levelId === null
        ? await (await this.projectsDir(create)).getDirectoryHandle(asset.projectId, { create })
        : await (await this.levelsDir(asset.projectId, create)).getDirectoryHandle(asset.levelId, { create });
    return parent.getDirectoryHandle(asset.assetType, { create });
  }
}

function pickRef({ projectId, levelId, assetType, filename }: AssetRef): AssetRef {
  return { projectId, levelId, assetType, filename };
}

function isDirty(record: StoredRecord<IAsset>): boolean {
  return record.updatedAt > record.syncedAt;
}
