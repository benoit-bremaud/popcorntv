# Local movie discovery services

Issue #327 prepares an empty, isolated Prowlarr/Radarr installation before real movie discovery and retrieval.

Status: accepted by the owner on 2026-11-14, including option A and its weights, after
independent design review and correction verification (Must 0 / Should 0). Empty configuration
is required. Implemented in #327: the targeted real-container acceptance passed at `bedfe9f`
and `16327d2` (QA matrix E327-04, E345-01); the global gate on the whole epic is deferred to
#315.

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

## Accepted local deployment contract

Separate Compose project under `deploy/local-discovery/`; do not modify existing staging
or Pi deployment. Compose operations are explicit commands, never an implicit server startup.

| Service | Host administration | Internal API | Initial resource ceiling |
|---|---|---|---|
| Prowlarr | 127.0.0.1:19696 via ingress | HTTP 9696 | 256 MiB, 1 CPU, 128 PIDs |
| Radarr | 127.0.0.1:17878 via ingress | HTTP 7878 | 512 MiB, 1 CPU, 128 PIDs |
| Fixed Caddy ingress | Both loopback ports | Fixed application upstreams | 96 MiB, 0.25 CPU, 64 PIDs |

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
Fixture services join only the network of the disposable acceptance installation (its own
Compose project, subnet and generated config/keys); they never attach to, write
application-sync settings into or configure indexers on the persistent empty installation. Bootstrap reruns verify existing state and refuse unexpected
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

### Initial build blocker (resolved)

The isolated candidate build restored the dependency graph and compiled
`Radarr.Common` with the SDK above. Publishing requires `-f net10.0` and
`-p:SolutionDir=/src/src/` so that the upstream StyleCop configuration is loaded.
The next step fails in `SixLabors.ImageSharp.targets`: ImageSharp 3.2.0 requires
`SixLaborsLicenseKey`, `SixLaborsLicenseFile` or `sixlabors.lic`. No check was
suppressed. The publisher offers an application-based Community license at
<https://licensing.sixlabors.com/>. The owner received a Community license on
2026-11-14, expiring on 2028-02-12. It is consumed through a required BuildKit
secret mount, never a build argument, committed file, image layer or diagnostic
value. The full-source build and private real-container journey subsequently
passed; see the dated QA evidence below for the precise acceptance scope.


### Runtime contract corrections — 2026-11-15

The initial console-only publish failed actual startup because Linux services
load `Radarr.Mono.dll` through reflection. The final build publishes Console and
Mono from the same patched source. It omits the disabled updater, matching the
LinuxServer packaging boundary, and stamps assembly version `7.0.3.10912` with
configuration `popcorntv-local` and deterministic compilation.

Actual services require an API key for protected API routes; forms cookies
instead authorize the administrative UI. The controller verifies both policies
independently and parses all `Set-Cookie` fields without forwarding cookie
attributes. It rejects missing/wrong API credentials and anonymous UI access
before publication. Private acceptance does not reserve operator host ports.

The local L2 gate lints both Dockerfiles on every run. When the diff against the base
touches a discovery path (`deploy/local-discovery/`, the controller and its tests, the
Python manifests, `scripts/local-ci.py`, `justfile`, `Makefile`, `.hadolint.yaml`), it also
rebuilds the image from its pinned inputs using an existing private `SIXLABORS_LICENSE_FILE`
and executes the actual private-container acceptance journey; any other diff records
`not-applicable` in the run evidence and needs no license (owner decision 2026-11-15,
ADR-0036). #315 replays both steps on the whole epic. Unit/component Python tests enforce a
90% combined branch/statement coverage ratchet and refuse empty/skipped/xfail or
deselected suites. The Python lockfile is scanned alongside the pnpm lockfile.
The gate still requires all existing application and security checks. The private
startup journey alone does not certify the synthetic-source and public-loopback cases:
those were accepted separately (QA matrix E327-04, E345-01).

## Accepted ingress correction (#345) — owner validation 2026-11-15

Docker records requested `HostConfig.PortBindings` for the internal-only bridge,
but actual `NetworkSettings.Ports` is null and loopback connections are refused.
Compose success therefore cannot establish actual publication. The controller
must check effective bindings and authenticated loopback requests before reporting
success; failure must retain state and withdraw publication.

The application network must keep its proven TCP/DNS isolation. The owner validated option A before its implementation. The central Pi proxy
and the existing PopcornTV staging proxy remain outside this local change.

| Criterion | Weight | A: fixed Caddy ingress | B: host relay process | C: private-IP administration |
| --- | ---: | --- | --- | --- |
| Security verification | 30 | 5: apps stay internal; fixed upstreams | 4: additional host lifecycle | 5: existing private path proved |
| Accepted loopback contract | 25 | 5: loopback port publication on ingress | 3: custom host lifecycle required | 2: requires changing the requirement |
| Maintenance | 20 | 4: pinned existing proxy technology | 2: new proxy/service code | 5: no added component |
| Delivery effort | 25 | 4: small proxy and acceptance extension | 3: new lifecycle and failure tests | 5: already privately reachable |
| Weighted total / 500 | 100 | **455** | **310** | **425** |

