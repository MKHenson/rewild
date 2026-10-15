# Project Promotion

Working doc. It is for planning this work, not a milestone write up. Delete it when the work ships.

## Goal

A player can start one of two kinds of game from the main menu:

- **Story Mode:** the one game that a super admin promotes. All players can play it, also logged out players.
- **My Games:** projects the player made, and projects other users shared with them.

In this doc, "admin" always means a super admin: `UserRole.SUPER_ADMIN`, checked by `SuperAdminGuard`. There is no other admin role.

---

## Decisions

| Topic              | Decision                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit of play       | The player picks a project, not a level. Each project names its start level                                                                                       |
| Levels             | A project can have many levels. The UI allows one for now, but the model and API must not assume one                                                              |
| Start level        | `project.levelId` is the start level. The owner picks it in Project Settings. `activeOnStartup` is removed                                                        |
| Game URL           | The game always runs at `/game/{projectId}`, also for the public game. There is no `/game` route without an id                                                    |
| Public game        | One promoted project. Admins set it at `/admin/public`. It uses the project's start level                                                                         |
| Public game edits  | The public game is the live project. Admin edits reach players at once. A publish snapshot is out of scope                                                        |
| Logged out players | They can play Story Mode. My Games shows only their local projects                                                                                                |
| Sharing            | Only for logged in users and projects saved on the server. A share gives play access, not edit access                                                             |
| Admin access       | Super admins can see and run all projects from an admin-only tab. This is a stopgap. Privacy improves later                                                       |
| Sync               | Sync is only for the player's own projects                                                                                                                        |
| Remote projects    | Public, shared and admin-run projects are not stored on the device. The game loads them from the server each time it starts them, and all three use the same path |
| Assets             | Every project file is an asset, saved and synced the same way. The asset type sets only its location and the rules the server enforces                         |
| Asset caching      | Every asset URL carries a version, so the browser cache never serves an old file                                                                                  |
| Delete             | A project saved on the server is deleted through the API, by its logged in owner. A local only project is deleted on the device                                   |
| Flagged project    | The project cannot be played or shared. Players see a general message that tells them to contact an admin                                                         |
| List order         | Projects sort by `updatedAt`, newest first                                                                                                                        |
| Project image      | The owner sets an image in Project Settings. It is a project asset and syncs like every other asset. A new image replaces the old one. Size limit: 2 MB        |
| Bucket layout      | All project files live under `users/{userId}/projects/{projectId}/`, level files too. There are no live projects, so there is no data migration                   |

---

## Main menu and `/launch`

- The New Game button opens `/launch`.
- `/launch` is a modal with vertical tabs, the same pattern as the admin screen. It can go back to the main menu.

### Story Mode tab

- Calls `GET /api/public-game`.
- Shows the project image and the project description.
- The Start button is enabled only when a public game is set. Start opens `/game/{projectId}` with the public project's id.

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

- The image is the project asset `image/image`: asset type `image`, no level. The owner picks a file, logged in or not. The client checks the type and size, writes it to the asset store and shows it at once.
- It syncs like every other asset: the push uploads it, the pull brings it to the owner's other devices, and the device copy stays.
- `db.getProjectImage` serves every screen: the copy on the device first, else a download from the project's `imageUrl`. A remote project's image (public, shared, admin-run) is not stored.
- A project with no image, or an image that fails to load, shows a placeholder.
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
- `GET /api/public-game`: no auth. It returns the promoted project's id, name, description and image URL, or nothing when no project is promoted. The game data comes from the play endpoint, like any other remote project.
- `PUT /api/public-game`: super admins only (`SuperAdminGuard`). It rejects a project that is flagged or not saved on the server.

### Play

- `GET /api/play/{projectId}`: auth is optional. It returns the project, its levels, and the project's assets. Each asset names its level, or none for a project file. This is the one way the game loads a project that is not on the device.
- The caller can read the project if any of these is true:
  - it is the public project (logged out callers too)
  - the caller owns it
  - it is shared with the caller
  - the caller is a super admin
