# Local review — popcorntv (#28 reap FFmpeg on a crash)

Pre-push and pre-merge review of branch `fix/28-reap-ffmpeg-on-crash`.

- Date: 2026-11-03
- Commit: 2fa22fe
- Scope: branch diff `origin/main...HEAD` (`apps/server/src/{shutdown,shutdown.test,index,app}.ts`, `Dockerfile`)
- Checks run: design · docs · tests · containers · security · correctness
- Verdict: ship as-is (Must resolved in `f10bbd4`, container Should in `2fa22fe`) · Must 0 · Should 0 open · Nice 1

## Pre-merge gate (head SHA 2fa22fe)

| Step | Result |
|---|---|
| 1 Tests | ✅ 307 server · 125 web · 19 shared (Vitest); no E2E suite yet |
| 2 Coverage | server 98.13 % stmts / 95.43 % branches / 95.08 % funcs / 98.21 % lines; web 99.79 / 93.35 / 100 / 100; shared 87.09 / 100 / 100 / 84 (floor 80) · docs: every new export documented, no doc counter in this repo |
| 3 SonarQube | ✅ PASSED (localhost:9000, `popcorntv`, scanned before the review fixes; rerun before merge) |
| 4 Secrets | ✅ gitleaks clean (`origin/main..HEAD`) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 QA pass | ✅ smoke (server-only change): built server answers `/health`, exits 0 on SIGTERM; image runs `tini` as PID 1, `docker stop` clean; Hadolint clean, Trivy image HIGH/CRITICAL clean |

- Gate: **GREEN for push**; SonarQube rerun on the final SHA before merge.

## 🔴 Must Have

- `apps/server/src/shutdown.ts:23` `[design|correctness]` · `close()` waits for open responses, so a direct-play stream could hold the FFmpeg kill for a whole film · **fixed `f10bbd4`**: sessions close in `preClose` (`app.ts:117`) and the exit is forced after `SHUTDOWN_DEADLINE_MS` (10 s), fake-timer test.

## 🟡 Should Have

- `apps/server/src/shutdown.test.ts:47` `[tests]` · idempotence test did not hold `close()` pending, vacuous `waitFor` on the second emit · **fixed `f10bbd4`**: pending close, `toHaveBeenCalledExactlyOnceWith`.
- `apps/server/src/shutdown.ts:35` `[design|docs]` · a crash during shutdown logged "closing" yet exits 0; docstring missing first-event-wins and forced exit · **fixed `f10bbd4`**.
- `Dockerfile:46` `[containers|design]` · compose `init: true` covers compose only · **fixed `2fa22fe`**: tini in the image as `ENTRYPOINT` (MCDA A 420 vs compose 345), compose init dropped.

## 🔵 Nice to Have

- `apps/server/src/shutdown.ts` `[correctness]` · outside a container, a `kill -9` of Node still orphans FFmpeg (no portable parent-death signal in Node) · accepted limit, documented here.

## ⚪ Disagree / Intentional

- `apps/server/src/shutdown.ts:8` `[design]` · injecting a `process` slice is a real test seam, not over-engineering.
- Issue #28 free-disk check · dropped: HLS sessions live in memory (owner validated 2026-11-03).
- Issue #28 attached pictures · already skipped since #8 (`ffprobe.ts:60`, tested `ffprobe.test.ts:37`).

## Per-dimension summary

- Design: one Must (unbounded close) fixed · Docs: docstrings explain why · Tests: unit only, race and deadline now covered · Containers: tini PID 1 verified · Security: no new input, no secrets · Correctness: smoke-tested on the built server and image.
