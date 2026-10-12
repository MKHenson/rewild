# Project Selection

Working doc. It is for planning this work, not a milestone write up. Delete it when the work ships.

## Goal

A player can start one of two kinds of game from the main menu:

- **Story Mode:** the one game that a super admin promotes. All players can play it, also logged out players.
- **My Games:** projects the player made, and projects other users shared with them.

In this doc, "admin" always means a super admin: `UserRole.SUPER_ADMIN`, checked by `SuperAdminGuard`. There is no other admin role.

---

## Decisions

| Topic | Decision |
|---|---|
| Unit of play | The player picks a project, not a level. Each project names its start level |
| Levels | A project can have many levels. The UI allows one for now, but the model and API must not assume one |
| Start level | `project.levelId` is the start level. The owner picks it in Project Settings. `activeOnStartup` is removed |
| Public game | One promoted project. Admins set it at `/admin/public`. It uses the project's start level |
| Public game edits | The public game is the live project. Admin edits reach players at once. A publish snapshot is out of scope |
| Logged out players | They can play Story Mode. My Games shows only their local projects |
| Sharing | Only for logged in users and projects saved on the server. A share gives play access, not edit access |
| Admin access | Super admins can see and run all projects from an admin-only tab. This is a stopgap. Privacy improves later |
| Remote projects | Shared projects and the public project sync down read-only. The game loads them from the local DB, as it does today |
| Local copies | A synced remote project stays on the device. Each play syncs only the changes. Clearing browser storage removes it, and the next play downloads it again |
| Delete | Only logged in users can delete, and only projects saved on the server. Local only projects cannot be deleted |
| Flagged project | The project cannot be played or shared. Players see a general message that tells them to contact an admin |
| List order | Projects sort by `updatedAt`, newest first |
| Project image | The owner uploads an image in Project Settings. It is stored in the bucket under the user and the project. A new image deletes the old one. Size limit: 2 MB |
| Bucket layout | All project files live under `users/{userId}/projects/{projectId}/`, level files too. There are no live projects, so there is no data migration |

---

## Main menu and `/launch`

- The New Game button opens `/launch`.
- `/launch` is a modal with vertical tabs, the same pattern as the admin screen. It can go back to the main menu.

### Story Mode tab

- Calls `GET /api/public-game`.
- Shows the project image and the project description.
- The Start button is enabled only when a public game is set. Start opens `/game`.
- A direct visit to `/game` when no public game is set shows an error.

### My Games tab

- A short text explains that the list shows the player's own games and games shared with them.
- A table of projects on one side and the project details on the other.
- A filter switches between 'My Games' and 'Shared Games'. Logged out players do not see the filter.
- The details show the author, the dates and times, and the levels.
- Start opens `/game/{projectId}`. The game starts at the project's start level.
- If the player has no access, or the project is flagged, the game shows an error.

---

## Editor: Project Settings dialog

The project settings pane (`ProjectSettings.tsx`) was temporary. It moves into a dialog.

- A new Project Settings button on the editor toolbar (`RibbonButtons.tsx`) opens the dialog.
- The dialog is a modal with vertical tabs. The pane is removed from the editor layout.

### General tab

- Name and description, both editable. Story Mode and My Games show the description.
- An image, with an upload control to change it (see Project image).
- Last modified, last published and start event, as the pane shows today.
- A start level dropdown. It lists the project's levels and sets `project.levelId`. Today it has one entry.
- 'Active on Startup' is removed.

### Project image

- The owner picks an image file. The client uploads it to the bucket, then the image shows at once.
- The upload control shows only for logged in users and projects saved on the server, the same rule as sharing. Other projects show a placeholder image.
- Story Mode, My Games and the admin Projects tab show the image, or the placeholder.

### Sharing tab

- Shown only to logged in users, for projects saved on the server. Otherwise the tab shows why it is not available.
- Lists the current shares: the user, who granted the share, and when.
- A user picker adds a share (see User picker).
- Each share has a Revoke button.

### User picker

A reusable component, so other screens can use it later.

- **`rewild-ui`:** a generic `Autocomplete` component. It takes an async search function and an item renderer. It knows nothing about users.
- **App:** a `UserPicker` that wraps `Autocomplete` and calls `GET /api/users/search`.
- Each result shows the avatar (`photoUrl`) and the display name.
- **Privacy:** the search matches a display name by prefix, or an email by an exact match only. The API never returns another user's email. This stops a user from listing all emails.

