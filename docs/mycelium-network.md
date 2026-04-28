## Server Strategy — Mycelium

Mycelium is the underground fungal network that connects trees and plants, enabling them to share nutrients and communicate beneath the surface. It is the hidden infrastructure that makes everything above ground possible. This backend initiative takes the same role in RE-WILD — invisible to the user, but the layer that connects devices, persists data, and keeps the world alive across sessions.

RE-WILD is designed as an **offline-first application**. Users can create and edit projects and levels without an account. The server is optional — it enables cross-device access and persistence beyond the local machine. When a user logs in, their local data is synced to the server and becomes available on any device.

The current `FirestoreDataTable` and Firebase auth are throwaway placeholders. They will be replaced by a self-hosted backend described here.

---

### Architecture Decisions

**Offline-first, local always active**

The local `IndexedDB` store is always the active data source. The app never reads directly from the server during normal use — even when logged in. The server is a sync target, not a live data source. This keeps the app fast, works without a connection, and simplifies the client data layer.

**Write-through on explicit save, full sync on login**

The editor requires an explicit user save action — it does not auto-save on every interaction. On save, the record is written to `LocalDataTable` first (always succeeds), then immediately pushed to the corresponding server endpoint if the user is logged in. The server push is best-effort: if it fails, the record stays dirty and is picked up by the next full sync. The client never blocks the save on the network result.

On login (or first load on a new device), a full bidirectional `SyncEngine.run()` reconciles any divergence — offline edits, failed pushes, multi-device differences. Each record tracks `updatedAt` and `syncedAt` to drive this diff.

**Last-write-wins conflict resolution**

RE-WILD is a single-user editor. Concurrent edits from two devices are possible but uncommon. The merge strategy is: if the server has a newer `updatedAt` for a record and the local copy hasn't been touched since the last sync, the server version wins. If local is dirty, local wins. For level data specifically, the client may surface a simple "conflict detected" dialog — but this is a UX decision deferred until it becomes a real user problem.

**REST, not GraphQL**

The sync API is a single batch endpoint plus standard CRUD. GraphQL's schema overhead and toolchain cost are not justified for two entity types and one primary operation.

**Self-hosted Kotlin backend on Scaleway**

