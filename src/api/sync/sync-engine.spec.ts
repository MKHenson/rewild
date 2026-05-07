import { LocalDataTable } from '../../database/local-db';
import { authService } from '../auth/auth-service';
import type { components } from '../../types/api';
import { SyncEngine } from './sync-engine';

type SyncRequest = components['schemas']['com.rewild.models.SyncRequest'];
type SyncRecord = components['schemas']['com.rewild.models.SyncRecord'];

type FakeProject = { name: string };

function mockOkResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response;
}

function syncResponse(overrides: { syncedAt?: number; records?: SyncRecord[] } = {}): Response {
  return mockOkResponse({ syncedAt: 1000, records: [], ...overrides });
}

function getRequestBody(): SyncRequest {
  return JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body as string) as SyncRequest;
}

describe('SyncEngine', () => {
  let projects: LocalDataTable<FakeProject>;
  let levels: LocalDataTable<FakeProject>;
  let engine: SyncEngine;

  beforeEach(() => {
    localStorage.clear();
    projects = new LocalDataTable('rewild', 'projects');
    levels = new LocalDataTable('rewild', 'levels');
    engine = new SyncEngine({ projects, levels }, authService);
    global.fetch = jest.fn();
    jest.spyOn(authService, 'getToken').mockReturnValue('test.header.payload');
    jest.spyOn(authService, 'getUserId').mockReturnValue('user-1');
    jest.spyOn(authService, 'refreshToken').mockResolvedValue(null);
    (global.fetch as jest.Mock).mockResolvedValue(syncResponse());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('no-op when not authenticated', () => {
    it('does not call fetch when token is null', async () => {
      jest.spyOn(authService, 'getToken').mockReturnValue(null);
      await engine.run();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('does not call fetch when userId is null', async () => {
      jest.spyOn(authService, 'getUserId').mockReturnValue(null);
      await engine.run();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('pushing dirty records', () => {
    it('sends dirty projects and levels in a single request', async () => {
      await projects.add({ name: 'Project A' });
      await levels.add({ name: 'Level A' });

      await engine.run();

      const body = getRequestBody();
      expect(body.records).toHaveLength(2);
      const collections = body.records.map((r) => r.collection);
      expect(collections).toContain('projects');
      expect(collections).toContain('levels');
    });

    it('does not send clean records', async () => {
      const p = await projects.add({ name: 'Clean' });
      await projects.markSynced(p.id, p.updatedAt, null);

      await engine.run();

      const body = getRequestBody();
      expect(body.records).toHaveLength(0);
    });

    it('sends lastSyncedAt: 0 when no prior sync', async () => {
      await engine.run();

      const body = getRequestBody();
      expect(body.lastSyncedAt).toBe(0);
    });

    it('sends the stored lastSyncedAt for a returning user', async () => {
      localStorage.setItem('rewild.sync.lastSyncedAt.user-1', '42000');
      await engine.run();

      const body = getRequestBody();
      expect(body.lastSyncedAt).toBe(42000);
    });

    it('sets syncedAt on successfully pushed records', async () => {
      const p = await projects.add({ name: 'Dirty' });
      (global.fetch as jest.Mock).mockResolvedValue(syncResponse({ syncedAt: 9999 }));

      await engine.run();

      const updated = await projects.getOne(p.id);
      expect(updated!.syncedAt).toBe(9999);
      expect(updated!.syncError).toBeNull();
    });

    it('clears a prior syncError on a successfully pushed record', async () => {
      const p = await projects.add({ name: 'Retry' });
      await projects.markSynced(p.id, 0, 'previous error');
      (global.fetch as jest.Mock).mockResolvedValue(syncResponse({ syncedAt: 5000 }));

      await engine.run();

      const updated = await projects.getOne(p.id);
      expect(updated!.syncError).toBeNull();
    });
  });

  describe('error handling', () => {
    it('sets syncError and preserves syncedAt when fetch throws', async () => {
      const p = await projects.add({ name: 'Failing' });
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network timeout'));

      await engine.run();

      const updated = await projects.getOne(p.id);
      expect(updated!.syncError).toBe('Network timeout');
      expect(updated!.syncedAt).toBe(0);
      expect(updated!.updatedAt).toBeGreaterThan(updated!.syncedAt);
    });

    it('sets syncError when server returns a non-2xx status', async () => {
      const p = await projects.add({ name: 'ServerError' });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await engine.run();

      const updated = await projects.getOne(p.id);
      expect(updated!.syncError).toBe('500');
    });

    it('does not update lastSyncedAt when sync fails', async () => {
      localStorage.setItem('rewild.sync.lastSyncedAt.user-1', '1000');
      (global.fetch as jest.Mock).mockRejectedValue(new Error('fail'));

      await engine.run();

      expect(localStorage.getItem('rewild.sync.lastSyncedAt.user-1')).toBe('1000');
    });
  });

  describe('conflict resolution', () => {
    it('applies a server record when local is clean', async () => {
      const p = await projects.add({ name: 'LocalName' });
      await projects.markSynced(p.id, p.updatedAt, null);

      const serverUpdatedAt = p.updatedAt + 1000;
      (global.fetch as jest.Mock).mockResolvedValue(
        syncResponse({
          syncedAt: 5000,
          records: [
            {
              collection: 'projects',
              id: p.id,
              updatedAt: serverUpdatedAt,
              data: { ...p, name: 'ServerName', updatedAt: serverUpdatedAt },
            },
          ],
        })
      );

      await engine.run();

      const local = await projects.getOne(p.id);
      expect(local!.name).toBe('ServerName');
      expect(local!.syncedAt).toBe(5000);
    });

    it('skips a pulled record when local is dirty', async () => {
      const p = await projects.add({ name: 'LocalName' });
      // Simulate the record becoming dirty after getDirty() was called (it won't be pushed)
      jest.spyOn(projects, 'getDirty').mockResolvedValueOnce([]);

      (global.fetch as jest.Mock).mockResolvedValue(
        syncResponse({
          syncedAt: 5000,
          records: [
            {
              collection: 'projects',
              id: p.id,
              updatedAt: p.updatedAt + 1000,
              data: { ...p, name: 'ServerName' },
            },
          ],
        })
      );

      await engine.run();

      const local = await projects.getOne(p.id);
      expect(local!.name).toBe('LocalName');
    });

    it('inserts a new record from the server that does not exist locally', async () => {
      const serverId = 'server-only-id';
      (global.fetch as jest.Mock).mockResolvedValue(
        syncResponse({
          syncedAt: 5000,
          records: [
            {
              collection: 'projects',
              id: serverId,
              updatedAt: 3000,
              data: { id: serverId, name: 'NewFromServer', updatedAt: 3000 },
            },
          ],
        })
      );

      await engine.run();

      const local = await projects.getOne(serverId);
      expect(local).not.toBeNull();
      expect(local!.name).toBe('NewFromServer');
      expect(local!.syncedAt).toBe(5000);
    });
  });

  describe('lastSyncedAt', () => {
    it('saves lastSyncedAt after a successful sync', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(syncResponse({ syncedAt: 7777 }));

      await engine.run();

      expect(localStorage.getItem('rewild.sync.lastSyncedAt.user-1')).toBe('7777');
    });

    it('scopes lastSyncedAt per user', async () => {
      localStorage.setItem('rewild.sync.lastSyncedAt.user-2', '9999');
      (global.fetch as jest.Mock).mockResolvedValue(syncResponse({ syncedAt: 1234 }));

      await engine.run();

      expect(localStorage.getItem('rewild.sync.lastSyncedAt.user-1')).toBe('1234');
      expect(localStorage.getItem('rewild.sync.lastSyncedAt.user-2')).toBe('9999');
    });
  });

  describe('in-memory event log', () => {
    it('logs a pushed event for each dirty record sent successfully', async () => {
      await projects.add({ name: 'A' });
      await projects.add({ name: 'B' });

      await engine.run();

      const pushed = engine.log.filter((e) => e.status === 'pushed');
      expect(pushed).toHaveLength(2);
      expect(pushed[0].collection).toBe('projects');
    });

    it('logs a pulled event for each record received from server', async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        syncResponse({
          syncedAt: 5000,
          records: [
            { collection: 'levels', id: 'srv-1', updatedAt: 100, data: { id: 'srv-1', name: 'L', updatedAt: 100 } },
          ],
        })
      );

      await engine.run();

      const pulled = engine.log.filter((e) => e.status === 'pulled');
      expect(pulled).toHaveLength(1);
      expect(pulled[0].recordId).toBe('srv-1');
      expect(pulled[0].collection).toBe('levels');
    });

    it('logs a failed event for each record when sync errors', async () => {
      await projects.add({ name: 'Failing' });
      await levels.add({ name: 'Also failing' });
      (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

      await engine.run();

      const failed = engine.log.filter((e) => e.status === 'failed');
      expect(failed).toHaveLength(2);
      expect(failed[0].error).toBe('offline');
    });

    it('caps the event log at 50 entries', async () => {
      for (let i = 0; i < 55; i++) {
        await projects.add({ name: `Project ${i}` });
      }
      // Run sync 55 times, one dirty record each (clear and re-add between runs)
      // Simpler: push one batch of 55 records
      (global.fetch as jest.Mock).mockResolvedValue(syncResponse({ syncedAt: 1000 }));

      await engine.run();

      expect(engine.log.length).toBeLessThanOrEqual(50);
    });

    it('includes a timestamp on each event', async () => {
      await projects.add({ name: 'Timestamped' });
      await engine.run();

      expect(engine.log[0].timestamp).toBeGreaterThan(0);
    });
  });
});
