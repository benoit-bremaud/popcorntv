# Local review — popcorntv (fix/118-ffmpeg-local-protocols)

- Date: 2026-11-10
- Commit: b6ff7e9 + round-2 Should fixes
- Scope: branch diff origin/main...HEAD
- Checks run: adversarial (Opus, 2 rounds, covering correctness, security, tests, docs and design of the diff) · execution checks
- Verdict: ship · Must 0 · Should 0 open · Nice 0

## Adversarial review (#236)

- Round 1 on `edd60b7`: Must 1 · Should 4 · Nice 3 · unverified 0 · Push gate: closed
- Round 2 on `b6ff7e9`: 8 fixed · 0 not fixed · 0 regressed · new Must 0 · **Push gate: open** (2 new Should, fixed in the next commit)
- Optional second review (owner's OpenAI account): ChatGPT/Codex not run

## Pre-merge gate (head SHA: see PR)

| Step | Result |
|---|---|
| 1 Tests | ✅ shared 45 · server 733 with `FFMPEG_IT=1` · web 440 (UC26 flaky once, green on rerun, #273) |
| 2 Coverage | server 96.96 % stmts / 92.57 % branches / 95.98 % funcs / 98.32 % lines · docs ⏸ deferred to the pre-merge run (`--push`) |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean (origin/main..HEAD) · only `.env*.example` tracked · diff read: nothing sensitive |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run (`--push`) |

- Gate: `--push`: **pre-push green** — typecheck, lint, format, tests passed; SonarQube, doc coverage, E2E deferred

## 🔴 Must Have

- `apps/server/src/ffmpeg-input.integration.test.ts` `[adversarial|tests]` · crafted-file tests passed without the fix · fixed: sibling concat with protocol-only control, assertions on "Format not on whitelist"

## 🟡 Should Have

- `docs/architecture/decisions/0028-local-only-ffmpeg-input.md` `[adversarial|docs]` · threat overstated, MCDA totals wrong, `mpegts` unexplained · fixed
- `SECURITY.md`, ADR-0006/0009/0023 `[docs]` · no mention or back-link · fixed
- `docs/testing/qa-matrix.md` `[docs]` · QA steps expected a log line the server never writes · fixed

## 🔵 Nice to Have

- `apps/server/src/ffmpeg-input.test.ts`, `ffmpeg-input.ts`, `CLAUDE.md` `[tests|docs]` · literal array assertion, `as const`, layout entry · fixed

## ⚪ Disagree / Intentional

- `apps/server/src/ffmpeg-input.ts` `[adversarial]` · `file` only, not `file,pipe`: input options do not affect outputs (`framecrc` to `-` verified)

## Per-dimension summary

- Adversarial: 2 rounds, gate open · Design: one pure helper, four call sites, no new layer · Docs: ADR-0028, SECURITY, back-links · Tests: unit + discriminating FFmpeg integration · Security: closes sibling concat and demuxer surface · Correctness: all six containers probe, transcode, seek and extract subtitles
