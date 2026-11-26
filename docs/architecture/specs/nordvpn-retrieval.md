# Persistent local retrieval behind NordVPN

Issue #328 delivers a bounded, empty local qBittorrent installation whose public traffic can leave only through a dedicated VPN namespace.

## Status and scope

Option A and the design were accepted by the owner on 2026-11-15 (ADR-0035). The empty
local installation and its controller are implemented and covered by the local gate
(`just retrieval-check`). Connected operation, ordered restart, abrupt gateway exit,
endpoint interruption and storage saturation passed on the owner's AMD64 workstation in
November 2026; the [historical record](../qa/2026-11-26-issue-328-local-retrieval.md)
summarises that evidence. Staging and ARM64 runtime qualification are owner-run and pending.

Since the 2026-11-23 redefinition of epic #306 this installation is the retrieval egress of
[on-demand retrieval](on-demand-retrieval.md): it carries the "nothing ever leaves the host
outside the VPN" half of REQ-56 and the egress rule of NFR-18, and its dedicated filesystem
holds the cache that ADR-0044 caps at 100 GiB by default. Automated tests use synthetic or
local fixtures only (NFR-17): the agent never starts the real VPN, never reads the owner's
WireGuard file and never triggers a retrieval. This document does not authorize public
acquisition, subscriptions, credential rotation or Pi deployment.

Use the existing risk-first UP elaboration method from ADR-0033 and the accepted bounded
backend boundary from ADR-0034. The local operator is the stakeholder. UC34 below is an
infrastructure use case beside the viewer use cases UC40–UC45, not a new viewer workflow.
Deployment and sequence views answer the material topology/lifecycle questions. No new
application classes, data model, player component or independent acquisition scheduler is proposed.

## Evidence and integration boundaries

- Verified repository evidence: #308's [VPN experiment](../qa/2026-11-12-issue-308-backend-vpn.md)
  demonstrated connected egress, controlled stop and recovery. It did not establish crash,
  blackhole or container-recreation safety. Its development image exception is experiment-only.
- #327 (PR #351, `ada6317`) provides empty isolated discovery services with loopback ingress.
  No discovery network attachment or broad outbound-subnet exception is inherited here.
