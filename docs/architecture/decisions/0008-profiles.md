# ADR-0008 — Profiles: path-scoped progress, seeded default profile, remembered choice

- Status: accepted (owner validated the weights, #10 chat, 2026-10-24)
- Date: 2026-10-24
- Deciders: owner
- Related: UC8 / UC9 ([spec](../specs/profiles.md)), ADR-0007, issue #10, #18 (users)

## Context

#10 adds one profile per household member; watch progress (ADR-0007) becomes per
profile. There is no authentication until #18. Four choices are open. Scores 0–5,
weights /100, totals /500; scores are estimates.

## 1. How a request names its profile

- **A — In the path**: `GET /profiles/:profileId/progress`,
  `PUT /profiles/:profileId/media/:id/progress`.
- **B — A header** `X-Profile-Id` on the existing routes.
- **C — A cookie** set by `POST /profiles/:id/select`.

| Criterion                         | Weight | A                                         | B                                        | C                                         |
| --------------------------------- | -----: | ----------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Explicit, testable contract       |     35 | 5 — the resource says whose it is         | 3 — hidden input, easy to forget         | 2 — server-side hidden state              |
| Works with `keepalive` / sendBeacon |   20 | 5                                       | 4 — custom header forbids sendBeacon     | 5                                         |
| KISS                              |     25 | 4 — two routes move                       | 4                                        | 2 — cookie options, CSRF surface          |
| Fits #18 (real users later)       |     20 | 4 — authz check on the path param         | 4                                        | 3 — clashes with a session cookie         |
| **Total / 500**                   |    100 | **455**                                   | 365                                      | 280                                       |

Points: A = 175+100+100+80 · B = 105+80+100+80 · C = 70+100+50+60.
Sensitivity: KISS at 40 (others renormalised) → A 4.4, B 3.7/5. **A.** The old
`GET /progress` and `PUT /media/:id/progress` are removed (no client but ours).

## 2. What happens to the `'default'` rows

- **A — Seed a real profile** with id `default`, name `Me`, in the migration; it is an
  ordinary profile afterwards (renamable, deletable). New profiles get a UUID.
- **B — Drop the rows**: no production deployment exists, nothing of value is lost.
- **C — The first profile created adopts them** (UPDATE on first `POST /profiles`).

| Criterion                         | Weight | A                                         | B                                 | C                                     |
| --------------------------------- | -----: | ----------------------------------------- | --------------------------------- | ------------------------------------- |
| Keeps the owner's history         |     30 | 5                                         | 0                                 | 5                                     |
| KISS                              |     30 | 5 — one INSERT in the migration           | 5                                 | 2 — a one-shot branch in the service  |
| App usable on first start         |     25 | 5 — a profile always exists               | 2 — empty picker, must create one | 2                                     |
| Uniform ids                       |     15 | 2 — `default` beside UUIDs                | 5                                 | 5                                     |
| **Total / 500**                   |    100 | **455**                                   | 275                               | 335                                   |

Points: A = 150+150+125+30 · B = 0+150+50+75 · C = 150+60+50+75.
Sensitivity: uniform ids at 40 (others renormalised) → A 3.80, C 3.84/5: C edges ahead
only at that extreme weight, and loses the history-free first start; **A**; the id
param is validated as `default | uuid`.

## 3. How the web knows the active profile

- **A — "Who's watching?" at start, remembered in `localStorage`**; the picker is
  skipped when the remembered profile still exists; a header button switches.
- **B — Ask every time** the app loads.
- **C — URL** `/p/:profileId/…` (needs a router).

| Criterion                         | Weight | A                                         | B                               | C                                   |
| --------------------------------- | -----: | ----------------------------------------- | ------------------------------- | ----------------------------------- |
| UX (Netflix-like, design direction) |   35 | 5 — one click, then out of the way      | 3 — a click on every load       | 4                                   |
| KISS                              |     30 | 4 — one storage key, try/catch            | 5                               | 1 — adds a router dependency        |
| Shared device (TV, family PC)     |     20 | 4 — switch button always visible          | 5                               | 4                                   |
| Robust to a deleted profile       |     15 | 5 — falls back to the picker              | 5                               | 3 — dead links                      |
| **Total / 500**                   |    100 | **450**                                   | 430                             | 295                                 |

Points: A = 175+120+80+75 · B = 105+150+100+75 · C = 140+30+80+45.
Sensitivity: shared device at 40 (others renormalised) → A 4.4, B 4.5/5: B wins only
when shared devices dominate; the switch button keeps A usable there. **A.**

## 4. Who may manage profiles (UC9) before #18

- **A — Anyone on the server's network**, documented; #18 restricts UC9 to the owner.
- **B — An owner PIN** in the server config, checked on create / rename / delete.
- **C — Manage from the CLI / config file only.**

| Criterion                         | Weight | A                                         | B                                       | C                              |
| --------------------------------- | -----: | ----------------------------------------- | --------------------------------------- | ------------------------------ |
| Scope discipline (#18 owns auth)  |     35 | 5                                         | 2 — a half auth scheme                  | 4                              |
| Owner can manage in the web       |     25 | 5                                         | 5                                       | 0                              |
| Risk (LAN, loopback by default)   |     25 | 3 — household can rename / delete         | 4                                       | 5                              |
| KISS                              |     15 | 5                                         | 2                                       | 3                              |
| **Total / 500**                   |    100 | **450**                                   | 325                                     | 310                            |

Points: A = 175+125+75+75 · B = 70+125+100+30 · C = 140+0+125+45.
Sensitivity: risk at 45 (others renormalised) → A 4.1, B 3.5, C 3.6/5. **A**; `HOST`
stays loopback by default, so the exposure is opt-in.

## Consequences

- Migration: `profiles` table, seeded `default` / `Me`, `watch_progress.profile_id`
  becomes a foreign key to `profiles.id` with cascade delete (table rebuild in SQLite).
- New `src/profiles/` module (repository + routes); `src/progress/` routes move under
  `/profiles/:profileId/`. The web gains a profile picker, a manage dialog and a switch
  button; every progress call carries the active profile.
- The last profile cannot be deleted (409), so the picker is never empty.
- Until #18 any client on the network can manage profiles; profiles are not a security
  boundary, only a preference boundary.
