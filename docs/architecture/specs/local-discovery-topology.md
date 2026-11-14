# Local movie discovery services

Issue #327 prepares an empty, isolated Prowlarr/Radarr installation before real movie discovery and retrieval.

Status: accepted by the owner on 2026-11-14, including option A and its weights, after
independent design review and correction verification (Must 0 / Should 0). Empty configuration
is required; implementation and real-container acceptance remain in progress.

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

## Security rebuild decision (#343)

The owner approved option A on 2026-11-14. The original stable images remain
blocked by the image security gate and must not be started. A clean scan of the
pinned Prowlarr nightly snapshot does not establish runtime acceptance or stable
release status.

| Criterion | Weight | A: rebuild Radarr | B: wait upstream | C: direct Prowlarr |
| --- | ---: | --- | --- | --- |
| Verifiable security | 30 | 4: inspect and scan the corrected build | 5: upstream correction | 5: scanned Prowlarr snapshot |
| Approved architecture | 25 | 5: retain Radarr executor | 5: retain Radarr executor | 2: change search ownership |
| Time to first trial | 30 | 3: compilation work remains | 0: unknown release date | 3: integration changes remain |
| Maintenance | 15 | 2: own a narrow source rebuild | 5: upstream image maintenance | 3: additional adapter |
| Weighted total / 500 | 100 | **365** | **350** | **335** |

Scores estimate engineering effort, not a delivery deadline. Sensitivity: reduce
trial timing to 15 and redistribute its 15 points proportionally to the other
criteria (security 36.4286, architecture 30.3571, maintenance 18.2143); totals become
378.93 / 425 / 342.50. Waiting wins when speed matters less. The final offered
choice was “Approfondir l'analyse et expliquer”.

### Rebuild inputs and acceptance

- Official source: `Radarr/Radarr`, commit
  `af772b051ac27a0615c7f8b7f78622b6dc183be0`. The queried
  `v7.0.3.10912` tag did not exist; never infer a source revision from an image tag.
- Downloaded GitHub source archive SHA-256:
  `e64fd88a9cc31c7737b049b606bf412f6e7d9042d1c0c50e17f3862f9506a4fc`.
- SDK: `mcr.microsoft.com/dotnet/sdk:10.0.404-alpine3.24`, manifest-list digest
  `sha256:0294f285d062afacc8b5f6d7febb0cd4ee879320e5585fa15f2f4ebf1feb9ba7`.
- Candidate patch: the one exact `SixLabors.ImageSharp` package reference in
  `src/NzbDrone.Core/Radarr.Core.csproj`, from `3.1.12` to `3.2.0`. NuGet's official
  version index confirms publication. Compilation and vulnerability scanning must
  confirm suitability; publication alone is not acceptance.
- Compile the Linux console project (`Radarr.Console.csproj`), not the Windows
  desktop project. Rebuild its complete dependency graph and dependency manifests;
  never swap a binary into an incompatible published graph.
- Preserve upstream licensing, UI and native dependencies. Run the upstream image
  resize success/error tests plus actual startup, authentication, persistence and
  resource-limit acceptance. Keep generated build logs and image identity.
- No new vulnerability suppression, altered scanner inventory, ignored advisory
  or skipped security step is an acceptable fix. The final image must pass the
  existing HIGH/CRITICAL image gate before service startup.

### Interruption boundary

The controller translates SIGTERM into a catchable interruption while preserving
and restoring the previous handler. Publication failure attempts private
recreation and then an owned stop if withdrawal fails; cleanup failures remain
visible without hiding the original error. SIGKILL and power loss cannot execute
cleanup: operators must reconcile the owned installation after either event.
A completed installation with changed managed settings is refused without writes.