---

## Admin: `/admin/public`

- A new Public tab in the admin panel, at `/admin/public`.
- A 'Promoted Content' section with a short text: all players see and play this project.
- A project picker, pre-selected with the current public project. It can be cleared, then there is no Story Mode.
- No level picker. The game uses the project's start level.
- A Save button sets the public project.

---

## Server

### Public game

- New table `public_game`: a single row with `project_id` (nullable).
- `GET /api/public-game`: no auth. It returns the promoted project, its levels, and what the game needs to load them. It can return only the promoted project.
- `PUT /api/public-game`: super admins only (`SuperAdminGuard`). It rejects a project that is flagged or not saved on the server.

### Bucket layout

```
users/{userId}/projects/{projectId}/
  image/{uuid}.{ext}                          project image
  levels/{levelId}/{assetType}/{filename}     level files (was levels/{levelId}/...)
```

- `AssetService.requestUploadUrl` builds the new level key. It looks up the level's `projectId` and owner.
- `AssetCleanupService.prefixFor` uses the new prefix. A project delete can remove the whole `users/{userId}/projects/{projectId}/` prefix.
- The client does not change. It treats `storageKey` as an opaque value.
- Existing dev data under `levels/` is removed. There are no live projects to migrate.

### Project image

- **Bucket key:** `users/{userId}/projects/{projectId}/image/{uuid}.{ext}`. A new uuid for each upload, so browsers and the CDN never show an old image.
- **Storage:** a new `image_key` column on `projects`. The image is not an `assets` row, because `assets.level_id` cannot be null.
- `POST /api/projects/{id}/image/upload-url`: owner only. It returns a presigned PUT URL. It accepts PNG, JPEG and WebP only, with a maximum size of 2 MB.
- `POST /api/projects/{id}/image/confirm`: owner only. It checks that the object exists and is within the size limit. It sets `image_key`, then queues the old object for deletion.
- The project read APIs and `GET /api/public-game` return the image URL.
- A project delete also deletes its image.

### Project access

- `GET /api/projects?scope=mine|shared` lists the projects the caller owns or that are shared with the caller.
- `GET /api/projects/{id}` and the level reads allow the owner and users with a share. All other callers get `404`, so the API does not show that the project exists.
- A flagged project returns an error with a general message for all callers except the owner and super admins. The owner still sees the project in the editor.

### Sharing

- New table `project_shares`: `project_id`, `user_id`, `granted_by`, `created_at`. The pair `project_id` + `user_id` is unique.
- The owner manages the shares:
  - `GET /api/projects/{id}/shares` lists them
  - `POST /api/projects/{id}/shares` adds one
  - `DELETE /api/projects/{id}/shares/{userId}` revokes one
- The server rejects a share for a flagged project.
- Shared projects sync down read-only (see Game loading).

### User search

- `GET /api/users/search?q=`: logged in users only.
- Returns at most 10 results: `id`, `displayName`, `photoUrl`. It does not return the caller.
- Matches a display name by prefix (2 characters minimum), or an email by an exact match.

### Delete

- `DELETE /api/projects/{id}` is the only way to delete a project. Only the owner can call it.
- The server deletes the project, its levels and its shares, and queues the assets for clean up.
- The server keeps the `deleted_at` tombstone, so the owner's other devices drop the project on their next sync.
- `/api/sync` stops accepting `deletedAt` from the client.
- The server rejects the delete of the public project with `409` and a message.
- **Client:** the delete button shows only for logged in users and projects saved on the server. The UI disables it for the public project. The client removes its local copy only after the server returns success.

### Admin projects

- `GET /api/admin/projects`: super admins only (`SuperAdminGuard`). It lists all projects with paging and sorting: name, author, updated, flag state.
- Super admins can read and run any project. This is the stopgap from the Decisions table.

### Flagging

Flagging is a way to stop a bad project fast. Keep it simple.

- New columns on `projects`: `flagged_at`, `flagged_by`.
- `POST /api/projects/{id}/flag` and `DELETE /api/projects/{id}/flag`: super admins only (`SuperAdminGuard`).
- An admin cannot flag the public project. Unpromote it first.
- A flagged project does not sync down to users with a share. The next sync removes their local copy.

