# ADR-0036 — Local discovery topology and gate scope

Record the owner decisions behind the empty local Prowlarr / Radarr installation of #327 and the scope of its gate steps.

- Status: accepted by the owner (decisions 1–2 by 2026-11-14, decisions 3–5 on 2026-11-15).
- Date: 2026-11-15.
- Scope: #327 (and its fixes #343–#346); no source configured, no retrieval, no Pi deployment.
- Detail and full matrices for decisions 1–3:
  [local discovery topology spec](../specs/local-discovery-topology.md).

## Context and drivers

Epic #306 needs a movie discovery executor before any retrieval work (#328, #310–#315). The
installation must stay private (loopback only, authenticated before it listens), reproducible from
pinned inputs, and pass the same image security gate as the application. The decisions were taken
in the spec while the work advanced; this record gathers them so later bricks cite one place.

## Decisions

1. **Responsibility** (spec § Responsibility decision). PopcornTV owns the daily / manual cadence
   and delegates movie searches to Radarr; Prowlarr owns the indexers and synchronises them into
   Radarr. Rejected: PopcornTV querying Prowlarr itself; Seerr as a request gateway.
2. **Security rebuild of Radarr, #343** (spec § Security rebuild decision). The stable Radarr image
   fails the image scan on ImageSharp; the image is rebuilt from the pinned upstream source with the
   one corrected package reference, under the owner's Six Labors Community license passed as a
   BuildKit secret. Rejected: waiting for upstream; dropping Radarr for a direct Prowlarr adapter.
3. **Authenticated loopback ingress, #345**. Application containers publish no host port. One
   Caddy container, built from pinned source, is the only member of both the internal discovery
   network and the ingress bridge, and publishes the two administration ports on `127.0.0.1` only
   after the private authentication proof. Total 435/500 once the source rebuild is counted,
   against 425/500 for administration over the private address and 310/500 for a host relay
   (spec § Accepted ingress correction).
4. **Hardened XML parsing**. The controller reads each service's private `config.xml` with
   `defusedxml` rather than the standard library parser.
5. **Gate scope**. The licensed Radarr rebuild and the real-container journey run in `just gate`
   only when the diff against the base touches a path in `DISCOVERY_PATHS`
   (`scripts/local-ci.py`); every other diff records `discovery: not-applicable` in the run
   evidence. Both Dockerfiles are still linted on every run, and #315 replays both steps on the
   whole epic before any deployment.

## Weighted comparison — decision 4

Scores 0–5, weights sum to 100.

| Criterion | Weight | A: `defusedxml` | B: justified `nosemgrep` | C: regex extraction |
|---|---:|---|---|---|
| Security | 35 | 5 — hardened parser | 4 — private 0600 file, no external entity in practice | 3 — fragile parsing |
| Gate without waiver | 25 | 5 | 2 — it is a waiver | 4 |
| Simplicity and dependencies | 25 | 3 — one pinned dependency | 5 | 2 |
| Effort | 15 | 4 | 5 | 3 |
| Total /500 | 100 | **435** | **390** | **300** |

Sensitivity: A stays first while the simplicity weight stays under about 45.

## Weighted comparison — decision 5

| Criterion | Weight | A: scoped to discovery paths | B: every diff |
|---|---:|---|---|
| A defect in the discovery stack is caught before merge | 35 | 4 — every diff that can change it runs both steps; a base-image drift waits for #315 | 5 |
| Gate usable on unrelated bricks | 30 | 5 — no license, no 20-minute rebuild | 1 — every web or docs diff needs the private license file |
| Evidence stays honest | 20 | 4 — `not-applicable` is recorded, never shown as passed | 5 |
| Maintenance | 15 | 3 — a path list to keep current, tested | 5 |
| Total /500 | 100 | **415** | **380** |

Sensitivity: B overtakes A only if the first criterion weighs more than about 60.

## Consequences

- `pyproject.toml` gains one runtime dependency (`defusedxml`), tracked by Dependabot `uv`;
  `uv sync --locked` refuses a stale lock.
- The path list is part of the gate: a new file that can change the discovery images must be added
  to `DISCOVERY_PATHS`, and `scripts/tests/test_local_ci_runner.py` pins the current list.
- The earlier rule "no path exemption" of the gate specification keeps applying to the application
  container checks; this record is its single exception
  ([local gate operation](../specs/local-gate-operation.md)).
- Follow-ups: credential rotation #347, host-gateway canary and masquerade #348, image and gate
  hardening #349, scope statements #350.
