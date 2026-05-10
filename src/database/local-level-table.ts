import type { ILevel } from 'models';
import { LocalDataTable } from './local-db';
import { LocalAssetStore } from './local-asset-store';

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
}
