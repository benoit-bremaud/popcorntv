# Test cases — persistent VPN retrieval

These cases define #328 acceptance; the dated QA record separates executed empty-operation checks from pending fault/transfer coverage.

Source: [specification](../../specs/nordvpn-retrieval.md), REQ-38–42, UC34.
Test the operator implementation at its cheapest effective level, then validate actual Docker
namespaces/firewall and filesystem behavior using disposable owned fixtures. Mock only external
process/network/clock boundaries in component tests. Never substitute component coverage for
real tunnel or disk-quota evidence.

| ID | Requirement | Happy path, failure and edge checks | Evidence required |
|---|---|---|---|
| TC-01 | REQ-39 | Valid private file; missing/malformed/unsafe-mode/symlink file; foreign config; preexisting admin; crash during initialization | Categorical refusal, unchanged original bytes, no Docker mutation on preflight refusal, atomic owned initialization |
| TC-02 | REQ-38/39 | Connected startup; unavailable tunnel; client present before gateway health; anonymous/invalid/valid authentication | Exact namespace identity, bounded refusal, no anonymous first listen, fixed loopback binding |
| TC-03 | REQ-38/41 | Controlled tunnel stop during synthetic transfer; direct IPv4, UDP/TCP DNS and IPv6 probes | Owned outside-tunnel canary receives no client payload, client probes fail, independent same-path positive controls pass before/after |
| TC-04 | REQ-38/41 | Unexpected VPN process termination and gateway container stop while client is running | Repeated real-client probes remain blocked throughout failure, process/namespace states recorded |
| TC-05 | REQ-38/41 | Blackhole only the owned VPN endpoint without host-route changes; restore endpoint | No fallback while stalled, bounded health transition, recovered address differs from host baseline, DNS rechecked |
| TC-06 | REQ-41/42 | Client restart, gateway restart, gateway recreation, controller interruption between steps | Client recreated against new namespace identity; preserved synthetic transfer identity/bytes; no duplicate submission; admission disabled until reverified |
| TC-07 | REQ-39 | Scan rendered config, argv, environment, startup/failure logs and exported report using known canary secrets | No canary secret or session cookie; anonymous API/CSRF/Host denial; categorical failure without raw upstream output |
| TC-08 | REQ-40 | Verified quota, missing quota, one-byte boundary, concurrent reservation, quota exhaustion and low free space | Actual enforced ceiling, no write outside retrieval root, no library mount, no eviction, new admission refused |
| TC-09 | REQ-38/40 | Inspect effective UID/capabilities/rootfs/networks/ports/limits; mutate each expected property | Runtime refuses drift, no independent client network, bounded resources, current image scans and immutable pins |
| TC-10 | REQ-41/42 | Repeated start/status/stop, foreign resource names, cleanup timeout, failed ownership check | Only owned resources changed, all removals attempted, failure retained and private state preserved |
| TC-11 | REQ-40, REQ-51 | Mount outside, equal to, containing and inside `MEDIA_ROOT`; unset, empty and relative variable, mistyped or non-directory path, explicit `none`; image of 3, 100 and 101 GiB, 2 GiB and non-integer size; host without the size plus reserve | `storage_inside_media_root`, `media_root_undeclared` or `media_root_not_a_directory` before any Docker call or image creation, explicit stop still usable; `storage_image_size_out_of_bounds`; nothing created on refusal |
| TC-12 | REQ-38, NFR-17 | AMD64, ARM64 and another host architecture; image of the other platform; removed operations (`migrate`, saved-transfer preflight) on the command line | Architecture-specific pins selected, `retrieval_architecture_unqualified` and `retrieval_image_platform` refusals, usage error for a removed operation; fixtures only, no network |

Live tests require reviewed images, the owner-selected local secret path and an approved owned
fixture scope. Packet-loss rules are confined to disposable owned namespaces; no host routing,
third-party endpoint attack or production transfer is involved. A missing positive control,
unobserved namespace, skipped failure phase or unverified quota is incomplete evidence.

Budget measurements and sustained throughput are future qualification, not a promised result.
Real tunnel, real VPN file and staging runs are owner-run (NFR-17).

## Execution status — 2026-11-26

See [the QA record](../2026-11-26-issue-328-local-retrieval.md): the runtime rows below are
the November 2026 measurements on the earlier branches, not repeated on this head.

| Case | Evidence | Remaining acceptance |
|---|---|---|
| TC-01 | Component/CLI refusals; real private initialization (November) | Full runtime crash-at-each-write journey |
| TC-02 | Authenticated startup, anonymous API denial, no host port (November) | More unavailable-tunnel startup variants |
| TC-03 | IPv4/DNS/IPv6 denied after gateway stop, positive controls bracket denial (November) | Tunnel-only controlled stop while the gateway stays alive |
| TC-04 | Empty client stays alive during controlled stop and abrupt exit, R328-F01 (November) | Tunnel-only failure and staging qualification |
| TC-05 | R328-F02 owned-endpoint interruption and same-generation recovery (November) | Outside packet observation and staging qualification |
| TC-06 | Ordered empty restart/recreation and repeated verification (November) | Transfer identity/bytes under restart, with #311 and #437 |
| TC-07 | Log secret audit, private source unchanged, empty authenticated API (November) | Wider malformed startup/log variants |
| TC-08 | Bounded mounted filesystem, physical reservation, R328-F03 reserve and `ENOSPC` (November) | #311 admission reservations |
| TC-09 | Image scans, namespace, DNS/IPv6 and effective limits (November); component drift refusals | Broader runtime drift acceptance |
| TC-10 | Ordered stop/recreation (November); component cleanup failures | Real daemon cleanup failure injection |
| TC-11 | Component tests on this branch | Owner-run start with `MEDIA_ROOT` declared |
| TC-12 | Component tests on this branch | ARM64 runtime qualification |

## Component regressions kept from November

- **Lifecycle (TC-01/07/10):** timezone-aware credential metadata with a 90-day expiry;
  expired, malformed or missing metadata; missing password, WireGuard or client files. Start
  and status refuse and attempt an owned client-before-gateway stop; explicit stop stays usable.
- **Effective policy (TC-09/10):** extra volume, tmpfs size/options/path, logging, entrypoint,
  command and restart drift on both services refuse before authentication or egress. Equivalent
  tmpfs units and reordered options are accepted; duplicate option keys are refused. The
  `retrieval-contract` suite checks real Docker inspect semantics without starting a container.
- **Storage identity (TC-01/06/08/10):** the filesystem UUID persists across loop-device
  reassignment; a changed or missing UUID, or another manifest version, is refused. There is no
  migration path.
- **Ownership selectors (TC-09/10):** custom-only owned containers stop by inspected IDs; a
  Compose-only foreign member refuses mutation; a successful stop command with `Running=true`
  stays failed.
- **Fault executors (TC-04/05):** missing, invalid, expired or widened scope refuses before any
  process; failed positive controls, unknown fault state, leaked responses, time-budget
  exhaustion, cancellation, uncertain kill, recovery-generation mismatch and unconfirmed
  cleanup stay red. F02 proves per-rule packet counters and exact rule removal.