- All other callers get `404`, so the API does not show that the project exists.
- A flagged project returns an error with a general message for all callers except the owner and super admins.
- Each asset in the list has a `publicUrl` with a version query (`?v={updatedAt}`). See Asset versions.

### Asset versions

An asset keeps its bucket key when it is uploaded again. Without a version in the URL, the browser cache can serve the old file.

- `updated_at` on `assets` is the version. The upload confirm sets it and returns the asset.
- The play endpoint and the sync asset list add `?v={updatedAt}` to each `publicUrl`.
- Only the files that changed get a new URL, so the player downloads only those again.
- The client stores the version of each file it holds. The sync pull downloads a file it lacks or holds an older version of, and never one with local changes.

### Bucket layout

```
users/{userId}/projects/{projectId}/
  {assetType}/{filename}                      project files, such as image/image
  levels/{levelId}/{assetType}/{filename}     level files
```

- `StorageKeys.asset` builds every key. A project delete removes the whole `users/{userId}/projects/{projectId}/` prefix.
- The client's asset store uses the same layout in OPFS, under `projects/{projectId}/`.
- `GET /api/assets` returns each asset's `projectId` and `levelId`, so the pull can place the file.

### Project image

- An `assets` row with no level: asset type `image`, filename `image`, key `users/{userId}/projects/{projectId}/image/image`. It uploads through `/api/assets/upload-url` and `/api/assets/confirm` like any asset.
- The `image` rule in `AssetTypes`: project scope, PNG, JPEG or WebP, 2 MB at most, and the fixed filename, so a project has one image.
- The project read APIs, the play endpoint and `GET /api/public-game` return the image asset's versioned URL as `imageUrl`.
- A project delete deletes its image with its other files.

### Project lists

- `GET /api/projects?scope=mine|shared` lists the projects the caller owns or that are shared with the caller.
- The owner still sees a flagged project in the editor.

### Sharing

- New table `project_shares`: `project_id`, `user_id`, `granted_by`, `created_at`. The pair `project_id` + `user_id` is unique.
- The owner manages the shares:
  - `GET /api/projects/{id}/shares` lists them
  - `POST /api/projects/{id}/shares` adds one
  - `DELETE /api/projects/{id}/shares/{userId}` revokes one
- The server rejects a share for a flagged project.
- A shared project loads through the play endpoint. A revoke takes effect on the next start.

### User search

- `GET /api/users/search?q=`: logged in users only.
- Returns at most 10 results: `id`, `displayName`, `photoUrl`. It does not return the caller.
- Matches a display name by prefix (2 characters minimum), or an email by an exact match.

### Delete

- `DELETE /api/projects/{id}` deletes a project saved on the server. Only the owner can call it.
- The server deletes the project, its levels and its shares, and queues the assets for clean up.
- The server keeps the `deleted_at` tombstone, so the owner's other devices drop the project on their next sync.
- `/api/sync` stops accepting `deletedAt` from the client.
- The server rejects the delete of the public project with `409` and a message.
- **Client, saved on the server:** the delete button shows only for logged in owners. The UI disables it for the public project. The client removes its local copy only after the server returns success.
- **Client, local only:** a project that was never saved on the server is deleted on the device, after a confirm. Nothing exists on the server, so there is no tombstone.

### Admin projects

- `GET /api/admin/projects`: super admins only (`SuperAdminGuard`). It lists all projects with paging and sorting: name, author, updated, flag state.
- Super admins can run any project through the play endpoint. This is the stopgap from the Decisions table.

### Flagging

Flagging is a way to stop a bad project fast. Keep it simple.

- New columns on `projects`: `flagged_at`, `flagged_by`.
- `POST /api/projects/{id}/flag` and `DELETE /api/projects/{id}/flag`: super admins only (`SuperAdminGuard`).
- An admin cannot flag the public project. Unpromote it first.
- A flagged project fails to load through the play endpoint on the next start.

---

## Admin: `/admin/projects`

- A new Projects tab in the admin panel, at `/admin/projects`.
- A table of all user projects, with paging and sorting.
- Each row has a link that runs the project.
- Each row has a Flag / Unflag action. A confirm dialog comes before the action.

---

## Game loading

