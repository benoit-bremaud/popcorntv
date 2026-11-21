# ADR-0037 — Penpot as the design tool, `tokens.css` as the token source

Record the outcome of the #393 spike: self-hosted Penpot is adopted for the front-end redesign (epic #401), driven through its official MCP server, with the CSS tokens as the single source of truth.

- Status: proposed — decisions 1–2 accepted by the owner (2026-11-20, 2026-11-21); decisions 3–6
  await owner validation on the PR of #393.
- Date: 2026-11-21.
- Scope: #393 (phase 0b of epic #401). Design tooling on the owner's workstation only; no
  application code, no deployment.
- Related: [ADR-0004](0004-catalog-design-tokens.md) (current palette and type scale),
  `apps/web/src/styles/tokens.css`.

## Context and drivers

The redesign follows a design-first process: screens are drawn and reviewed before they are coded.
The owner chose self-hosted Penpot over Figma (data stays on the machine, open formats). Before
investing six phases in it, the spike had to prove on the pinned version that a real component can
be drawn, exported and backed up, that design tokens can be represented, and that nothing of Penpot
is reachable from outside the machine.

## Spike evidence (Penpot 2.19.3, 2026-11-20 and 2026-11-21)

- **Exposure**: only the frontend publishes a port, on `127.0.0.1:9001`. The MCP container
  publishes none and is reached through the frontend. The backend runs with
  `enable-prepl-server`, whose port is not published either.
- **Drawing**: the poster card and its five states (rest, hover, focus, watched, no image) were
  drawn through the MCP server as native, editable objects on one board (project PopCornTV, page
  "Poster card states").
- **Export**: PNG is faithful. SVG (37 KB) keeps vector text, gradients and shadows but is not
  self-contained: it loads Inter from the local Penpot instance.
- **Tokens**: 26 of the 75 tokens of `tokens.css` were recreated with identical values in a set
  `popcorntv/core` (colours, spacing, radii, two font sizes, poster size) and bound to shapes.
  Penpot has no equivalent for `rem` (converted to px), composed gradients, motion tokens or
  media-query variants.
- **Token propagation**: a value edited in the Penpot interface updates the bound shapes at once.
  The same edit through the plugin API does not; the token must be re-applied, and applying it
  twice to the same property removes the binding.
- **Backup**: `pg_dump -Fc` of the database plus an archive of the assets volume, under
  `~/.local/opt/penpot/backups/<date>/` (mode 0600). A restore into a scratch database was tested
  on the 2026-11-20 backup; the 2026-11-21 backup includes the spike file.
- **Limits met**: the browser tab holding the MCP plugin must stay focused (it is suspended after
  about 30 s in the background); a file cannot be renamed through the API; whole-page export times
  out, a board exports fine. The JSON token import / export of the interface was not tested.

## Decisions

1. **Drawing method: the official Penpot MCP server** (445/500). Rejected: an in-house plugin
   (375), SVG or `.penpot` import (260).
2. **Token direction: `tokens.css` is the source of truth; Penpot mirrors it** (415/500). A token
   changes in a pull request on `tokens.css`, then the Penpot set is updated to match. Penpot never
   feeds the code. Rejected: a DTCG JSON file generating both (380), Penpot as the source (235).
3. **Version pin**: `PENPOT_VERSION=2.19.3` for every Penpot image. An upgrade is a deliberate
   step: backup, bump, re-run the poster-card check (draw, bind a token, export).
4. **Backup**: a dated database dump and assets archive at the end of every design brick and before
   every upgrade, kept on the workstation. Rejected for now: a daily timer (360 against 410).
5. **MCP key**: regenerate it with a 90-day expiry and a descriptive name, the same lifetime as the
   local discovery credentials (ADR-0036). Rejected: keeping the key without expiry; disabling the
   MCP server between sessions.
