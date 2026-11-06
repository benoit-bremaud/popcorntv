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
stays. Scores 0–5, weights /100, totals /500; scores are estimates.

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
| **Total /500**                 |        | **370**               | **420**                    | **445**           | **400**            |

Sensitivity: C stays first with simplicity at 35 (C 430, B 420); D leads only if CPU
protection falls under about 10.

## Decision

Option C. Below the limit nothing is taken over, so one account can still run several
sessions (two screens of one household). At the limit, `SessionManager.open` closes,
before its first `await`, the caller's own oldest session, else for an owner the oldest
viewer session; otherwise it answers `busy`. An owner never takes another owner's slot.
Each take-over is logged at `info` with the session id and the caller.

## Consequences

- The owner can always watch; a viewer may be cut off mid-film when the owner presses
  Play, and sees *This file could not be played* (spec 3d).
- A viewer at the limit still gets `503 transcode_busy` when every slot is another
  account's.
- Sessions remember their opener's role at open time; a role change applies to the next
  session.