`GameLoader.loadInitialLevels` loads the first `activeOnStartup` project from the local DB. The terrain data (chunk snapshots, biome masks, scatter masks, water edits, water bodies, scatter kills) comes from the local asset store through one provider for each data type. Sync fills the local DB and the asset store, but only with the player's own projects. A public or shared project is not on the device, so it cannot load today.

### Loader

- The loader takes a project id from `/game/{projectId}`.
- It loads the start level from `project.levelId`.
- **Local project:** if the project is in the local DB, the loader reads it from there, as today. This keeps unsynced edits and offline play for the player's own projects.
- **Remote project:** if not, the loader calls `GET /api/play/{projectId}`. It holds the project, the levels and the asset lists in memory. Nothing is written to the local DB or the asset store.
- An error from the play endpoint (`404` or flagged) shows an error screen.

### Remote providers

- The terrain providers take one chunk at a time, so each has a remote version that fetches the file from its versioned `publicUrl`.
- A chunk with no file in the asset list returns `null` and is generated, as it is for local levels.
- The browser HTTP cache keeps the files between plays. The version query makes sure a changed file downloads again.

### Future: player changes to the world (out of scope)

This is the agreed direction. It is too soon to design it in detail.

A later feature can let players change the world, for example to flatten terrain before they build. Do not write player changes into the creator's chunks. Store them as a separate layer of world edits on top of the authored level. Reasons:

- The authored level stays intact. The creator can keep editing it, and the world can be reset.
- Creator edits and player edits do not conflict on the same chunk files.
- A project setting can choose the scope: off, one layer for each player, or one shared layer for all players. A shared layer gives the No Man's Sky behaviour.

Nothing in this work builds the layer. Loading remote projects in memory must not block it later.

### Future: player progress (out of scope)

The game will have progression, so play will write data to tables.

- Progress belongs to the player, not to the project. It is never part of the creator's data.
- A logged out player's progress is stored only on the device. If they clear their browser storage, they lose it. That is the risk of not signing in.
- When the player signs in, sync pushes the local progress to their account. That is the only way to keep it.

---

## TODOs

Each TODO becomes one GitHub ticket. The order follows the dependencies. "Expect" is what is true when the ticket is done.

- [ ] **1. Start level replaces `activeOnStartup`**

  - Scope: remove `activeOnStartup` from projects (client, server, migration). `project.levelId` is the start level. `GameLoader` takes a project id and loads its start level from the local DB. The game route becomes `/game/{projectId}`, and `/game` without an id is removed. The editor's play action uses the new route.
  - Expect: the game plays the project you open, from its start level. No code reads `activeOnStartup`. No code assumes one level for each project, other than the UI.
  - Depends on: nothing.

- [ ] **2. Explicit project delete**

  - Scope: `DELETE /api/projects/{id}` deletes the project, its levels and its assets, and keeps the tombstone. `/api/sync` stops accepting `deletedAt` from the client. For a project saved on the server, the client calls the API, then removes the local copy. A local only project is deleted on the device after a confirm.
  - Expect: any project can be deleted. A delete on one device removes the project on the owner's other devices after their next sync. A failed server delete leaves the local copy in place.
  - Depends on: nothing.

- [ ] **3. Project Settings dialog: General tab**

  - Scope: a Project Settings button on the editor toolbar opens a modal with vertical tabs. The General tab edits the name and the description, and holds the other fields from `ProjectSettings.tsx` and a start level dropdown. The pane is removed from the editor layout.
  - Expect: the owner edits the name, the description and the start level (one entry for now). The editor has no project settings pane. The dialog can take more tabs.
  - Depends on: 1.

- [ ] **4. Bucket layout and project image**

  - Scope: level files move to `users/{userId}/projects/{projectId}/levels/{levelId}/...` in `AssetService` and `AssetCleanupService`. Remove the old dev data under `levels/`. Then the project image: the `image_key` column, the upload URL and confirm endpoints, and the bucket key `users/{userId}/projects/{projectId}/image/{uuid}.{ext}`. A new image queues the old one for deletion. The project delete from ticket 2 deletes the image. The General tab gets the image control and a placeholder. The image is stored on the device and syncs like other project files.
  - Expect: all files for a project are under one bucket prefix, and a project delete removes that prefix. The owner sets a PNG, JPEG or WebP image up to 2 MB, logged in or not, and sees it at once. The next sync uploads it. The bucket holds one image for each project. A file of the wrong type or size is rejected with a message.
  - Depends on: 2, 3.

