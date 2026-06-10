import type { LocalDataTable } from '../../database/local-db';
import { apiFetch } from '../auth/api-client';
import type { AuthService } from '../auth/auth-service';
import type { components } from '../../types/api';

type SyncRecord = components['schemas']['com.rewild.models.SyncRecord'];
type SyncRequest = components['schemas']['com.rewild.models.SyncRequest'];
type SyncResponse = components['schemas']['com.rewild.models.SyncResponse'];

// One entry per record touched in the current session; cleared on page reload.
// The durable per-record syncError field in LocalDataTable carries state across reloads.
export type SyncEvent = {
  timestamp: number;
  collection: string;
  recordId: string;
  status: 'pushed' | 'pulled' | 'failed';
  error?: string;
};

const MAX_LOG = 50;

function lastSyncedAtKey(userId: string): string {
  return `rewild.sync.lastSyncedAt.${userId}`;
}

export class SyncEngine {
  // Bounded in-memory log for the current session (e.g. powering a sync-status UI indicator).
  private readonly events: SyncEvent[] = [];

  // tables is a named map of every collection that participates in sync.
  // The key becomes the collection name sent to the server. Add a new table here to enrol it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    private readonly tables: Record<string, LocalDataTable<any>>,
    private readonly auth: AuthService
  ) {}

  get log(): readonly SyncEvent[] {
    return this.events;
  }

  async run(): Promise<void> {
    // Sync is a no-op for unauthenticated users — local store is always the active source of truth.
    if (!this.auth.getToken()) return;
    const userId = this.auth.getUserId();
    if (!userId) return;

    // lastSyncedAt tells the server which records we've already seen.
    // On a brand-new device this is 0, which triggers a full pull of all server data.
    const lastSyncedAt = this.loadLastSyncedAt(userId);

    // Collect every record whose updatedAt > syncedAt across all registered tables.
    const outgoing: Array<{ collection: string; record: Record<string, unknown> & { id: string; updatedAt: number; syncedAt: number } }> = [];
    for (const [collection, table] of Object.entries(this.tables)) {
      const dirty = await table.getDirty();
      for (const record of dirty) {
        outgoing.push({ collection, record });
      }
    }

    // Shape the dirty records into the wire format the server expects.
    const syncRecords: SyncRecord[] = outgoing.map(({ collection, record }) => ({
      collection,
      id: record.id,
      updatedAt: record.updatedAt,
      data: record as Record<string, unknown>,
    }));

    let response: SyncResponse;
    try {
      const res = await apiFetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastSyncedAt, records: syncRecords } satisfies SyncRequest),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      response = (await res.json()) as SyncResponse;
    } catch (err) {
      // Best-effort: preserve the existing syncedAt so each record stays dirty and will be
      // retried on the next run(), but surface why the last attempt failed via syncError.
      const error = err instanceof Error ? err.message : 'Sync failed';
      for (const { collection, record } of outgoing) {
        await this.tables[collection].markSynced(record.id, record.syncedAt, error);
        this.logEvent({ collection, recordId: record.id, status: 'failed', error });
      }
      return;
    }

    // Push succeeded — mark every sent record as clean and clear any prior error.
    for (const { collection, record } of outgoing) {
      await this.tables[collection].markSynced(record.id, response.syncedAt, null);
      this.logEvent({ collection, recordId: record.id, status: 'pushed' });
    }

    // Apply records the server sent back (things we were missing or that are newer server-side).
    // Last-write-wins: skip any record that became locally dirty during this sync window.
    for (const incoming of response.records) {
      const table = this.tables[incoming.collection];
      if (!table) continue;

      const deletedAt = (incoming.data as { deletedAt?: number | null }).deletedAt;
      if (deletedAt) {
        // Tombstone from the server — physically remove the local record.
        await table.hardRemove(incoming.id);
        this.logEvent({ collection: incoming.collection, recordId: incoming.id, status: 'pulled' });
        continue;
      }

      const local = await table.getOne(incoming.id);
      if (local && local.updatedAt > local.syncedAt) continue; // local wins
      await table.putSynced(
        { ...incoming.data, id: incoming.id, updatedAt: incoming.updatedAt },
        response.syncedAt
      );
      this.logEvent({ collection: incoming.collection, recordId: incoming.id, status: 'pulled' });
    }

    // Advance the cursor so the next sync only asks for records newer than this one.
    this.saveLastSyncedAt(userId, response.syncedAt);
  }

  private loadLastSyncedAt(userId: string): number {
    try {
      return Number(localStorage.getItem(lastSyncedAtKey(userId))) || 0;
    } catch {
      return 0;
    }
  }

  private saveLastSyncedAt(userId: string, syncedAt: number): void {
    localStorage.setItem(lastSyncedAtKey(userId), String(syncedAt));
  }

  private logEvent(event: Omit<SyncEvent, 'timestamp'>): void {
    this.events.push({ timestamp: Date.now(), ...event });
    if (this.events.length > MAX_LOG) this.events.shift();
  }
}
