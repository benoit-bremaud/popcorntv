# Test cases — empty local discovery services

These cases derive from the owner-approved REQ-34–37 contract; dated evidence below distinguishes executed private acceptance from pending cases.

| ID | Technique | Requirement | Scenario | Expected result | Level |
|---|---|---|---|---|---|
| TC-01 | Happy path | REQ-34 | Fresh private directories and pinned images | Both authenticated APIs live; no indexers, movies, lists or download clients | Real-container integration |
| TC-02 | Boundary / permissions | REQ-35 | Foreign owner, symlink, occupied ports or overlapping subnet | Refuse before mutating existing state/network | Initializer integration |
| TC-03 | Restart transition | REQ-34–35 | Stop/start each service with its own persistent config | Credentials/state persist, permissions stay private, liveness returns | Real-container integration |
| TC-04 | Auth / egress | REQ-35, REQ-37 | First-start auth failure, missing/wrong credentials; external TCP/DNS | No published port before auth proof; failure leaves ports unpublished; protected API access/egress denied, no secret logs | Real-container integration |
| TC-05 | Resource limits | REQ-34 | Inspect identity/capabilities, memory/CPU/PIDs, tmpfs and rotation | Actual constraints match configuration; no root or privileged fallback | Real-container inspection |
| TC-06 | Empty-state invariant | REQ-36–37 | Fresh boot, bootstrap rerun/restart, then deliberate owner config edit | Initially RSS zero and no lists/search/indexers/clients; edited state is refused without resetting it | Authenticated config integration |
| TC-07 | Sad path | REQ-34–35 | Service outage, corrupt config or unwritable state | Sanitized failure, no destructive reset, other service retained | Controlled disposable state |
| TC-08 | Uncertain write | REQ-36 | Configuration accepted but response lost | Read exact current config before retry; no blind duplicate setup | HTTP-boundary integration |
| TC-09 | Source isolation | REQ-37 | Separate disposable stack with two local Torznab fixtures, one unavailable | Healthy synthetic results remain usable; persistent empty stack unchanged, no shared network/config/keys or external query | Approved fixture-only wiring |
| TC-10 | Cleanup boundary | REQ-34–35 | Failed fixture run and existing operator install | Remove only positively identified owned fixture resources | Initializer/cleanup integration |

TC-09 proves only the configured service boundary, not #310's scheduler/finality/backoff.
Resource use and image scan reports must identify exact versions/digests. Tests must preserve
original failures and use the signed local gate before PR merge; no hosted checks are added.

## Component evidence — 2026-11-14

Commit `2e744ba` contains 49 passing pytest cases in
`scripts/tests/test_discovery.py`. Ruff check/format and strict mypy passed for the
controller and this suite. These are unit and HTTP/filesystem integration results,
not real-container acceptance of TC-01, TC-03, TC-04 or TC-05.

Covered regression boundaries include private state and identity validation,
accepted-but-lost configuration responses, administrative authentication failure,
read-only refusal of owner drift on a complete startup rerun, foreign container
labels and mounts before any up/stop/down, recognized owned port bindings,
emergency CLI stop with expired credentials, local recording proxy containment,
image-scan refusal before startup, and real SIGTERM during substituted publication
with withdrawal and handler restoration. No test uses real indexers or media.

Independent read-only runtime and test-quality verification found Must 0 / Should 0
on this component boundary. Full suite execution remains separate from the signed
local CI gate. Real image startup, network canary positive controls, resource
inspection, restart persistence and fixture-only Torznab behavior remain pending
#343. No real-container case is marked passed from a Docker command double.


## Private runtime evidence — 2026-11-15

The reproducible command `mise x -- uv run --frozen --group ci python
scripts/check_python_tests.py -q scripts/tests/test_discovery_runtime.py` passed
one journey in 33.53 seconds after the cleanup/limits review fixes. It uses a
separate temporary project/state and removes only positively identified owned
resources. It does not publish host ports or configure sources.

- Final local Radarr image ID:
  `sha256:4fd9fc5ba9b271794a0d743b5baa6c5f535d5c569857e51661cc4a07a336fd4f`;
  version `7.0.3.10912-popcorntv-local`, official source
  `af772b051ac27a0615c7f8b7f78622b6dc183be0`, ImageSharp 3.2.0.
- Prowlarr manifest:
  `sha256:8548e568b1a16456fd72e1374ad8aae69690af146ddf6255696f287455436704`.
- Actual image-ID scans passed the HIGH/CRITICAL policy before each startup.
- Both services became healthy; empty state, RSS policy, administrative login,
  missing/wrong API credentials and invalid UI cookies were verified.
- Both run as UID/GID 1000, with effective/bounding capabilities zero,
  `NoNewPrivs=1`, read-only root, one CPU and 128 PIDs. Effective memory limits
  are 256 MiB / 512 MiB; no OOM was reported. Actual tmpfs ownership/modes,
  32 MiB noexec `/tmp`, 16 MiB executable `/run`, nosuid/nodev and JSON log
  rotation (2 MiB, three files) were checked from Docker inspect.
- TCP and DNS probes from each isolated service failed with unchanged canary
  counters. Same-image probes outside isolation succeeded before and afterward,
  increasing the respective local canary counters. No external provider was used.
- Stop/start preserved credential bytes and authenticated empty settings.
- The original failed evidence is retained: missing Mono reflection assembly
  and the initially incorrect API-cookie assumption. Those failures caused
  withdrawal before any publication; fixes were tested against actual services.

The latest lower-level run passed 74 tests, with 90.71% combined statement/branch
coverage (controller rounded 90%, completeness wrapper 97%). The existing CI
orchestration suite passed 38 tests. The earlier full `just check` passed before
these final runtime/CI additions; it must be rerun on the final change. No signed
full gate, PR merge, Pi deployment or PopcornTV staging deployment is claimed.
TC-09 (two synthetic sources/outage) and actual positive loopback publication
remain pending. Component tests alone do not complete those cases.