- [x] **5. Public game: server and `/admin/public`**

  - Scope: `public_game` table. `GET /api/public-game` with no auth, which returns the promoted project's id, name, description and image URL. `PUT /api/public-game` for super admins only (`SuperAdminGuard`). The delete API returns `409` for the public project. A Public tab at `/admin/public` with a project picker and a Save button. The picker lists projects from `GET /api/admin/projects`: all live projects, newest first, with no paging.
  - Expect: an admin promotes a project or clears the promotion. A logged out request to `GET /api/public-game` returns the promoted project's summary and nothing else. The public project cannot be deleted.
  - Depends on: 2.

- [x] **6. Remote project loading**

  - Scope: `GET /api/play/{projectId}` with optional auth, which returns the project, its levels and their asset lists. It allows the public project and the owner. The `updated_at` column on `assets`, set on confirm, and `?v={updatedAt}` on every `publicUrl`. The loader falls back to the play endpoint when the project is not in the local DB, and uses remote terrain providers that fetch by URL. An error screen for `404`.
  - Expect: a logged in or logged out player opens `/game/{publicProjectId}` and plays the public project without it being stored on the device. After the creator saves, the next start shows the change, and only the changed files download again. Shares and admin access plug into the same endpoint in tickets 9 and 10.
  - Depends on: 1, 5.

- [x] **7. `/launch` screen: Story Mode tab**

  - Scope: New Game opens `/launch`, a modal with vertical tabs and a way back to the main menu. The Story Mode tab shows the image, the description and Start. Start opens `/game/{projectId}` with the public project's id.
  - Expect: any player, logged in or not, plays the public game from the main menu. Start is disabled when no game is promoted.
  - Depends on: 4, 6.

- [x] **8. `/launch` screen: My Games tab (own projects)**

  - Scope: a table of the player's projects, newest first, with a details side that shows the image, the author, the dates and the levels. Start opens `/game/{projectId}`.
  - Expect: a player starts any of their own projects from the main menu, logged in or not. The 'Shared Games' filter is not there yet.
  - Depends on: 1, 7.

- [x] **9. Admin projects tab and flagging**

  - Scope: `flagged_at` and `flagged_by` columns. Flag and unflag endpoints for super admins only. Paging, sorting and the flag state on `GET /api/admin/projects`. `PUT /api/public-game` rejects a flagged project. The play endpoint allows super admins. A Projects tab at `/admin/projects` with a run link and a Flag / Unflag action behind a confirm dialog. The play endpoint returns a general "contact an admin" error for a flagged project to all callers except the owner and super admins. The public project cannot be flagged.
  - Expect: an admin finds any project, runs it, and blocks it in a few clicks. Players cannot start a flagged project.
  - Depends on: 6. Must ship before ticket 10 goes live.

- [x] **10. Sharing: server and user search**

  - Scope: `project_shares` table and the owner endpoints to list, add and revoke. `GET /api/projects?scope=mine|shared`. The play endpoint allows users with a share. `GET /api/users/search` with the privacy rules. Shares are rejected for flagged projects and for projects not saved on the server.
  - Expect: a user starts a project shared with them through the play endpoint. After a revoke or a flag, their next start fails with an error. The search never returns another user's email.
  - Depends on: 6, 9.

- [x] **11. Sharing: UI**
  - Scope: a generic `Autocomplete` in `rewild-ui` and an app `UserPicker` on top of it. The Sharing tab in Project Settings lists, adds and revokes shares. The 'Shared Games' filter in My Games.
  - Expect: an owner shares a project by name or exact email, and the other user starts it from My Games. The Sharing tab explains why it is not available to logged out users and to local only projects. `UserPicker` has no sharing logic, so other screens can use it.
  - Depends on: 3, 8, 10.
