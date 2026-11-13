# Durable wishlist requests — implementation and review

Issue #309 implements local durable intent; final checked-head results belong in [review-local](../review-local.md).

## Delivered boundary

The owner validated the [request contract](../specs/adaptive-wishlist-requests.md) before coding.
Migration 0011 introduces shared title demand, private interests, exact targets and write-ahead
attempts. Existing wishes are backfilled without any remote write. PUT uses a single immediate
transaction for wish plus interest; DELETE cascades only private interest. Existing HTTP auth,
CSRF, profile ownership and response shape are preserved. No new public endpoint is added.

Repository transitions require fresh needs-preparation evidence and remaining owned interest.
Uncertain/accepted attempts exclude a second claim. Trusted internal retirement assertions
cannot be supplied through a browser endpoint; actual provider proof and dispatch remain #310.
Retirement and evidence invalidation commit together. There is no scheduler, external service
integration, child-account enforcement, readiness signal, cache or deployment in this brick.

## Adversarial review and tests

Design review found and corrected two Must/two Should items: fencing late dispatchers,
unknown local evidence, explicit attempt states and the authoritative #309/#310 scope split.
Independent runtime review found one Must/one Should: retirement reused old missing-file
evidence, and accepted/migration identity wording was stale. Both were fixed and verified
with Must 0 / Should 0. Retirement now clears local resolution in its transaction; an injected
DB failure while clearing it rolls the retirement back.

The [case table](cases/adaptive-wishlist-requests.md) maps happy/sad/edge tests to source rules.
Tests use real SQLite migrations, transactions, separate connections and file close/reopen;
real authenticated Fastify route injection; fake TMDB/time at external boundaries. No new
domain collaborator is mocked. Two-connection arbitration is sequential, not a simultaneous
multi-process lock-contention test. Actual provider and playable-file resolution cases remain
partial and assigned to #310/#311. UAT and real acquisition are not claimed.

New exported types/class/tables and public repository methods carry contract documentation.
This is a scoped presence review, not a percentage claim for the whole application API.

## Security scan baseline and triage

Local Semgrep image: `semgrep/semgrep:1.181.0@sha256:81474464c1f07483ba0682a44787fd93c91397419762a04abe2bafaae396304b`.
Rules: `p/javascript`, `p/typescript`, `p/nodejs`; metrics/version check disabled, read-only
repository mount, unprivileged UID/GID 1000, `.env*`/dependencies/build/coverage excluded.
The initial scan ran 74 rules on 219 source files and identified seven pre-existing audit
matches. Git recognition was confirmed; no ignored credentials were scanned. Registry rules
are fetched at execution time; the engine is pinned, the registry rules are not immutable.

| File / matches | Verified contract | Resolution |
|---|---|---|
| `auth/user-routes.ts` / 2 | User record and live-session array are JSON values | Scoped direct-response-write annotations |
| `discover/routes.ts` / 1 | Wishlist is a JSON array, not an HTML document | Scoped direct-response-write annotation |
| `discover/title-link-routes.ts` / 1 | Link object is JSON; URL validation and no server fetch remain in place | Scoped direct-response-write annotation |
| `profiles/routes.ts` / 1 | Updated profile is a JSON object | Scoped direct-response-write annotation |
| `progress/routes.ts` / 1 | Progress is a JSON array | Scoped direct-response-write annotation |
| `metadata/routes.ts` / 1 | Zod admits only the anchored 64-hex digest plus jpg/png basename, served from fixed artwork root | Scoped sendfile annotation |

Fastify's installed `lib/reply.js` serializes object/array payloads as application/json;
the Express audit rule does not model that distinction. The metadata validator uses the
existing anchored `ARTWORK_FILE` rule before `sendFile`. Each annotation names only the exact
rule and has a local reason. No global exclusion, finding waiver or runtime behavior change
is used to silence the scan. Final scan results are recorded only after a successful rerun.

Resolution comparison (engineering scores 0–5; weights sum 100): A annotates individually
verified false positives; B develops a replacement Fastify-aware ruleset; C leaves the audit
red and requests a waiver. C conflicts with the blocking scan policy and is excluded.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Verified semantic correctness | 40 | 5 — each match checked | 5 — requires new rule validation | 5 — findings classified |
| Narrow scope / existing scan coverage | 30 | 5 — exact findings only | 2 — replaces registry behavior | 5 — scan unchanged |
| Maintenance | 20 | 4 — seven explained annotations | 2 — custom ruleset ownership | 4 — triage record |
| Delivery effort | 10 | 5 — bounded comments | 1 — substantial new tooling | 0 — approval block |
| Total /500 | 100 | **480** | **310** | **430 — excluded** |

Sensitivity: delivery weight10→0, others×100/90 gives A477.78/B333.33/C477.78;
weight10→20, others×80/90 gives A482.22/B286.67/C382.22. A remains the preferred eligible option.

## Gate scope

The first global attempt correctly failed on a control-character-regex lint rule; validation
was rewritten as explicit character-code checks rather than disabling lint. A sandboxed FFmpeg
run encountered EPERM for process/network boundaries and does not count as passing evidence.
The complete gate is rerun with appropriate local permissions; no skipped integration tests
are to be represented as green. Existing Docker CI path filters do not match this diff;
no container/dependency/build-configuration inputs changed. Hosted-only CodeQL, dependency
review and Scorecard are not run under the owner's local-only policy. No signed attestation
mechanism exists in this repository; the merge exception remains explicit.
