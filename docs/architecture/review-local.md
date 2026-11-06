# Local review — popcorntv (docs/109-security-audit)

Pre-push review of #109: the 2026-11-06 security audit report and the gitignored pentest scope.

- Date: 2026-11-06
- Commit: e3284b7 (+ wording commit)
- Scope: branch diff origin/main...HEAD (`.gitignore`, `docs/security/reports/2026-11-06-security-audit.md`, this file)
- Checks run: adversarial (Opus, 2 rounds) · docs · security · correctness (design, tests and containers: n/a, docs-only diff)
- Verdict: ship as-is · Must 0 · Should 0 · Nice 0

## Adversarial review (#236)

- Round 1 on `bf04650`: Must 3 · Should 2 · Nice 2 · unverified 0 · Push gate: closed
- Round 2 on `e3284b7`: 7 fixed (one title kept as `chore(security):` on purpose) · 0 not fixed · 0 regressed · new Must 0 · **Push gate: open**; its 2 wording Nice applied in the next commit
- Round 3 on `2d7cb5f` (after the Codex P2 on PR #113, recorded as SA-04 #114): 2 Nice fixed · new Must 0 · Should 1 (SA-04 widened to directory swaps and ffprobe) applied in the next commit · **Push gate: open**
- Hosted reviewers: Codex posted one P2 on `805a199` (O_NOFOLLOW claim), fixed and answered inline

## Pre-merge gate (head SHA filled at the pre-merge run)

| Step | Result |
|---|---|
| 1 Tests | ✅ shared 38 · server 521 · web 199 (run by the adversarial reviewer on e3284b7) |
| 2 Coverage | ⏸ deferred to the pre-merge run (`--push`) |
| 3 SonarQube | ⏸ deferred to the pre-merge run (`--push`) |
| 4 Secrets | ✅ gitleaks clean (main..HEAD) · only `.env.example` tracked · diff read: no address, token or personal data |
| 5 E2E/smoke | ⏸ deferred to the pre-merge run (`--push`) |

- Gate: `--push`: **pre-push green** — typecheck, lint, format:check and tests passed; coverage, SonarQube and E2E deferred.

## 🔴 Must Have

_None._

## 🟡 Should Have

_None._

## 🔵 Nice to Have

_None._

## ⚪ Disagree / Intentional

- Report named `2026-11-06-security-audit.md`, not `-pentest.md`: it covers the white-box review, CI and container as well as the cards.
- No `PROJECT_LOG.md` entry in this PR: the project logs each merge in a follow-up `docs(log)` PR.

## Per-dimension summary

- Adversarial: 3 Must on round 1 (missed #74, Semgrep claim, SA-01 rule), all fixed · Docs: report complete per pentest-campaign REPORT · Security: no secret or address in the diff, scope file ignored · Correctness: claims checked against the code.
