# UC28 — Review the wishlist titles that became available

A viewer marks the legal streaming providers they subscribe to; when a My list title arrives
in a library or on one of those providers in France, the profile finds an in-app notification
behind a bell with an unread count.

> **Feature**: Catalog — [use cases](../diagrams/catalog/01-use-case.md),
> [components](../diagrams/catalog/03-component.md),
> [sequence](../diagrams/catalog/10-sequence-wishlist-check.md),
> [state](../diagrams/catalog/11-state-wishlist-availability.md)
> **Issue**: #277 · **Related ADRs**: ADR-0016, ADR-0020, ADR-0027, ADR-0029, ADR-0030
> Format: Cockburn casual use case.

## 1. Requirements

### My providers (UC29 Choose my providers)

- **R1** A profile keeps a list of "my providers": rows `profile_providers(profile_id,
  provider_id, name)`, FK cascade on the profile. `GET
  /profiles/:profileId/providers` answers `MyProvider[]` (`{ providerId, name }`, sorted
  by name). `PUT /profiles/:profileId/providers/:providerId` with `{ name }`
  adds or renames one (`204`); `DELETE` removes it (`204`, idempotent). `name` is 1–100
  characters; at most 50 providers per profile
  (`409 too_many_providers`). A profile of another user → `404 profile_not_found`.
- **R2** The viewer toggles a provider from an offer of the **Where to watch** block (spec
  where-to-watch R7): a "Mine" toggle per provider, so the setting never needs a new TMDB call.

### Availability check (system, on a timer)

- **R3** A title counts as **available on a provider** when its French offers (spec
  where-to-watch R1) hold that `providerId` with type `flatrate`, `free` or `ads`; rent and buy
  do not count (they are almost always there). It is **in the library** when a local film /
  series carries its `tmdb_id` (spec discover-wishlist R6).
- **R4** Each wishlist row keeps what was last seen: `seen_in_library` (0/1) and
  `seen_provider_ids` (JSON array of every counting provider, mine or not; null = not looked
  at yet). On add, `seen_in_library` is the current match and `seen_provider_ids` null.
- **R5** Pure `availabilityEvents(seen, current, mine)` returns the new events: `library` when
  the title is in the library now and was not; one `provider` event per counting provider now
  present, absent from `seen_provider_ids`, and in `mine`. With `seen_provider_ids` null, no
  provider event: the first look only records the baseline. Then `seen` becomes `current`, so a
  title that leaves and comes back notifies again; adding a provider to "mine" never notifies
  for what was already seen.
- **R6** `WISHLIST_CHECK_INTERVAL_MIN` (default 60, `0` off, same bounds as
  `SCAN_INTERVAL_MIN`) starts an unref-ed timer (ADR-0016 pattern): a run checks every distinct
  wishlisted title one after the other; no overlap; stopped and awaited in `preClose`.
- **R7** Provider offers come from the same `StaleCache` as the providers route (fresh 24 h,
  ADR-0027): a title costs at most one TMDB call a day, run serially. Without `TMDB_API_KEY`
  only the library check runs. A TMDB failure for a title is logged
  `wishlist.check.title_failed` (warn) and that title keeps its `seen` state; the run goes on.
- **R8** Each run logs `wishlist.check.done` (info, `titles`, `notified`, `failed`); every
  notification created logs `notification.created` (info, `profileId`, `reason`, `kind`,
  `tmdbId`, `providerId`).

### Notifications (UC28)

- **R9** `notifications(id integer pk, profile_id FK cascade, kind, tmdb_id, title, reason
  'library'|'provider', provider_id, provider_name, created_at, read_at)`; `title` and
  `provider_name` are copied so the line survives a removed wishlist row or provider.
- **R10** `GET /profiles/:profileId/notifications` answers `{ items, unread }`: the 50 newest
  `AppNotification`s and the unread count. `PUT /profiles/:profileId/notifications/read` marks
  all of the profile's as read (`204`). Notifications older than 90 days are purged at start.
- **R11** The web header shows a bell with the unread count (none shown at 0), fetched when
  the profile is picked and every 5 minutes. Opening the panel lists the lines ("*Title* is
  now in your library" / "*Title* is now on *Provider*") and marks them read; a line opens the
  Discover title sheet, which already offers Play in my library and Where to watch.
- **R12** Nothing leaves the server: no Web Push, e-mail or third-party bot (ADR-0030, owner
  rule "everything in PopCornTV"). No stream is ever fetched or played (spec where-to-watch R8).

## 2. Main scenario

1. The viewer marks Netflix as "Mine" on a title sheet (R2).
2. The timer runs: for each wishlisted title, the server reads the local match and the French
   offers (R6, R7), computes the events per profile (R5) and stores the notifications.
3. The viewer opens the app: the bell shows **1**.
4. The viewer opens the panel: "*Dune* is now on Netflix"; the count clears.
5. The viewer clicks the line; the title sheet opens with Where to watch.

## 3. Extensions

- 2a. TMDB fails for a title → R7: logged, retried next run.
- 2b. The title was removed from the list meanwhile → no event (only present rows are read).
- 2c. First look at a title → baseline only (R5).
- 4a. No notification → "Nothing new on your list".

## 4. QA cases

See `docs/testing/qa-matrix.md` § Wishlist notifications.
