# Local movie discovery services

Issue #327 prepares an empty, isolated Prowlarr/Radarr installation before real movie discovery and retrieval.

Status: proposed; owner approved an empty configuration on 2026-11-14, but the detailed
topology and responsibility choice below still require conception validation before coding.

## Need and boundaries

The first trial is a film. Prowlarr centralizes multiple indexers; Radarr handles movie
discovery; PopcornTV retains authorization, wishlist intent and preparation/readiness policy.
Source candidates are not playable media. #310 implements the once-daily/manual bounded
trigger; #328 provisions VPN-isolated retrieval; #311 validates complete-file readiness.

- **REQ-34:** start only local Prowlarr and Radarr with empty persistent configuration,
  pinned image tags/digests, health checks and bounded CPU/memory/PIDs/logs.
- **REQ-35:** keep administration on loopback with authentication, secret-bearing state
  private to the operator and no credentials in PopcornTV browser payloads or diagnostics.
- **REQ-36:** define one movie-search executor and one cadence owner; prevent background
  RSS grabbing, import-list additions and add-with-search from competing with #310.
- **REQ-37:** no configured indexer, provider account, downloader, media-library mount,
  external source query or real acquisition in this empty installation. Verify persistence,
  isolation and service failures with controlled fixtures.

The read-only inventory on 2026-11-14 again found no matching local containers, including
stopped ones. Proposed host ports 19696/17878 had no listening sockets. This is not proof
that dormant packages or files do not exist. Existing staging services are separate.

## Responsibility decision

A: PopcornTV owns the future daily/manual cadence and delegates movie searches to Radarr;
Prowlarr owns indexers and synchronizes their configuration into Radarr. B: PopcornTV
queries Prowlarr and implements source selection itself, with Radarr outside the search
path. C: add Seerr as the request gateway before Radarr/Prowlarr.

Scores are engineering estimates informed by the actual service boundaries and branch
inspection, not measured performance. Weights sum to 100, scores are 0–5.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Explicit cadence/search ownership | 30 | 5: one trigger, Radarr executor | 4: direct coordinator must own selection too | 3: additional request orchestration |
| First-film operating simplicity | 25 | 5: two services | 2: implement selection despite adding Radarr | 2: three services and account policy |
| Preserve PopcornTV preparation policy | 20 | 4: final policy stays local; mapping needed | 5: local candidate control | 3: reconcile another request lifecycle |
| Bounded contract testability | 15 | 4: Radarr/Prowlarr boundaries | 4: direct indexer boundary | 3: additional permission/request boundary |
| Reuse existing branch | 10 | 2: reuse review lessons only | 2: reuse review lessons only | 5: existing Seerr-specific client |
| Weighted total /500 | **100** | **435** | **350** | **295** |

Points by row: A=150+125+80+60+20, B=120+50+100+60+20, C=90+50+60+45+50.
Doubling simplicity to 50 and scaling other weights by 2/3 gives A=456.67, B=300,
C=263.33. Halving it to 12.5 and scaling others by 7/6 gives A=424.17, B=375,
C=310.83. A remains the recommendation. B is the fallback if Radarr cannot satisfy the
accepted bounded-search/finality contract; that requires a reviewed #310 design change,
not silently activating another scheduler.

Selective #128 review: `feat/128-seerr-requests` has ADR-0032 and a Seerr-specific client
using a fixed destination, bounded response/in-flight work and no automatic POST retry.
It is not on main and is not an installed service. Its owner-only administrator semantics
cannot simply become the household wishlist policy. Reuse these lessons, not a competing
Seerr scheduler or an unreviewed wholesale cherry-pick.

## Proposed local deployment contract

Separate Compose project under `deploy/local-discovery/`; do not modify existing staging
or Pi deployment. Compose operations are explicit commands, never an implicit server startup.

| Service | Host administration | Internal API | Initial resource ceiling |
|---|---|---|---|
| Prowlarr | 127.0.0.1:19696 | HTTP 9696 | 256 MiB, 1 CPU, 128 PIDs |
| Radarr | 127.0.0.1:17878 | HTTP 7878 | 512 MiB, 1 CPU, 128 PIDs |

