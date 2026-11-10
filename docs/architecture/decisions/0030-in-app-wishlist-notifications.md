# ADR-0030 — Wishlist availability is notified in the app

- Status: accepted (owner chose A in the #277 chat, 2026-11-10)
- Date: 2026-11-10
- Deciders: owner
- Related: spec [wishlist-notifications](../specs/wishlist-notifications.md), ADR-0016,
  ADR-0027, ADR-0029, issue #277

## Context

A My list title may arrive in a library or on a legal French provider the profile subscribes
to (#184 data). The profile must learn it. Owner rule: features live in PopCornTV itself; only
network plumbing is outside.

## Options

A — in-app notifications (table + bell with unread count, polled); B — Web Push (service
worker, VAPID, browser vendors' push relays); C — e-mail (external SMTP); D — Telegram bot.

| Criterion                      | Weight | A                       | B                                | C                          | D                          |
| ------------------------------ | -----: | ----------------------- | -------------------------------- | -------------------------- | -------------------------- |
| Built in, no third party       |     30 | 5 — all local           | 3 — vendor push relays           | 2 — external SMTP server   | 0 — Telegram bot API       |
| Simplicity (KISS)              |     25 | 5 — a table and polling | 2 — service worker, VAPID, subscriptions | 2 — SMTP config, templates | 3 — one HTTP call          |
| Reach with the app closed      |     20 | 1 — seen on next visit  | 5                                | 4                          | 5                          |
| Security / privacy             |     15 | 5 — nothing leaves      | 3 — endpoint and payload sent out | 3 — titles in clear mail  | 2 — titles sent to Telegram |
| Testability                    |     10 | 5                       | 3                                | 3                          | 3                          |
| **Total /500**                 |    100 | **420**                 | **315**                          | **265**                    | **235**                    |

A: 150 + 125 + 20 + 75 + 50 = 420. B: 90 + 50 + 100 + 45 + 30 = 315. C: 60 + 50 + 80 + 45 + 30
= 265. D: 0 + 75 + 100 + 30 + 30 = 235.

Sensitivity: with "reach" at 40 (built-in 25, simplicity 15, privacy 10, testability 10),
B (365) passes A (340). The owner opens the app to pick a film anyway, so reach weighs 20.

## Decision

A. A `notifications` table per profile, filled by a scheduled check (ADR-0016 pattern) that
diffs what each wishlist row last saw (`seen_in_library`, `seen_provider_ids`) against the
local match and the French offers (shared `StaleCache`, ADR-0027). "My providers" are chosen
from the offers already shown, so no new TMDB endpoint.

## Consequences

- No notification while the app is closed; Web Push can be added later on the same table.
- At most one TMDB call per wishlisted title a day, serial.
