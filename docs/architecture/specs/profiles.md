# UC8 — Pick a profile · UC9 — Manage profiles

> **Feature**: Profiles — [use cases](../diagrams/playback/01-use-case.md),
> [sequence](../diagrams/profiles/02-sequence-pick-a-profile.md),
> [state](../diagrams/profiles/05-state-active-profile.md),
> [class](../diagrams/playback/04-class.md)
> **Issue**: #10 · **Related ADRs**: ADR-0007, ADR-0008
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** A profile has an id, a name (1–40 chars after trim, unique case-insensitively)
  and an avatar colour picked from a fixed palette of design tokens.
- **R2** Watch progress (ADR-0007) is stored and read per profile; two profiles keep
  separate positions for the same title.
- **R3** On start the web asks "Who's watching?" unless the remembered profile still
  exists (ADR-0008 §3). The header shows the active profile and a switch button.
- **R4** The owner creates, renames and deletes profiles from the web (UC9). Deleting a
  profile deletes its progress; the last profile cannot be deleted.
- **R5** The migration seeds profile `default` / `Me` that keeps the existing progress
  (ADR-0008 §2); it can be deleted like any other and is not re-seeded. At most 12
  profiles.
- **R6** Profile names and history stay in SQLite and are never logged or sent out
  ([data flow](../diagrams/playback/06-data-flow.md)).
- **R7** Done when two profiles keep separate progress, with tests on the repository,
  the routes and the screens.

## 2. UC8 — Pick a profile

Primary actor: Viewer. Trigger: the web app loads, or the viewer presses the switch
button.

1. The web reads the remembered profile id and loads `GET /profiles`.
2. The id is in the list → the catalog opens for that profile (skip to 5).
3. Otherwise the web shows "Who's watching?" with every profile.
4. The viewer picks one; the web remembers its id.
5. The catalog and the detail dialog read and save progress for that profile.

Extensions: 1a server unreachable → the catalog error as today; 1b storage unavailable
→ the picker every time; 3a "Manage profiles" → UC9.

## 3. UC9 — Manage profiles

Primary actor: Owner (anyone on the network until #18, ADR-0008 §4).

1. The owner opens "Manage profiles" from the picker.
2. Adds a profile (name + colour), renames one, or deletes one after a confirm.
3. The list refreshes; "Done" returns to the picker. A deleted remembered profile is
   no longer listed at the next start, so the picker shows.

Extensions: 2a name empty / too long → `400`; duplicate name → `409 profile_name_taken`;
13th profile → `409 profile_limit`; 2b deleting the last profile → `409
last_profile`; unknown id → `404 profile_not_found`.

## 4. Data rules

### 4.1 Storage

Table `profiles`: `id` (text PK, `default` or a UUID), `name` (text), `name_key`
(lower-cased name, unique), `avatar` (text, a palette key), `created_at` (ISO text).
`watch_progress.profile_id` → FK `profiles.id`, cascade delete; the column default is
dropped.

### 4.2 API

- `GET /profiles` → `200 Profile[]` `{ id, name, avatar }`, oldest first.
- `POST /profiles` `{ name, avatar }` → `201 Profile`.
- `PATCH /profiles/:profileId` `{ name?, avatar? }` → `200 Profile`.
- `DELETE /profiles/:profileId` → `204`.
- `GET /profiles/:profileId/progress` → `200 WatchProgress[]` (ADR-0007 shape); `404
  profile_not_found`.
- `PUT /profiles/:profileId/media/:id/progress` `{ positionSec }` → `204`; `404
  profile_not_found` / `media_not_found`.
- `:profileId` is `default` or a UUID, else `400`. The old `GET /progress` and
  `PUT /media/:id/progress` are removed.

### 4.3 Palette

`AVATAR_COLORS` in `packages/shared` (8 keys, e.g. `red`, `amber`, `green`, `teal`,
`blue`, `violet`, `pink`, `slate`), each mapped to a CSS token in the web. The avatar
shows the name's first letter on that colour.
