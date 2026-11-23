# ADR-0041 — Give views and titles their own path

- Status: accepted (owner, 2026-11-23, #396)
- Date: 2026-11-23
- Deciders: owner
- Amends: ADR-0004 § 4 (view state only in a reducer), ADR-0024 (no URL per title), ADR-0025
  (no client routes)
- Related: [brief](../../requirements/04-redesign-brief.md) D6, G3, G4;
  [information architecture](../specs/redesign-information-architecture.md); issues #417, #418,
  #87, epic #401

## Context

Today the catalog view lives in a reducer (ADR-0004 § 4, option A 440 vs URL 385) and the open
layers are history entries without a URL (ADR-0024, option A 455): a reload lands on the
catalog and no title has an address. ADR-0004 already expected that "deep links come with a router when #7 adds a
player route".

The redesign adds two surfaces that need an address for what is on screen:

- the Android TV app (#417) opens PopCornTV at a given place — a title, *Continue watching* —
  from the TV home screen or a resumed task;
- the phone remote (#418) tells the TV which title to open and must know where the TV is.

The UI audit of 2026-11-20 lists "no deep link" as a decision in conflict with browse-surface
expectations (Back, sharing within the household, reload).

## Options

- **A — Keep state only**: reducer plus ADR-0024 history entries; the TV and the phone exchange
  commands through the server, never addresses.
- **B — Own paths on the History API**: a small typed table of paths (`/`, `/films`, `/series`,
  `/search?q=`, `/discover`, `/title/:kind/:id`, `/play/:mediaId`, `/admin/…`); each ADR-0024
  layer entry also carries its path; a reload reopens the title sheet but never resumes playback
  on its own. Auth links keep the hash (#82, #87).
- **C — Router library** (react-router or similar): routes and nested layouts from the library.

## Decision drivers and matrix

| Criterion | Weight | A State only | B Own paths | C Router library |
|---|---:|---|---|---|
| TV app and phone remote integration (#417, #418) | 30 | 2 — every place needs a command | 5 — one address per place | 5 |
| Back and layers stay as ADR-0024 decided | 20 | 5 | 4 — each entry gains a path | 2 — layers rebuilt around routes |
| Simplicity and bundle (KISS, NFR-13) | 20 | 5 | 3 — a path table and a parser | 2 — a new dependency |
| Reload and household sharing | 15 | 1 | 5 | 5 |
| Regression risk on shipped flows | 15 | 5 | 3 | 2 |
| **Total /500** | 100 | **350** | **410** | **335** |

Points: A = 60 + 100 + 100 + 15 + 75 · B = 150 + 80 + 60 + 75 + 45 · C = 150 + 40 + 40 + 75 + 30.

Sensitivity: A overtakes B only if TV and remote integration weighs under about 10 (B leads by
60, and every 1-point drop of that weight costs B 3 points against A). C never overtakes B:
it scores the same or lower on every criterion.

## Decision

**B** (owner, 2026-11-23).

- Paths are product state, not secrets: no token, no profile id in a path; invitation, reset and
  setup links keep the hash and are dropped from the address bar on open (#87).
- A reload on `/title/…` reopens the title sheet; on `/play/…` it reopens the title sheet with
  *Resume*, never playback with sound (G7).
- Path parameters are checked by the typed path table (`kind` in `movie | tv`, a positive
  integer id); anything else opens the catalog.
- A path received from the phone remote through the server is parsed against the same table,
  same-origin and relative only; anything else opens the catalog.
- A pairing or TV connection code travels in the hash, like the auth links, never in a path.
- Unknown paths fall to the real 404 of ADR-0025 on the server side and to the catalog inside
  the app.
- The exact path table is fixed with the validated tree of the
  [information architecture](../specs/redesign-information-architecture.md) and implemented in
  #400.

## Consequences

- ADR-0004 § 4 and ADR-0024 are amended: the reducer and the layer entries stay, and each gains
  a path; "reload lands on the catalog" becomes "reload lands where the viewer was, without
  playback".
- #417 and #418 can address a title or a view directly.
- Server routing must answer `index.html` for app paths while keeping the ADR-0025 404 for
  unknown files; the Caddy rule is revisited in #400.