Recommendation A: one bounded non-root Caddy sidecar with fixed upstream private
IPs and no forward-proxy behavior. Only the sidecar joins an ingress-capable
network and publishes the two loopback ports; Radarr/Prowlarr remain on the
internal-only network. Disable the Caddy administration API, redact request
headers/URIs from diagnostics, pin the image, bound resources and repeat egress
canary checks against the apps with ingress present. Add actual effective-binding,
authentication and restart tests. The additional container does not authorize
external indexers, media retrieval, a Pi deploy or a PopcornTV staging deploy.

Sensitivity: halve loopback-contract weight to 12.5 and redistribute its weight
proportionally (security 35, maintenance 23.3333, delivery 29.1667). Totals become
447.50 / 311.67 / 462.50: C wins if changing the loopback requirement is acceptable.
Final offered response: “Approfondir l'analyse et expliquer”.


### Implemented ingress constraints and provenance

The proxy's internal address is subnet slot 6; fixture sources use slots 4 and 5.
A second /29 is allocated using the existing collision checks before creation,
excluding the application subnet, Docker allocations and non-default host routes.
It is persisted as a private identity-bound `ingress-network.json`; reruns refuse
invalid records and changed Caddy configuration without overwriting them. The
controller verifies Docker's actual network labels, internal/IPv6 flags, subnets,
fixed addresses and exact per-service attachments, not just requested YAML.

All three images are scanned before startup. Rebuilt Radarr and Caddy are resolved
to validated immutable image IDs and started with those same IDs. Caddy 2.11.9's
stock image failed on go-jose/v3 and x/net. The local proxy therefore rebuilds
unmodified official Caddy commit `7ce9f0823762109fc67911f95f6af1a697345ab7` with
Go 1.27.4 and `-mod=readonly`; this upstream graph uses go-jose/v4 4.1.9 and x/net
0.62.0. The source archive SHA-256 is
`23ab43a740477cdfbcecb129010add212003a49089db9145f36e04227856625d`.
The compiler image is pinned at
`sha256:0a5f7fe796599ff487605987432e7619ae45beeb2fba4c2ce0b907879932aebf`.
The actual rebuilt artifact passes the existing HIGH/CRITICAL scan with no new
suppression. This is an unreleased local snapshot, not an upstream stable release.

Only Caddy gains the ingress attachment. Automatic HTTPS, its administration API
and configuration persistence are disabled. Upstreams are fixed private IPs;
request headers and URIs are removed from its runtime logs. The publication check
requires actual loopback-only bindings plus authenticated requests through both
proxy listeners. Rollback also verifies effective private topology and absent
bindings before declaring withdrawal complete. Acceptance uses ephemeral loopback
ports so the installed operator services can stay running.

The bb-homelab configuration already defines the Pi's central Caddy and a PopcornTV
site with per-backend networks. Its repository and current local staging remain
unchanged. Future Pi integration reuses that central proxy and requires separate
ARM64/runtime/deployment validation; the local x64 Radarr build is not a Pi artifact.


### First-listen authentication correction (#346)

The host can reach an internal Docker bridge. New XML therefore enables Forms
and requires authentication **before the first process listen**, rather than
starting with None. The controller refuses unsafe legacy settings, attempts an
owned stop and preserves the existing configuration. Account provisioning uses
the key-protected API even when all policy fields already match; an absent
administrator is not mistaken for completed configuration, and a foreign
administrator is never silently replaced.

Anonymous `/initialize.json` access is checked before any account writes and in
withdrawal verification. A backend that still exposes initialization metadata
cannot pass bootstrap or remain a confirmed running rollback: the owned stop
fallback is attempted. The real journey checks this denial before provisioning
and after a rejected setup request. Generated operator keys from the earlier
bootstrap were rotated as a precaution, with new-key verification and old-key
rejection; this is not a claim that another user actually accessed them.

The source-pinned ImageResizerFixture success/error regression is now a Bake
`radarr-regression` target. The build recipe requires its two tests to execute
and pass via TRX counters; a filter matching no tests or skipped cases cannot
satisfy it. Its next execution belongs to the deferred global build/gate; the
historical manual run remains separate evidence of two passed cases.

The owner deferred the global CI run to #315 immediately before Pi deployment.
Targeted checks and independent review continue; no signed global success,
merge or deployment is inferred from them. The original Caddy decision remains
accepted: source rebuild maintenance reduces A's maintenance estimate from 4 to
3, total 435/500, still above C's 425/500. The Pi reuses bb-homelab's central Caddy.