These memory ceilings are starting budgets, to be measured at startup/restart; an OOM is a
failed acceptance result, not silently fixed by removing the limit. Logs: Docker rotation
2 MiB ×3 per service plus verified bounded application rotation. Capture actual disk usage;
configuration storage is not falsely described as a filesystem-enforced quota.

Use numeric operator UID/GID, no capabilities, no-new-privileges, read-only root filesystem,
bounded /tmp and executable /run only where s6 requires it. Private bind-mounted config
directories under ignored `data/local-discovery/` are initialized by the host operator with
mode 0700 before non-root startup. Refuse symlink/unowned paths and unexpected existing
state; never reset or recursively delete existing configuration automatically.

Start with an internal Docker network, external DNS disabled and explicit service aliases
using preflight-checked private addresses. Verify no subnet collision before creation and
test denied external TCP/DNS rather than inferring isolation from Compose syntax. No Docker
socket, host networking, privileged mode or permanent media mount. Opening egress or attaching
an indexer later requires an explicit reviewed configuration change; a loopback port alone
is not authentication. Bind application authentication explicitly and do not rely on LAN
authentication bypass. Operator access to each tool's own authenticated admin UI is distinct
from exposing its API key to PopcornTV's frontend.

Bootstrap has two phases: start without published host ports, configure authentication/API
credentials through private operator-only access, and verify that protected API endpoints
reject missing/invalid credentials before publishing loopback administration. If any setup
or verification step fails, keep ports unpublished and retain private diagnostic state.
Public liveness endpoints may remain unauthenticated only when they disclose no private data.
Verify anonymous users cannot read protected configuration or perform administrative writes;
public login/static assets are not required to return 401. Use controlled local TCP/DNS
canaries outside the isolated network with a successful contemporaneous positive control,
not Internet endpoints, to test egress. A dead canary is not proof of isolation.

Bootstrap generates new local application credentials only after validation, writes them to
protected runtime state and records descriptive credential metadata/expiry without logging
values. API clients use headers, not secret-bearing URLs. No existing secret or NordVPN file
is needed. Pin and scan selected image releases before startup; prove non-root/read-only
operation and liveness on those exact images instead of assuming every image tag supports it.

Disable Radarr RSS sync (interval 0), keep import lists and download clients empty, and never
set search-on-add during bootstrap. Prowlarr has no indexers or application sync configured
until local authenticated wiring is deliberately applied. Offline maintenance/update failures
are distinguished from API liveness; health does not mean a film/source is available.

## Tests and implementation exit

[Designed cases](../qa/cases/327-local-discovery.md) cover the boundary; the
[local deployment view](../diagrams/local-discovery/08-deployment-local.md) shows topology.
Use real pinned containers for startup/restart/auth/limits and a disposable deterministic
Torznab fixture for later approved test-only wiring. Fixtures are local synthetic catalog
entries with no downloadable bytes, subscriptions or external tracker calls. Each run owns
its isolated state and can delete only that state, never the operator's persistent install.
Fixture services use a separate Compose project/network and their own generated config/keys;
they must not attach to, write application-sync settings into or configure indexers on the
persistent empty installation. Bootstrap reruns verify existing state and refuse unexpected
owner edits rather than resetting it to empty. Tests demonstrate this refusal without loss.

Timeouts/uncertain configuration writes require a fresh read before retry. Prove only local
configuration reconciliation here. Actual search-command finality, per-indexer backoff,
candidate deduplication and late acquisition writes remain #310 and may block there until
proven; do not claim #327 fixtures implement those domain contracts. A failed indexer fixture
must not prevent a healthy fixture's results when that boundary is exercised.

Acceptance means a reproducible empty local installation, protected access/state, documented
responsibility and controlled boundary evidence. It does not mean a playable film, a connected
PopcornTV scheduler, a VPN-protected download path or a Pi deployment.

## Primary references

- [Prowlarr application/indexer synchronization](https://wiki.servarr.com/prowlarr/settings).
- [Radarr indexer settings](https://github.com/Servarr/Wiki/blob/master/radarr/settings.md):
  zero RSS sync interval disables automatic release grabbing; it does not implement daily search.
- [LinuxServer Radarr](https://docs.linuxserver.io/images/docker-radarr/) and
  [Prowlarr](https://docs.linuxserver.io/images/docker-prowlarr/): documented non-root/read-only
  support must be checked against the pinned images.
