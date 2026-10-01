import type { ILevel } from 'models';
import { LocalDataTable } from './local-db';
import { LocalAssetStore } from './local-asset-store';

const isNewer = (incoming?: number | null, local?: number | null) =>
  incoming != null && (local == null || incoming > local);

export class LocalLevelTable extends LocalDataTable<ILevel> {
  private assets = new LocalAssetStore();

  constructor() {
    super('rewild', 'levels');
  }

  override async remove(id: string): Promise<boolean> {
    const removed = await super.remove(id);
    if (removed) await this.assets.removeByLevel(id);
    return removed;
  }

  // A tombstone from another device: its files go with it.
  override async hardRemove(id: string): Promise<void> {
    await super.hardRemove(id);
    await this.assets.removeByLevel(id);
  }

  // A clear made on another device removes this device's files too. They go
  // before the record, so a failure part way leaves the clear to run again.
  override async putSynced(
    record: ILevel & { id: string; updatedAt: number; deletedAt?: number | null },
    syncedAt: number
  ): Promise<void> {
    const local = await this.getOne(record.id);
    if (local && isNewer(record.chunksClearedAt, local.chunksClearedAt))
      await this.assets.removeChunksByLevel(record.id);
    await super.putSynced(record, syncedAt);
  }

  /**
   * Records that the level's chunk files were removed. The level syncs like any
   * edit, and the server then removes its copies. The time always moves
   * forward, so a clear is newer than the last one on any clock.
   */
  async markCleared(id: string): Promise<void> {
    const level = await this.getOne(id);
    if (!level) return;
    const chunksClearedAt = Math.max(Date.now(), (level.chunksClearedAt ?? 0) + 1);
    await this.patch(id, { chunksClearedAt });
  }
}