Firebase is removed entirely. The backend is a [Ktor](https://ktor.io/) application (Kotlin) deployed as a Scaleway Serverless Container. Ktor is lightweight, coroutines-native, and has excellent support for REST, JWT auth, and WebSockets if realtime features are added later. Data is stored in a Scaleway Managed PostgreSQL instance. Serverless Containers handle TLS, scaling, and deployment automatically — no server management required. Cold starts on the JVM are acceptable given that the sync only fires on login and explicit saves, not on every user interaction.

---

### Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend framework | [Ktor](https://ktor.io/) | Kotlin, coroutines-based, minimal overhead |
| ORM | [Exposed](https://github.com/JetBrains/Exposed) | Kotlin SQL DSL, works well with Ktor |
| Migrations | [Flyway](https://flywaydb.org/) | SQL migration files, runs on server startup |
| Database | PostgreSQL (Scaleway Managed DB) | One instance, `projects` + `levels` + `assets` tables |
| Asset storage | Scaleway Object Storage (S3-compatible) | Single public bucket, MinIO locally |
| Auth | JWT (ktor-server-auth-jwt) | Stateless, issued on login, refresh token in HttpOnly cookie |
| Hosting | Scaleway Serverless Containers | Managed TLS, scales to zero, no server management |
| Local dev DB | PostgreSQL via Docker Compose | Matches prod schema exactly |
| Client HTTP | `fetch` (native) wrapped in a thin `ApiDataTable` | No external HTTP library needed |
| API contract | OpenAPI spec via [Kompendium](https://github.com/bkbnio/kompendium) | Auto-generated from Kotlin routes on server startup |
| Type generation | [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) | `npx openapi-typescript` — no extra install, generates `src/api/types.ts` |

---

### Data Model Strategy

**Kotlin is the single source of truth for all model definitions.** The server defines every model as a fully typed Kotlin data class with `@Serializable`. The server validates all incoming data against these types — malformed or unexpected payloads are rejected at the API boundary. The client's hand-authored `models` package is eventually replaced entirely by types generated from the server's OpenAPI spec.

The generation chain:

```
Kotlin data classes (@Serializable)
  → auto-generate → openapi.yaml  (Kompendium, on server startup)
    → generate → src/api/types.ts  (openapi-typescript, via npm script)
```

Developer workflow to regenerate types after a server model change:

```bash
cd server && ./gradlew run     # starts server, writes openapi.yaml to repo root
npm run generate:types         # npx openapi-typescript openapi.yaml -o src/api/types.ts
```

No additional downloads required — `openapi-typescript` runs via `npx`.

**Fully typed models with JSONB for complex nested sub-objects**

Knowing the full type and having a column per field are separate decisions. Top-level fields the server reasons about (`id`, `userId`, `name`, `updatedAt`, `syncedAt`) are proper typed columns. Complex nested sub-objects that the server stores but does not query into (`terrain`, `atmosphere`, `fog`) are stored as `jsonb` columns — but they are still fully typed in Kotlin. The server validates their structure on every write.

Example Kotlin model:

```kotlin
@Serializable
data class Level(
    val id: String,
    val userId: String,
    val name: String,
    val updatedAt: Long,
    val syncedAt: Long,
    val terrain: TerrainConfig,
    val atmosphere: AtmosphereConfig,
    val fog: FogConfig
)

@Serializable
data class FogConfig(
    val density: Float,
    val color: ColorRGB,
    val nearDistance: Float,
    val farDistance: Float
)
```

The Postgres schema for `levels`:

| Column | Type | Purpose |
|---|---|---|
| `id` | `text` | Primary key |
| `user_id` | `text` | Scopes all queries to the owning user |
| `name` | `text` | Queryable top-level field |
| `updated_at` | `bigint` | ms timestamp — drives conflict resolution |
| `synced_at` | `bigint` | ms timestamp — set by server on successful sync |
| `sync_error` | `text` | last sync error message, null when clean |
| `terrain` | `jsonb` | Fully typed in Kotlin, stored as blob |
| `atmosphere` | `jsonb` | Fully typed in Kotlin, stored as blob |
| `fog` | `jsonb` | Fully typed in Kotlin, stored as blob |

**Migrations**

Migrations are managed by [Flyway](https://flywaydb.org/), which integrates cleanly with Ktor and runs on startup. SQL migration files live in `server/src/main/resources/db/migration/`.

- **Adding a field with a default value** — add to the Kotlin data class with a default, add a Flyway migration to `ALTER TABLE ADD COLUMN`. Existing rows deserialize fine with the default filling in.
- **Renaming a field** — write an explicit Flyway migration (`ALTER TABLE RENAME COLUMN`). This is the right behaviour: renames are structural changes that should be tracked and auditable.
- **New nested sub-object field** — add to the Kotlin data class with a default. No SQL migration needed — JSONB columns expand automatically. Existing rows deserialize and the new field defaults in.

**TypeScript types on the client**

The generated `src/api/types.ts` from `openapi-typescript` produces complete types for all models including nested sub-objects — `Level`, `FogConfig`, `TerrainConfig` etc. These replace the hand-authored interfaces in the `models` package over time. The `models` package is not deleted in one go — types are migrated across as each model stabilises on the server.

On the server, `userId` scopes all queries — users can only see their own data.

---

### Client Architecture

The `IDataTable` interface stays unchanged. Three implementations exist:

```
IDataTable<T>
  ├── LocalDataTable<T>    — IndexedDB (always active, current impl)
  ├── ApiDataTable<T>      — REST calls to the Ktor server (replaces FirestoreDataTable)
  └── (FirestoreDataTable  — removed)
```

A `SyncEngine` sits above `IDataTable` and orchestrates the merge. It is not part of `IDataTable` — the sync concern is separate from the CRUD concern.

```
Database
  ├── projects: LocalDataTable   ← all reads/writes go here
  ├── levels:   LocalDataTable
  └── sync: SyncEngine
        ├── reads from LocalDataTable (dirty records)
        ├── calls ApiDataTable (push/pull)
        └── writes back to LocalDataTable (mark syncedAt)
```

```
Save (user action)
  → LocalDataTable.put(record)        — always succeeds, source of truth
  → if logged in: PUT /api/:collection/:id   — best-effort push
        ✓ success: set syncedAt on record
        ✗ failure: record stays dirty, syncError set on record

Login / new device
  → SyncEngine.run()                  — full bidirectional sync
        pulls server records newer than lastSyncedAt
        pushes all local dirty records
        clears syncError on successfully synced records
```

**`Database.goOnline()` is replaced.** The new pattern:

```typescript
// Always available, no login required
db.projects.getMany(...)   // hits LocalDataTable

// On explicit save
await db.projects.save(record);   // local write + server push if logged in

// After login
auth.login(token);
await db.sync.run();       // SyncEngine pulls/pushes to server
```

---

### Sync Protocol

**Endpoint:** `POST /api/sync`

Request body:
```json
{
  "lastSyncedAt": 1714300000000,
  "records": [
    { "collection": "projects", "id": "...", "updatedAt": 1714305000000, ...data },
    { "collection": "levels",   "id": "...", "updatedAt": 1714306000000, ...data }
  ]
}
```

Response body:
```json
{
  "syncedAt": 1714310000000,
  "records": [
    { "collection": "projects", "id": "...", "updatedAt": 1714308000000, ...data }
  ]
}
```

Server logic:
1. For each incoming record: upsert if `updatedAt` is newer than what the server has
2. Return all server records where `updatedAt > lastSyncedAt` (things the client doesn't have yet)
3. Client merges returned records into `LocalDataTable`, updates `syncedAt` on all affected records

**New device / first login:** client sends `lastSyncedAt: 0` with zero dirty records. Server returns everything. Client populates local store.

---

### Sync Error Handling

Two complementary mechanisms — no dedicated log table needed at this stage.

**Per-record `syncError` field**

Each record in `LocalDataTable` carries an optional `syncError: string | null`. When a server push or sync fails, the error message is stored on the record. On the next successful sync, it is cleared. This survives page refresh and makes it easy to query "which records have a pending error."

```typescript
interface SyncableRecord {
  updatedAt: number;
  syncedAt: number;
  syncError: string | null;   // e.g. "Network timeout", "403 Forbidden"
}
```

The dirty flag (`updatedAt > syncedAt`) already drives retry — no separate retry queue needed. `syncError` just surfaces *why* the last attempt failed.

**In-memory session log in `SyncEngine`**

`SyncEngine` maintains a bounded in-memory log (last 50 events) for the current session:

```typescript
type SyncEvent = {
  timestamp: number;
  collection: string;
  recordId: string;
  status: 'pushed' | 'pulled' | 'failed';
  error?: string;
};
```

This powers a live sync-status indicator in the UI (e.g. a small "sync failed" badge) without any IndexedDB overhead. It is cleared on page reload — that is fine, since `syncError` on each record carries the durable state.

A full persistent `syncLog` table is deferred until there is a concrete user need for sync history.

---

### Binary Asset Storage

**Single public bucket, organized by level**

All binary assets (e.g. terrain chunks, heightmaps) live in a single Scaleway Object Storage bucket (`rewild-assets`). The bucket is publicly readable — any object can be fetched by URL without authentication. Writes are always authenticated through Ktor.

The key structure mirrors the data hierarchy:

```
levels/{levelId}/{assetType}/{filename}
```

For example:
```
levels/a7f3c2d1-.../chunks/32_16.bin
levels/a7f3c2d1-.../chunks/32_17.bin
```

The public URL is deterministic: `{BUCKET_BASE_URL}/levels/{levelId}/chunks/32_16.bin`. No auth is required to fetch it — possession of the URL is sufficient. Since `levelId` is a UUID, URLs are not guessable or enumerable.

**The DB owns the relationships, not the bucket**

The bucket has no inherent concept of ownership or access. PostgreSQL records which assets exist, which level they belong to, and what their storage key is. Clients derive the public URL from the storage key. The bucket is a dumb byte store.

**Upload flow**

Binary assets are never routed through Ktor — proxying them through the server would double bandwidth cost for no benefit. Instead the client requests a presigned PUT URL from Ktor and uploads directly to object storage:

```
1. Client → POST /api/assets/upload-url  (JWT required)
            body: { levelId, assetType, filename }

2. Server → validates JWT + ownership of levelId
            inserts unconfirmed asset record into DB (storage_key, levelId, confirmed: false)
            generates presigned PUT URL (15 min TTL)
            returns: { uploadUrl, publicUrl }

3. Client → PUT {uploadUrl}  binary body direct to object storage — no Ktor involved

4. Client → POST /api/assets/confirm  (JWT required)
            body: { storageKey }
            server sets confirmed: true on the DB record
```

The confirm step ensures the DB only reflects completed uploads. If step 3 fails, the unconfirmed record stays and the client retries from step 1. Unconfirmed records older than 1 hour can be purged by a background job.

**DB schema for assets**

| Column | Type | Purpose |
|---|---|---|
| `id` | `text` | Primary key (UUID) |
| `level_id` | `text` | FK to levels — scopes ownership, cascade deletes |
| `asset_type` | `text` | e.g. `"chunk"`, `"heightmap"` |
| `storage_key` | `text` | Full object key, e.g. `levels/{id}/chunks/32_16.bin` |
| `confirmed` | `boolean` | True once upload completed successfully |
| `created_at` | `bigint` | ms timestamp |

The public URL is always `{BUCKET_BASE_URL}/{storage_key}`. `BUCKET_BASE_URL` is an env var — never hardcoded.

**Deletion**

When a level is deleted, all its assets are removed with a single prefix delete on `levels/{levelId}/` — a native S3 batch operation that does not require iterating individual records. The `assets` DB rows are removed by cascading FK delete on `level_id`.

**Local development**

[MinIO](https://min.io/) replaces Scaleway Object Storage locally. It is S3-compatible and supports presigned URLs identically. Add to `docker-compose.yml`:

```yaml
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: rewild
      MINIO_ROOT_PASSWORD: rewild
    ports:
      - "9000:9000"
      - "9001:9001"
```

Additional local env vars:
```
BUCKET_BASE_URL=http://localhost:9000/rewild-assets
BUCKET_NAME=rewild-assets
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=rewild
S3_SECRET_KEY=rewild
```

---

### Auth Flow

1. User clicks "Login" → redirect to login page (email/password or OAuth provider via Ktor)
2. Server issues a short-lived JWT (15 min) + long-lived refresh token in an HttpOnly cookie
3. Client stores JWT in memory (not localStorage — avoids XSS exposure)
4. `ApiDataTable` attaches JWT as `Authorization: Bearer <token>` on every request
5. On JWT expiry, client calls `POST /api/auth/refresh` using the HttpOnly cookie to get a new JWT silently
6. On logout, refresh token is revoked server-side

Anonymous users have no JWT. `SyncEngine.run()` is a no-op if not authenticated.

---

### Ktor Server Structure

```
server/
  src/main/kotlin/
    Application.kt          — Ktor entry point, plugin setup
    models/
      Level.kt              — Level + nested sub-types (TerrainConfig, FogConfig etc.)
      Project.kt            — Project model
      SyncModels.kt         — SyncRequest / SyncResponse envelope types
    auth/
      AuthRoutes.kt         — /api/auth/login, /refresh, /logout
      JwtService.kt         — token issuance and validation
    assets/
      AssetRoutes.kt        — /api/assets/upload-url, /api/assets/confirm
      AssetService.kt       — presigned URL generation, DB record management
      S3Client.kt           — S3-compatible client (Scaleway / MinIO)
    sync/
      SyncRoutes.kt         — POST /api/sync
      SyncService.kt        — merge logic
    db/
      DatabaseFactory.kt    — Exposed + Flyway connection setup
      tables/
        ProjectsTable.kt
        LevelsTable.kt
        AssetsTable.kt
  src/main/resources/
    application.conf                    — port, JWT secret, DB URL (env vars)
    db/migration/
      V1__create_projects.sql
      V1__create_levels.sql
  build.gradle.kts
```

---

### Local Development

**Prerequisites:** Docker, Docker Compose, JDK 17+

```bash
# Start local PostgreSQL
docker compose up -d db

# Run Ktor server with hot reload
./gradlew run

# Server runs at http://localhost:8080
```

`docker-compose.yml` (server root):
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: rewild
      POSTGRES_USER: rewild
      POSTGRES_PASSWORD: rewild
    ports:
      - "5432:5432"
```

Environment variables for local dev (`.env` in server root, never committed):
```
DB_URL=jdbc:postgresql://localhost:5432/rewild
DB_USER=rewild
DB_PASSWORD=rewild
JWT_SECRET=local-dev-secret
JWT_ISSUER=http://localhost:8080
REFRESH_TOKEN_SECRET=local-dev-refresh-secret
BUCKET_BASE_URL=http://localhost:9000/rewild-assets
BUCKET_NAME=rewild-assets
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=rewild
S3_SECRET_KEY=rewild
```

The client dev server (`npm run start`) proxies `/api/*` to `localhost:8080` via the esbuild dev config so no CORS issues during development.

---

### Deployment to Scaleway

**Infrastructure:**
- 1x Scaleway Serverless Container (Ktor server, scales to zero)
- 1x Scaleway Managed Database for PostgreSQL (smallest tier)
- 1x Scaleway Object Storage bucket (`rewild-assets`, public read)
- 1x Scaleway Container Registry (stores the Docker image)

TLS is handled automatically by Scaleway — no Caddy or reverse proxy needed.

**Deployment steps:**

1. **Build and push the Docker image:**
   ```bash
   ./gradlew buildFatJar
   docker build -t rewild-server .
   docker tag rewild-server rg.<region>.scw.cloud/<namespace>/rewild-server:latest
   docker push rg.<region>.scw.cloud/<namespace>/rewild-server:latest
   ```

2. **On first deploy** — create the Serverless Container via the Scaleway console or CLI, pointing at the registry image and setting environment variables.

3. **Production environment variables** (set in Scaleway Serverless Container config):
   ```
   DB_URL=jdbc:postgresql://<scaleway-db-host>:5432/rewild
   DB_USER=...
   DB_PASSWORD=...
   JWT_SECRET=<strong-random-secret>
   JWT_ISSUER=https://api.rewild.app
   REFRESH_TOKEN_SECRET=<strong-random-secret>
   BUCKET_BASE_URL=https://rewild-assets.s3.<region>.scw.cloud
   BUCKET_NAME=rewild-assets
   S3_ENDPOINT=https://s3.<region>.scw.cloud
   S3_ACCESS_KEY=<scaleway-access-key>
   S3_SECRET_KEY=<scaleway-secret-key>
   ```

**Deployments thereafter:**
```bash
./gradlew buildFatJar
docker build -t rewild-server .
docker tag rewild-server rg.<region>.scw.cloud/<namespace>/rewild-server:latest
docker push rg.<region>.scw.cloud/<namespace>/rewild-server:latest
# Scaleway redeploys automatically when the registry image is updated
```

A GitHub Actions workflow can automate the build and push on merge to `main`.

---

### Current Code Status

| File | Status | Notes |
|---|---|---|
| `src/database/local-db.ts` | Keep | Core local store, needs `updatedAt`/`syncedAt` fields added to writes |
| `src/database/firestore-db.ts` | Remove | Replaced by `ApiDataTable` |
| `src/database/database.ts` | Refactor | Remove `goOnline()`, add `SyncEngine` |
| `src/firebase.ts` | Remove | Firebase dependency removed entirely |
| `models/` package | Migrate | Hand-authored interfaces replaced by generated types from OpenAPI as each model stabilises on the server |