---

## Admin: `/admin/projects`

- A new Projects tab in the admin panel, at `/admin/projects`.
- A table of all user projects, with paging and sorting.
- Each row has a link that runs the project.
- Each row has a Flag / Unflag action. A confirm dialog comes before the action.

---

## Game loading

`GameLoader.loadInitialLevels` loads the first `activeOnStartup` project from the local DB. The terrain data (chunk snapshots, biome masks, scatter masks, water edits, water bodies, scatter kills) comes from local files. A public or shared project is not on the device, so it cannot load today.

The player must get the assets that the creator saved. So remote projects sync down into the local DB and the local asset store, and the game loads all projects the same way.

### Loader

- The loader takes a project id instead of reading `activeOnStartup`.
- It loads the start level from `project.levelId`.
- It reads from the local DB for all projects: own, shared and public.

### Read-only sync

- **Pull:** the sync pull returns the caller's own projects, the projects shared with them, and the public project. It includes their levels and assets.
- **Revoke and flag:** the sync response lists the remote project ids the caller can read. The client removes local remote projects that are not on the list. This covers revoked shares, flagged projects and a changed public project.
- **Push:** the client pushes only records it owns. The server `upsert` already rejects records that another user owns. That stays as the backstop.
- **Writes:** the local tables reject a write to a record the user does not own. The editor does not open a remote project.
- **Logged out players:** they cannot call `/api/sync`. For Story Mode, `GET /api/public-game` returns the project, its levels and the asset list. The client writes them into the local DB as read-only, then loads as usual.
- **Updates:** a remote project syncs again before each play, so the player gets the creator's latest save.

### Future: player changes to the world (out of scope)

This is the agreed direction. It is too soon to design it in detail.

A later feature can let players change the world, for example to flatten terrain before they build. Do not write player changes into the creator's chunks. Store them as a separate layer of world edits on top of the authored level. Reasons:

- The authored level stays intact. The creator can keep editing it, and the world can be reset.
- Creator edits and player edits do not conflict on the same chunk files.
- A project setting can choose the scope: off, one layer for each player, or one shared layer for all players. A shared layer gives the No Man's Sky behaviour.

Nothing in this work builds the layer. The read-only rules above must not block it later.

### Future: player progress (out of scope)

The game will have progression, so play will write data to tables.

- Progress belongs to the player, not to the project. It is never part of the creator's read-only data.
- A logged out player's progress is stored only on the device. If they clear their browser storage, they lose it. That is the risk of not signing in.
- When the player signs in, sync pushes the local progress to their account. That is the only way to keep it.

---

## TODOs

Each TODO becomes one GitHub ticket. The order follows the dependencies. "Expect" is what is true when the ticket is done.

- [ ] **1. Start level replaces `activeOnStartup`**
  - Scope: remove `activeOnStartup` from projects (client, server, migration). `project.levelId` is the start level. `GameLoader` takes a project id and loads its start level. New route `/game/{projectId}`. The editor's play action uses it.
  - Expect: the game plays the project you open, from its start level. No code reads `activeOnStartup`. No code assumes one level for each project, other than the UI.
  - Depends on: nothing.

- [ ] **2. Explicit project delete**
  - Scope: `DELETE /api/projects/{id}` deletes the project, its levels and its assets, and keeps the tombstone. `/api/sync` stops accepting `deletedAt` from the client. The client calls the API, then removes the local copy. The delete button shows only for logged in users and projects saved on the server.
  - Expect: a local only project cannot be deleted. A delete on one device removes the project on the owner's other devices after their next sync. A failed delete leaves the local copy in place.
  - Depends on: nothing.

- [ ] **3. Project Settings dialog: General tab**
  - Scope: a Project Settings button on the editor toolbar opens a modal with vertical tabs. The General tab edits the name and the description, and holds the other fields from `ProjectSettings.tsx` and a start level dropdown. The pane is removed from the editor layout.
  - Expect: the owner edits the name, the description and the start level (one entry for now). The editor has no project settings pane. The dialog can take more tabs.
  - Depends on: 1.

