# ADR-0012 — Transcode slot take-over at the limit

- Status: accepted (owner chose option C, #74 chat, 2026-11-06)
- Date: 2026-11-06
- Deciders: owner
- Related: spec hls-transcode R5 and R5b ([spec](../specs/hls-transcode.md)), ADR-0006,
  ADR-0010, issue #74

## Context

Since accounts (ADR-0010) the `TRANSCODE_MAX_SESSIONS` limit (default 1) is shared by all
accounts: a viewer's running transcode makes the owner's Play answer `503
transcode_busy`, and nobody but the viewer can end it (spec auth R10 hides other users'
sessions). A user who starts another title while the previous session is still alive also
gets `503` until its 60 s watchdog fires. The limit itself protects the homelab CPU and
stays. ADR-0006 §6 rejected pre-empting the oldest session because one household member
would kill another; with accounts, the take-over is limited to the caller's own session or
to an owner over a viewer, a cost the owner accepts (#74). Scores 0–5, weights /100,
totals /500; scores are estimates.

## Options

- **A — Own slot**: at the limit, a Play closes the caller's own oldest session.
- **B — Owner first**: at the limit, an owner's Play closes the oldest viewer session.
- **C — A + B**: own oldest session first, else (owner only) the oldest viewer session.
- **D — Per-account limit**: `TRANSCODE_MAX_SESSIONS` per account, no global cap.

| Criterion                      | Weight | A                     | B                          | C                 | D                  |
| ------------------------------ | -----: | --------------------- | -------------------------- | ----------------- | ------------------ |
| Fixes the #74 blocking         |     35 | 2 — not across users  | 4 — not a restarted Play   | 5 — both          | 5                  |
| Protects the homelab CPU       |     25 | 5                     | 5                          | 5                 | 1 — FFmpeg unbound |
| Simplicity (KISS)              |     20 | 4                     | 4                          | 3                 | 5                  |
| Isolation between accounts     |     20 | 5                     | 4 — owner cuts a viewer    | 4                 | 5                  |
| **Total /500**                 |        | **375**               | **425**                    | **440**           | **400**            |

Points: A = 70+125+80+100 · B = 140+125+80+80 · C = 175+125+60+80 · D = 175+25+100+100.

Sensitivity: C − B equals the "Fixes" weight minus the "Simplicity" weight, so C stays
first while "Fixes" outweighs "Simplicity" (at 30 / 25, C 430 and B 425; at 20 / 35, B 425
and C 410). D leads once "CPU" falls below about 18, the points moved to "Simplicity".

## Decision

Option C. Below the limit nothing is taken over, so with `TRANSCODE_MAX_SESSIONS` above 1
one account can still run several sessions; at the default of 1, a second Play of the same
account (another device) ends the first stream. At the limit, `SessionManager.open` closes,
before its first `await`, the caller's own oldest session, else for an owner the oldest
viewer session; otherwise it answers `busy`. An owner never takes another owner's slot.
Each take-over is logged at `info` with the session id and the caller.

## Consequences

- The owner can watch unless every slot is another owner's; a viewer may be cut off
  mid-film when an owner presses Play: its next request answers `404 session_not_found`,
  hls.js fails and the player shows *This file could not be played* (spec 4a).
- The previous stream is ended before the new one is proven: if the new open then fails,
  the caller has neither.
- A viewer at the limit still gets `503 transcode_busy` when every slot is another
  account's.
- Sessions remember their opener's role at open time; a role change applies to the next
  session.