- The source search (#310), the verified-read cache (#311), the scheduler and admission (#437,
  #312), progressive playback (#313) and deletion (#438, #439) are later bricks. A finished
  client transfer never establishes playability; only verified bytes do (ADR-0034).

## Requirements

REQ-34–37 belong to #327. REQ-38–42 and UC34 are defined here; REQ-43 onwards belong to
[on-demand retrieval](../../requirements/08-on-demand-retrieval.md).

| ID | Contract | Measurable acceptance |
|---|---|---|
| REQ-38 | qBittorrent shares only Gluetun's namespace; no host fallback, extra client network, privileged client or Docker socket | Inspect effective namespace/network and capabilities; connected positive controls succeed and out-of-tunnel canaries receive zero client payloads in every failure case |
| REQ-39 | Configuration and authenticated administration remain private from first listen | Refuse unsafe permissions, symlinks and foreign state; no anonymous API access; no secret in environment, command arguments, rendered Compose, logs or evidence |
| REQ-40 | Persistent retrieval has enforceable storage and process bounds, outside the owner's library | Start refuses a missing hard quota, an undeclared `MEDIA_ROOT` and a mount that contains, or sits inside, it; exhaustion cannot write into the library or exceed the dedicated volume |
| REQ-41 | Tunnel loss and gateway replacement preserve isolation and state | Startup without VPN, controlled stop, process termination, packet blackhole, restart and recreation all deny bypass; recovery rechecks non-host egress before admission |
| REQ-42 | Retrieval infrastructure remains distinct from acquisition and playback | No automatic download submission, import, scheduling, library mount or ready notification; repeated reconciliation identifies the same persisted synthetic transfer |

## UC34 — Operate isolated local retrieval

Primary actor: local operator. Goal: start, inspect, stop and recover the private retrieval
service while preserving its state and preventing an ordinary host-route fallback.

Preconditions: reviewed image pins and scans, Docker access, owner-selected private configuration
file and verified quota-backed data root. Missing prerequisites refuse startup categorically.
Trigger: explicit operator start. Success: authenticated client reachable locally, tested
VPN egress, effective resource/network identity and empty operator transfer queue.
Minimum guarantee: no new admission; owned processes stopped if safety cannot be verified;
configuration/cache retained, no unrelated resource or secret modified.

1. Validate ownership, permissions, quota, route/subnet collisions and pinned artifacts.
2. Prepare private client authentication before first listen; preserve an existing administrator.
3. Start Gluetun with its firewall enabled and secret file read-only; await bounded health.
4. Start qBittorrent in that exact namespace, with peer discovery/UPnP disabled and no transfers.
5. Verify namespace inode/owner, effective limits, authenticated API and egress from that namespace.
6. Expose authenticated administration through Docker-exec loopback API control only.
   No host port is published in this first installation.
7. On stop, stop client before gateway; preserve data. On recreation, stop/remove the owned
   client first and recreate it against the new gateway namespace before repeating verification.

Failure paths: missing secret or unsafe runtime state refuses startup and attempts an
ordered stop when installation ownership is independently established; startup timeout
stops owned resources; ambiguous cleanup reports failure and retains private diagnostics.
Loss of tunnel blocks packets through the firewall immediately, independently of controller
polling. Admission stays disabled after uncertain restart or failed revalidation.

## Proposed topology decision

A: qBittorrent shares a dedicated Gluetun namespace, kernel WireGuard, private file configuration.
B: qBittorrent shares a dedicated Gluetun namespace, OpenVPN and private service credentials.
C: route the host through NordVPN and let qBittorrent use ordinary Docker networking.

Scores are design judgments, not measured reliability. A/B isolation scores assume the required
failure tests pass. C has a blocking zero on namespace isolation and is ineligible.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Namespace isolation (mandatory) | 35 | 5 — dedicated namespace/firewall | 5 — same boundary | 0 — relies on host routing |
| Reuse of measured evidence | 20 | 5 — #308 WireGuard path | 2 — protocol not tested in #308 | 1 — different host-wide boundary |
| Protected credential handling | 15 | 5 — existing private file approach | 4 — separate service credentials needed | 3 — host client configuration |
| Operational simplicity | 15 | 4 — two-service ordered lifecycle | 4 — same lifecycle plus tunnel device | 2 — host/Tailscale routing impact |
| Local resource cost | 10 | 4 — estimate, benchmark pending | 3 — estimate, benchmark pending | 4 — estimate, shared host client |
| Reversibility | 5 | 5 — isolated owned resources | 5 — isolated owned resources | 2 — host route restoration needed |
| Total /500 | 100 | **475** | **390** | **145 (ineligible)** |

Weighted row points: A 175/100/75/60/40/25; B 175/40/60/60/30/25;
C 0/20/45/30/40/10. A leads B by 85. Halving evidence weight to 10 and
rescaling others gives A 471.875, B 413.75, C 150.625. Doubling to 40 gives
A 481.25, B 342.5, C 133.75. Recommendation A remains first. B is the design
fallback if supported WireGuard qualification fails; it needs new protocol tests,
secret provisioning and device review, so it is not a drop-in runtime change.
Deferral remains the execution outcome when no supported image passes qualification.
Owner accepted A after the design comparison; see ADR-0035. Image reconstruction details
and the tested immutable local identity are recorded in the operator README and QA record.

## Deployment and security contract

- Separate local Compose project. qBittorrent uses `network_mode: service:gluetun`;
  it receives no independent networks or ports. No host media or discovery volume is mounted.
- Gluetun alone has egress attachment, root and NET_ADMIN when required. Every additional
  capability needs measured justification; do not inherit #308's DAC_OVERRIDE automatically.
  Client uses a non-root UID, all capabilities dropped, no-new-privileges and read-only root.
- Private WireGuard file is mounted read-only; allowlisted parsing does not execute hooks,
  rewrite the owner's original file or emit its content. Mode 0600, directory 0700.
- IPv6 is disabled initially and tested blocked in all states. DNS uses the VPN namespace;
  neither Docker/host DNS fallback nor broad `FIREWALL_OUTBOUND_SUBNETS` is accepted.
- Control/API traffic uses a fixed local authenticated destination. Initial design has no
  connection to Radarr, Prowlarr or the player. Later wiring needs a narrow ingress review.
  No VPN-side inbound peer port or public admin listener is requested.
- Authentication, CSRF/Host validation and startup logging must be checked for the qualified
  qBittorrent image. A generated plaintext password in startup logs fails acceptance.
- The stable Gluetun image failed qualification. Rebuild its stable source with checked-in
  fixed Go manifests and a supported patched Alpine base, retaining required startup
  dependencies. Pin the tested local Docker image ID; scan that exact ID before startup.
  qBittorrent retains its release tag/manifest digest. Historical #308 digests are reference evidence only.
- The controller selects the reviewed pins of the host architecture: the Compose pins on
  AMD64, the `ARM64_RETRIEVAL_IMAGES` pins on ARM64, refusal on any other architecture. An image
  whose platform differs from the host is refused before its scan. The ARM64 pins are scanned
  artifacts only; their runtime qualification is owner-run and pending.

## Proposed budgets and storage contract

Initial estimates for owner validation: client 1 CPU/768 MiB/128 PIDs; gateway
0.5 CPU/256 MiB/64 PIDs; 64 MiB bounded tmpfs each; three 10 MiB rotated log files
per service. No performance result is implied by these limits.

Use a dedicated quota-backed retrieval filesystem: at most 100 GiB (the provisioning ceiling of #328, sized
for the default cache ceiling of ADR-0044) and a 2 GiB free-space reserve. The provisioner creates the whole
ceiling unless the operator passes a smaller `--size-gib`. The hard ceiling includes client
working files; Docker log/tmp budgets are separate and bounded; client config is stored on
the same filesystem. A normal bind directory and a Docker named volume do not prove a quota.
The controller verifies the actual mounted filesystem and refuses startup if unverifiable.
Creating/resizing a host filesystem is a separate concrete operator action, not implicit
authorization in this document. Fixtures use a much smaller disposable volume.

The retrieval mount never shares a tree with the owner's library: initialization, start and
status refuse a mount equal to, containing or inside `MEDIA_ROOT` (`storage_inside_media_root`),
after resolving symbolic links. The provisioner applies the same check before it creates the image. Both read
`MEDIA_ROOT` from their environment and fail closed: an unset, empty or relative value is
refused (`media_root_undeclared`), a path that is not an existing directory too
(`media_root_not_a_directory`, a mistyped value); a host without a library declares `MEDIA_ROOT=none`.
Emergency stop skips this check, like the free reserve. Nothing but the `retrieval` directory of that mount is writable to the client.

This installation stays empty: startup refuses persisted `BT_backup` content and
authenticated verification requires an empty torrent list. Admission (declared size,
allocated bytes, reservations, free space), eviction and the cache ceiling below the
filesystem size belong to #311 and #437; no transfer is admitted before them.

## Qualification and rollback

Use the [designed cases](../qa/cases/328-nordvpn-retrieval.md), including independent
positive controls around denial assertions. No observed timeout alone proves isolation.
Record source/image digests, tested configuration hash excluding secrets, versions, categorical
outcomes, cleanup and limits. Keep secret values, public egress addresses and raw logs private.

Rollback stops client before gateway, removes only owned containers/networks, preserves
private configuration/data and reports unconfirmed removal. No Docker prune, route rewrite,
credential rotation, transfer deletion or changes to staging/Pi are part of rollback.

## Design review and open gates

Author self-review: requirements map to tests; transport isolation is independent of admission;
no new scheduler or application abstraction; unknown readiness remains #311. Critical risks:
stale namespace after replacement (TC-06), firewall regression (TC-03–05), secret leakage
(TC-01/07) and unenforced quota (TC-08).

Implemented: private initialization, explicit collision-checked bridge, authenticated empty
client, exact image scans, bounded storage provisioning, source tests and targeted operational
checks. Gluetun needs a dedicated writable resolv.conf bind while its root stays read-only;
client reads that same file read-only. UMASK=077 preserves private Qt configuration.

Pending, all owner-run: VPN-process-only termination, outside packet observation, restart
under a transfer (needs #311 admission), staging and ARM64 runtime qualification. A passing
component suite is never a substitute for those runs.

## Primary references checked on 2026-11-15

- [Gluetun namespace sharing](https://github.com/qdm12/gluetun-wiki/blob/main/setup/connect-a-container-to-gluetun.md): service namespace mode.
- [Gluetun WireGuard options](https://github.com/qdm12/gluetun-wiki/blob/main/setup/options/wireguard.md): file configuration and precedence.
- [Gluetun firewall options](https://github.com/qdm12/gluetun-wiki/blob/main/setup/options/firewall.md): outbound exceptions change firewall/routing.
- [Gluetun NordVPN provider](https://github.com/qdm12/gluetun-wiki/blob/main/setup/providers/nordvpn.md): supported protocols and distinct service credentials.
- [Docker Compose services](https://docs.docker.com/reference/compose-file/services/): network mode and effective service limits.

These sources support capability statements, not an unexecuted fail-closed or quota claim.

## Recovery hardening — 2026-11-18

Startup/status validate private real config/download directories on the quota device
and reject nested mounts on the dedicated filesystem. Emergency stop remains independent
of these runtime checks. Effective gateway environment permits the exact Compose policy
plus only the pinned Alpine PATH; extra firewall/routing/DNS settings are refused.
Credential metadata names the operator credential and carries a timezone-aware 90-day
initial expiry. Invalid/missing/expired metadata refuses operation and attempts an owned
ordered stop; it never triggers implicit credential replacement.

## Effective container policy — 2026-11-18

The controller compares runtime bind mounts, permits no extra volumes, and compares all
declared tmpfs paths/options/budgets. Option order and binary size units may differ without
changing the policy; duplicate option keys are refused. The effective entrypoint must match
Compose and the command stays empty. Log driver/rotation and disabled automatic restart
must match. Pure policy helpers are separate from process, HTTP and namespace observations;
no service hierarchy or dependency-injection framework is introduced for this local tool.

The Docker inspection contract is exercised against both immutable images using containers
that remain in `created` state, no network, no pulls and disposable dummy bind files. Each
is removed by its returned ID. These checks are not connected/tunnel-fault acceptance.

References: [Docker HostConfig API](https://docs.docker.com/reference/api/engine/),
[Compose command/entrypoint](https://docs.docker.com/reference/compose-file/services/),
and [tmpfs](https://docs.docker.com/engine/storage/tmpfs/). The pinned gateway image inherits
`/gluetun-entrypoint`, the pinned client `/init`, and neither has an image command.

## Persistent identity — 2026-11-18

The manifest (version 2) records the filesystem UUID rather than a transient `/dev/loopN`
path. Mounted capacity/options, device-root, no-submount and private ownership checks remain
mandatory. A changed loop number with the same UUID is acceptable; a different or missing
UUID refuses operation, and so does any other manifest version: there is no adoption or
migration command. Emergency stop may read a read-only filesystem without the free reserve,
but still requires proven identity and safe mount options. UUID cloning by a privileged
host administrator is outside this local operator trust boundary.

## Frozen ownership selection — 2026-11-18

Before lifecycle mutation, discover both nonce-labelled and Compose-project-labelled
containers and reject inconsistent names/ownership/IDs. A foreign project-labelled member
must not be invisible to startup. Missing Compose labels alone do not prevent emergency
cleanup of a nonce-owned expected-name container. Stop addresses the proved immutable IDs
in client-before-gateway order and requires each returned ID's `Running` state to be false.
Command success alone is insufficient. A disappeared/replaced ID is unconfirmed, never a
reason to switch to the replacement's name. Removal re-inspects ownership/stopped state,
uses those IDs without force, and does not delete volumes or private state. Compose is used
for startup only; it cannot broaden stop/removal to a different label-selected set.

## Guarded fault executors — 2026-11-18

Two owner-run executors replay the bounded fault experiments on the empty installation:
`scripts/retrieval_fault.py` (R328-F01, one abrupt owned gateway exit) and
`scripts/retrieval_f02.py` with `scripts/retrieval-f02-rule.sh` (R328-F02, interruption of
the owned VPN endpoint only). Both default to a no-action plan. Active execution requires
clean committed source, a private owner-confirmed exact-card scope (`data/local-retrieval/fault-scope.json`, git-ignored) and an explicit execution
flag; no scope is authored or widened by the executor, and an agent never runs them.
Each campaign reuses production ownership validation with a bounded process reader, freezes
the owned IDs, observes three negative samples between positive controls, then attempts one
production recovery. Timeouts/interruption trigger a bounded best-effort owned stop, with
unconfirmed cleanup red. The 300-second window reserves 60 seconds for that fallback. No
public acquisition, host-route change or Pi action is included. Bounded probes are not
outside-packet-canary proof, and unit tests of an executor do not establish live acceptance.