- [ ] **4. Bucket layout and project image**
  - Scope: level files move to `users/{userId}/projects/{projectId}/levels/{levelId}/...` in `AssetService` and `AssetCleanupService`. Remove the old dev data under `levels/`. Then the project image: the `image_key` column, the upload URL and confirm endpoints, and the bucket key `users/{userId}/projects/{projectId}/image/{uuid}.{ext}`. A new image queues the old one for deletion. The project delete from ticket 2 deletes the image. The General tab gets the image upload control and a placeholder.
  - Expect: all files for a project are under one bucket prefix, and a project delete removes that prefix. The owner uploads a PNG, JPEG or WebP image up to 2 MB and sees it at once. The bucket holds one image for each project. A file of the wrong type or size is rejected with a message.
  - Depends on: 2, 3.

- [ ] **5. Public game: server and `/admin/public`**
  - Scope: `public_game` table. `GET /api/public-game` with no auth, which returns the project, its image URL, its levels and the asset list. `PUT /api/public-game` for super admins only (`SuperAdminGuard`). The delete API returns `409` for the public project. A Public tab at `/admin/public` with a project picker and a Save button.
  - Expect: an admin promotes a project or clears the promotion. A logged out request to `GET /api/public-game` returns the promoted project and nothing else. The public project cannot be deleted.
  - Depends on: 2.

- [ ] **6. Read-only sync of remote projects**
  - Scope: the sync pull adds the public project, and returns the list of remote project ids the caller can read. The client removes remote projects that are not on the list. The client pushes only records it owns. The local tables reject writes to records the user does not own. The editor does not open a remote project. Logged out players get the public project from `GET /api/public-game` into the local DB.
  - Expect: a logged in or logged out player has the public project and its assets on the device, read-only. A changed promotion removes the old copy. Each play syncs only the changes. The remote id list works for shares when ticket 10 adds them.
  - Depends on: 1, 5.

- [ ] **7. `/launch` screen: Story Mode tab**
  - Scope: New Game opens `/launch`, a modal with vertical tabs and a way back to the main menu. The Story Mode tab shows the image, the description and Start. Start syncs the public project, then opens `/game`.
  - Expect: any player, logged in or not, plays the public game from the main menu. Start is disabled when no game is promoted. A direct visit to `/game` with no promotion shows an error.
  - Depends on: 4, 6.

- [ ] **8. `/launch` screen: My Games tab (own projects)**
  - Scope: a table of the player's projects, newest first, with a details side that shows the image, the author, the dates and the levels. Start opens `/game/{projectId}`.
  - Expect: a player starts any of their own projects from the main menu, logged in or not. The 'Shared Games' filter is not there yet.
  - Depends on: 1, 7.

- [ ] **9. Admin projects tab and flagging**
  - Scope: `flagged_at` and `flagged_by` columns. Flag and unflag endpoints for super admins only. `GET /api/admin/projects` with paging and sorting. A Projects tab at `/admin/projects` with a run link and a Flag / Unflag action behind a confirm dialog. Super admins can read and run any project. A flagged project shows a general "contact an admin" message to all players except the owner and super admins. The public project cannot be flagged.
  - Expect: an admin finds any project, runs it, and blocks it in a few clicks. Players cannot start a flagged project.
  - Depends on: 1. Must ship before ticket 10 goes live.

- [ ] **10. Sharing: server and user search**
  - Scope: `project_shares` table and the owner endpoints to list, add and revoke. `GET /api/projects?scope=mine|shared`. Project and level reads allow users with a share, and return `404` to all others. The sync pull includes shared projects. `GET /api/users/search` with the privacy rules. Shares are rejected for flagged projects and for projects not saved on the server.
  - Expect: a shared project syncs down read-only to the user it is shared with. A revoke or a flag removes it from their device on the next sync. The search never returns another user's email.
  - Depends on: 6, 9.

- [ ] **11. Sharing: UI**
  - Scope: a generic `Autocomplete` in `rewild-ui` and an app `UserPicker` on top of it. The Sharing tab in Project Settings lists, adds and revokes shares. The 'Shared Games' filter in My Games.
  - Expect: an owner shares a project by name or exact email, and the other user starts it from My Games. The Sharing tab explains why it is not available to logged out users and to local only projects. `UserPicker` has no sharing logic, so other screens can use it.
  - Depends on: 3, 8, 10.
