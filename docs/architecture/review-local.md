# Local review — popcorntv (#31 security headers)

Pre-push and pre-merge gate for issue #31: security headers on the API and no inline style in
the catalog.

- Date: 2026-11-02
- Commit: `00ac7e6`
- Scope: branch diff `origin/main...HEAD` (6 source files)
- Checks run: design · docs · tests · security · correctness · QA (containers out of scope)
- Verdict: ship as-is · Must 0 · Should 0 open (4 fixed in `00ac7e6`) · Nice 3

## Pre-merge gate (head SHA `00ac7e6`)

| Step | Result |
|---|---|
| 1 Tests | ✅ 300 server · 125 web · 19 shared (no E2E suite yet) |
| 2 Coverage | server 98.1 % stmts / 95.4 % branches / 95 % funcs / 98.2 % lines · web 99.8 / 93.4 / 100 / 100 · shared 87.1 / 100 / 100 / 84 (floor 80) · docs: every touched public symbol documented |
| 3 SonarQube | ✅ PASSED |
| 4 Secrets | ✅ gitleaks clean (`origin/main..HEAD`) · only `.env.example` tracked · diff read: nothing sensitive |
| 5 QA pass | ✅ pass · headers on 200/201/206/400/404/413 and through the proxy · playback direct + HLS · no `[style]` · stagger 0→360 ms, 0 with reduced motion · SEC probes green or N/A · report: `docs/architecture/qa/2026-11-02-security-headers.md` |

- Gate: **GREEN — merge authorised** (pending owner approval)

## 🔴 Must Have

_None._

## 🟡 Should Have

All fixed in `00ac7e6`:

- `apps/server/src/app.ts:24` `[docs|security]` · CORP was described as "no embedding" and its
  same-origin deployment constraint was undocumented · docstring rewritten.
- `apps/web/src/styles/catalog.css:186` `[design|docs|correctness]` · the stagger silently
  depended on rows being children of `.view` · selectors scoped to `.view > .row`, note in
  `CatalogBody`.
- `apps/server/src/app.test.ts:60` `[tests]` · header tests compared against the exported
  constant and asserted no status · literal values and per-case status, duplicate 500 test merged.
- `apps/web/src/catalog/CatalogPage.test.tsx:65` `[tests]` · checked `.row[style]` only · now any
  `[style]` in the catalog.

## 🔵 Nice to Have

- `apps/server/package.json` `[security]` · `pnpm audit --prod`: two moderate advisories (`glob`,
  `minimatch`) through `@fastify/static`; not in this diff · proposed follow-up issue.
- Web host `[security]` · no CSP, `frame-ancestors`, `Permissions-Policy` or HSTS until something
  serves the web build (out of #31 scope) · proposed follow-up issue, same origin as the API.
- `apps/web/vite.config.ts` `[correctness]` · dev proxy target hard-coded to `localhost:3000` ·
  proposed follow-up issue.

## ⚪ Disagree / Intentional

- `apps/web/src/styles/catalog.css:188` `[design]` · six `nth-child` rules look repetitive; CSS has
  no portable sibling-index function, so a generator would be more machinery than this needs.

## Per-dimension summary

- Design: KISS `onSend` hook, no dependency, no over-engineering.
- Docs: touched symbols documented; ADR-0004 still accurate.
- Tests: can fail, now pin values and status.
- Security: no hijacked reply bypasses the hook; CORP same-origin holds with the Vite proxy.
- Correctness: stagger matches the old `min(index, 6)` behaviour.