6. **ADR-0004**: its status becomes *accepted* — it describes the shipped interface and stays the
   baseline. The redesign supersedes it with its own record when a new direction is validated
   (phase 3 of epic #401), not before.

Exposure rule kept from the spike: no Penpot port other than the frontend on loopback is ever
published, and `enable-prepl-server` is removed from `PENPOT_FLAGS` unless a documented need
appears (#406).

## Weighted comparison — decision 1

Scores 0–5, weights sum to 100.

| Criterion | Weight | A: official MCP | B: in-house plugin | C: SVG / `.penpot` import |
|---|---:|---|---|---|
| Editable result (components, layout) | 30 | 5 — native objects | 5 — same API | 2 — flat paths |
| Drivable by the agent | 25 | 5 — tools ready | 3 — plugin to write and load | 3 — manual import |
| Tokens | 20 | 4 — through the plugin API | 4 | 0 |
| Set-up cost | 15 | 4 — already deployed | 2 — code to maintain | 5 |
| Exposure surface | 10 | 3 — runs code, needs a key | 4 — in the browser | 5 |
| Total /500 | 100 | **445** | **375** | **260** |

Sensitivity: A stays first while exposure weighs less than about 45.

## Weighted comparison — decision 2

| Criterion | Weight | A: `tokens.css` source | B: Penpot source | C: DTCG JSON source |
|---|---:|---|---|---|
| Coverage of the 75 tokens | 30 | 5 — CSS expresses all of them | 2 — no rem, gradients, motion, media variants | 4 — composites need conventions |
| Traceability in git and the gate | 25 | 5 — reviewed diff, linted | 2 — lives in a database | 5 |
| Effort | 20 | 3 — manual mirror of the subset Penpot can hold | 2 — export pipeline to build | 2 — generator for two targets |
| Design comfort | 15 | 2 — values typed twice | 5 — edit where you draw | 3 |
| Tool independence | 10 | 5 | 1 | 5 |
| Total /500 | 100 | **415** | **235** | **380** |

Sensitivity: C leads only if design comfort weighs about 40.

## Weighted comparison — decision 4

| Criterion | Weight | A: per brick and before upgrade | B: daily timer | C: none |
|---|---:|---|---|---|
| Work lost at worst | 40 | 3 — one brick | 5 — one day | 0 |
| Simplicity (nothing to maintain) | 30 | 5 — two commands | 2 — unit, rotation, a silent failure to watch | 5 |
| Restore proven | 20 | 5 — tested | 5 | 0 |
| Disk use | 10 | 4 | 2 — about 26 MB a day without rotation | 5 |
| Total /500 | 100 | **410** | **360** | **200** |

Sensitivity: B leads if "work lost" weighs more than about 55; revisit once several screens a day
are drawn (phase 3).

## Weighted comparison — decision 5

| Criterion | Weight | A: 90-day expiry | B: no expiry | C: MCP off between sessions |
|---|---:|---|---|---|
| Damage bounded if the key leaks | 40 | 4 | 1 | 5 |
| Friction for design sessions | 35 | 4 — one renewal a quarter | 5 | 1 — compose edit each time |
| Consistent with the credential rule | 25 | 5 | 0 | 4 |
| Total /500 | 100 | **425** | **215** | **335** |

Sensitivity: C leads only if friction weighs less than about 7.

## Weighted comparison — decision 6

| Criterion | Weight | A: accepted now, superseded later | B: superseded now | C: left proposed |
|---|---:|---|---|---|
| Record matches the shipped product | 45 | 5 | 1 — nothing replaces it yet | 2 — shipped for a month |
| Leaves the redesign free | 35 | 4 — superseding is one line | 5 | 4 |
| Effort | 20 | 5 | 3 | 5 |
| Total /500 | 100 | **465** | **280** | **330** |

Sensitivity: A stays first whatever the weights: it scores at least as high as C on every
criterion, and B overtakes it only if the first criterion weighs almost nothing.

## Consequences

- Every design brick of epic #401 draws in the PopCornTV Penpot project through the MCP server and
  ends with a backup.
- Penpot holds only the tokens it can express. Motion, gradients and responsive variants are
  specified in `tokens.css` and described in text on the boards.
- After a token changes in `tokens.css`, the Penpot value is edited in the interface, or through
  the API followed by one re-apply on the bound shapes (#407).
- SVG exports are not committed as assets while they depend on the local font; PNG is the review
  format (#407).
- The Penpot compose file, its `.env` and the backups stay outside the repository; they hold
  credentials and third-party data.
