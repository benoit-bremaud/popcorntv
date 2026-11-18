# Full staging QA checklist — PopcornTV

Prepare a full product and security review of the exact production image deployed to staging; this checklist records planned work, not executed results.

## Session identity and entry conditions

- [ ] Record the session date and start/end timestamps with timezone, exact staging URL confirmed by the owner, deployed Git SHA and immutable image digest, comparison base, browser versions and host architecture.
- [ ] Confirm that the application API and static assets belong to the same release, through the real staging Caddy origin. Do not substitute the Vite development server, mocked browser APIs or an application port that bypasses ingress.
- [ ] Link the successful exact-head local gate and verified attestation. This is a prerequisite, not a substitute for deployed-product QA.
- [ ] Record the last full staging report, the later targeted TMDB pass and their open regressions: [2026-11-11 full staging](../architecture/qa/2026-11-11-full-pass-staging.md) and [2026-11-12 TMDB staging](../architecture/qa/2026-11-12-tmdb-pass-staging.md). Historical Pi results are a separate environment.
- [ ] Record the exact generic FULL checklist revision/hash used for the session. Cover every applicable P0, P1 and P2 item, across FON, DAT, UI, A11Y, PERF, SEC, ROB, MOB, USA and PRI. The project cases below supplement that inventory; they do not replace it.
- [ ] Use isolated seeded owner, viewer and second-account/profile fixtures. Account lifecycle, revocation and deletion cases use disposable accounts; preserve the owner's session and data. Keep credentials and redeem/setup links out of reports, screenshots and command history.
- [ ] Prepare an inventory of owned test objects, allowed mutations and cleanup, with a staging data backup and tested recovery procedure before restart/failure exercises. Do not reset an existing volume or delete a library merely to obtain a clean case.
- [ ] Prepare a valid staging TMDB configuration when authorized. A missing key blocks TMDB-dependent cases; do not replace them with an empty-state PASS or use the 2026-11-11 placeholder limitation as the current result.
- [ ] Prepare licensed/synthetic media: direct-play and HLS films, AVI/MOV/M4V/WebM variations, a series with two episodes, original/French audio tracks, French text subtitles, an unplayable/corrupt file and missing artwork. Record expected metadata, durations, languages and paths without copying private library contents.
- [ ] Confirm tools for real offline/throttling, Chromium/Firefox/WebKit, keyboard, accessibility tree, screen reader, responsive sizes, performance traces and access to pass-window server logs. Unavailable tools produce BLOCKED or NOT TESTED rows with an unblocking action.
- [ ] Before any security probe, obtain the owner's confirmed `docs/security/scope.yaml` and read-only test cards for the exact target and seeded identities. This file is currently a prerequisite to establish, not an authorization created by this checklist. Never run an offensive scanner, brute force or a man-in-the-middle tool. Do not follow redirects outside scope or probe a provider host seen in network traffic.
- [ ] Separate ordinary authorized product-fixture writes from security probes. A security case requiring state mutation or an unsupported tool remains BLOCKED under the read-only scope; local automated evidence may be linked separately but cannot turn that staging row into PASS. Do not replay historical rate-limit bursts.

The repository's local staging default is `https://localhost:8443` in
`deploy/staging/compose.yml`; discovering that value does not confirm a target for
a future session. A Pi run requires its own target, ARM64 image and measured
resource qualification. Preparing this checklist authorizes no deployment.

## Scope and availability at the tested SHA

| Surface | What the session must establish |
|---|---|
| Existing media application | Authentication, profiles, libraries, scan/metadata, catalog, direct/HLS playback, subtitles/audio, progress, Discover, wishlist, notifications and owner administration work through staging ingress. |
| Durable preparation requests (#309) | Validate only the merged API/persistence contract available at the deployed SHA, using disposable wishlist fixtures and profile isolation. It does not prove source search, transfer or readiness. |
| Local discovery services (#327) | Execute the separate infrastructure annex only if those services are explicitly included in the approved staging topology. Their local real-container proofs are not deployed-staging results. |
| Unmerged or unfinished work | #328 retrieval/VPN, #310 daily multi-indexer search, #311 bounded cache and #314 A complete-file handoff are BLOCKED until the required implementation and integration are present. Reassess their actual status at the session SHA. |
| Later workflow | Progressive playback/readiness (#312/#313/#314 B), child acquisition policy (#316) and a second backend (#325) are not current delivery claims. Mark absent capabilities N/A with the backlog reference; keep an intended milestone acceptance BLOCKED until its prerequisites exist. |
| Accepted refinements (#352) | Record which local trust assumptions apply. Acceptance of loopback/private HTTP and operator toolchain trust does not authorize public exposure, skip staging checks or claim the refinement implemented. |

## Functional and state-transition cases

For every applicable row, exercise the nominal path, failure path and relevant
boundary values. Expand grouped cases into individual report rows where their
verdicts differ. All execution boxes start unchecked.

| Done | Case | FULL mapping | Steps and observable result |
|---|---|---|---|
| [ ] | STG-01 First-run setup | FON-01/02/07/08, DAT-02 | On a separate empty fixture, create the first owner once; repeated/stale setup is refused. Never reset the primary staging data to reach this state. |
| [ ] | STG-02 Sign-in and sign-out | FON-01/03/10, SEC-12 | Use valid/invalid fixture credentials, sign out, reload and revisit a protected view; feedback is clear and the old session no longer authorizes reads. Security-side checks require the confirmed scope. |
| [ ] | STG-03 Invitation and reset | FON-03/06/08/09, DAT-04 | Issue/redeem/revoke fixture-only links; test used, expired and stale states and two-tab retries. No reusable secret appears in the artifact. |
| [ ] | STG-04 Password/account changes | FON-07/08/09, ROB-05 | Change fixture passwords, revoke fixture devices and remove fixture accounts; verify the specified session effects, cross-tab refresh and denial of subsequent protected reads. |
| [ ] | STG-05 Profiles and isolation | FON-03/04/11, DAT-02 | Create, rename, switch and delete disposable profiles; test limits, duplicate/empty names, Unicode and last-profile behavior. Reload/restart preserves valid state; unavailable browser storage falls back without crashing the picker. |
| [ ] | STG-06 Owner administration | FON-01/07/10/11, USA-04 | Accounts, devices, links and event views show consistent ISO dates/counts, actionable failures and object-specific confirmation. Viewer navigation exposes no owner action. |
| [ ] | STG-07 Library lifecycle | FON-03/04/11, DAT-01/04 | Add/rename/remove fixture library records and scan; reject missing/unreadable roots and overlapping roots without altering the previous valid state. Media remain read-only. Replay the ledger's #163 cases. |
| [ ] | STG-08 Scan and metadata | FON-02/07, DAT-01/02/08 | Scan valid, duplicate, renamed and unreadable fixture files; empty/offline mounts do not prune valid rows. Verify film/series identity, TMDB overrides and explain unmatched/synopsis gaps. |
| [ ] | STG-09 Scheduled processing | FON-06/08, DAT-08, ROB-07 | Observe configured scan and wishlist schedules in logs, disabled intervals, overlap refusal and recovery after a failed run. Do not infer a daily acquisition worker from these existing schedules. |
| [ ] | STG-10 Catalog and search | FON-03/04/09/11 | Verify rows, filtering, sort, no-results and large-list states; title/person search, whitespace, Unicode, long input, debounce and late-response ordering. |
| [ ] | STG-11 Detail and navigation layers | FON-08/09 | Catalog → detail → player → Back twice, Escape, close/reopen, rapid Back/Forward and reload mid-flow leave the correct layer and focus. Replay #169 and title action cases. |
| [ ] | STG-12 Direct playback | FON-01/02/08, DAT-01 | Play a compatible fixture, pause, seek near start/middle/end, request valid/invalid ranges and resume. Browser Network confirms the expected direct media path and clean failures. |
| [ ] | STG-13 HLS playback | FON-01/02/08, ROB-03/05 | Force a documented transcode fixture; verify playlist/segments, keyframe-adjusted resume, early/late seeks, unsupported input, concurrency limits, owner/viewer isolation and cleanup after closing/restarting. |
| [ ] | STG-14 Audio and subtitles | FON-03/07/08 | Select available audio/text subtitle tracks, switch/off/reopen and resume in direct and HLS modes; verify language labels, timing and refusal of absent/invalid indices. Missing fixtures are BLOCKED, not PASS. |
| [ ] | STG-15 Progress and watched state | FON-08/09/11, DAT-02/04 | Resume/start over, close detail immediately after player, toggle watched twice and switch profiles. Delayed/out-of-order answers preserve the newest state and isolation; failed writes show an error. |
| [ ] | STG-16 Next episode | FON-01/07/08 | On a populated series fixture, next-episode navigation, final episode, resume and watched state target the correct episode; an empty library cannot satisfy this case. |
| [ ] | STG-17 Discover and providers | FON-02/04/09, UI-05 | Verify fresh rows, live search, title sheets and cast with real authorized staging TMDB, no-offer/no-result states, provider preferences and recovery after provider unavailability. |
| [ ] | STG-18 Wishlist and notifications | FON-07/08/09/11, DAT-02/04/08 | Add/remove fixture interests, establish the notification baseline, make a controlled library match and observe one notification, read status, profile privacy and playback handoff. Existing provider notifications do not prove completed acquisition. |
| [ ] | STG-19 Personal title links | FON-03/07/11, PRI-01 | Owner sets/edits/removes a fixture link, viewer sees only allowed actions; URL policy is enforced, opener/referrer protections hold and the server does not fetch the link. |
| [ ] | STG-20 Preparation request persistence | FON-07/08/09, DAT-02/04 | For #309, repeat an owned wishlist addition/removal and restart. Compare identity/lifetime invariants using approved read-only fixture-state inspection when the public API exposes no request ID; report counts/equality, not private subscriber details. Another account cannot infer interests. No transfer/readiness claim without its adapters. |
| [ ] | STG-21 Global input sweep | FON-03/04/05/06/07/09/10/17, DAT-03 | Inventory every visible form and relevant API field; cover min−1/min/max/max+1, empty/null/wrong type, zero/negative/large values, enums/unknown fields, Unicode/RTL/paste, dates/timezones where applicable, stale variants and conflicting sources. Record absent money/date controls as N/A rather than inventing features. |
| [ ] | STG-22 Regression replay | FON-12, UI-07 | Recheck every applicable failed or untested case in both staging baselines and the linked ledger sections. Closed issues remain pending replay until observed on this deployed build. |
| [ ] | STG-23 Exploratory charter | FON-13, USA-02 | Write a 30-minute charter first: an impatient new viewer searches, changes profile, opens/closes media and recovers from errors. Keep notes and reproduce each finding. |

## Cross-cutting FULL coverage

| Done | Domain / IDs | Project-specific obligations and expected evidence |
|---|---|---|
| [ ] | DAT-01…07,10,11,13 | Check API schemas/status/content type, persistent state, validation, retry/idempotency, collection bounds/stable order, uniform errors, UTC/Unicode round trips, restart mid-request, documented version/CORS/429 behavior and fixture boot/seed idempotency. Unsupported pagination/versioning is N/A with reason. |
| [ ] | DAT-08 | Observe bounded scan, metadata and notification work, retry/failure recovery and shutdown. Keep unavailable acquisition-worker cases BLOCKED against their milestone. |
| [ ] | DAT-09,14 | Webhooks and paid-provider quota controls are N/A if absent at the deployed SHA; if present, require explicit test-mode configuration and applicable scope, never real spend to reach a limit. |
| [ ] | DAT-12 | Migration up/restore/up and destructive guards run on a restored local data copy before promotion; link that evidence and mark this item N/A (local tier only) for the staging session. Staging restart/persistence still runs under DAT-02. |
| [ ] | UI-01/03/04/05/07/08 | Cover Chromium, Firefox and WebKit; widths 320, 390×844, 768×1024, 1024, 1440×900 plus landscape, 200% text zoom, theme, reduced motion, forced colors and applicable print. Test loading/empty/error/partial/offline/disabled/long-title/missing-art states and 404s; keep comparable screenshots. |
| [ ] | UI-02 | Inspect console and Network after every main journey; explain expected negative-test responses separately. No unexplained error, warning, CSP violation, duplicated request, polling loop or mixed content. |
| [ ] | UI-06 | Verify the supported product language, Unicode/RTL content and local date/number formats. Do not claim multilingual translation coverage for languages the product does not offer. |
| [ ] | A11Y-01…14 | Complete keyboard and screen-reader journeys, landmarks/headings/names, announced errors/status, contrast, target sizes, visible/unobscured focus, drag alternatives, password-manager/paste support, help/redundant entry, Easy Checks and axe plus tree inspection; reflow at 320px/400% zoom, text spacing, motion/orientation/time limits. Automated axe alone is insufficient. |
| [ ] | PERF-01 | On staging with a documented mobile CPU/network profile, measure LCP ≤2.5s, CLS ≤0.1 and interaction latency ≤200ms using a trace. Record Lighthouse TBT separately; do not report it as measured INP or a field p75 result. |
| [ ] | PERF-02/03/05/07 | Record bundle/compression/cache behavior, normal route timing and p95 over an agreed bounded sample, query/payload cost, repeated screen/player open-close memory and worker/concurrency behavior. Record missing project budgets as unresolved criteria, not invented PASS thresholds. |
| [ ] | PERF-04 | Load at 1×/5× belongs to the local L3 job, not this staging session: N/A (local tier only), link separate evidence if available. No load generator runs against staging. |
| [ ] | ROB-01/02 | Cut/slow the browser network and temporarily stop only the approved staging backend; exercise search, watched/progress writes and play. Errors are actionable, saved state survives and recovery requires no reload loop. |
| [ ] | ROB-03/04/05/08/10/12 | Using approved disposable staging fixtures: restart during playback/processing, invalid configuration in a separate fixture, two tabs/users, clean-install evidence, feature enable/disable with old/new data and cold-cache/dependency latency. Record any fault injection not permitted by the session as BLOCKED. |
| [ ] | ROB-06/09 | Malformed media/parser inputs, disk pressure, clock skew, read-only storage and low memory require bounded disposable fixtures and pre-agreed recovery. Never fill a shared host disk, change the host clock or corrupt the primary staging volume. Unsupported safe isolation is BLOCKED. |
| [ ] | ROB-07/13/14 | Review application and framework logs for the complete product/security window: structured events, safe correlation IDs, no query/credential leakage, expected failures explained and no unhandled exception. Missing logs leave ROB-13 BLOCKED. |
| [ ] | USA-01…06 | Record Nielsen heuristic observations, first-use task completion, actionable messages, confirmation/undo for fixture-only destructive actions, immediate feedback/progress and consistent labels/layout/links. |
| [ ] | PRI-01/02/03/05/07 | Inspect cookies/storage/URLs/logs and all observed outbound hosts; no secret/personal data leak, no undisclosed tracker, necessary data only, declared retention and working autofill/referrer protections. Consent controls are N/A only when no non-essential tracking exists. |
| [ ] | PRI-04 | On disposable accounts only, check implemented account deletion effects and documented export/backup behavior. A missing promised export/deletion capability is a finding, not automatic N/A. |
| [ ] | PRI-08 | Retention time-travel/purge proof runs on the local tier with isolated data. Mark N/A (local tier only) in staging and link separate evidence; do not alter the host clock. |
| [ ] | MOB-01…14 and native-only checks | N/A: this is a web application, not a native release. Mobile browsers, touch controls, viewport, orientation and accessibility remain covered by UI/A11Y, not waived with the native domain. |
| [ ] | CLI/library/firmware-only checks | FON-14/15/16, UI-09, A11Y-15, PERF-06/08/09, ROB-11, USA-07 and PRI-06 are N/A to the deployed W/A product unless the session explicitly includes such a deliverable. The discovery CLI annex has its own applicability. |

## Security cards and local-boundary annex

All security execution is gated by the confirmed read-only scope and seeded
identities. List a separate verdict for each applicable SEC ID; grouping below
is preparation shorthand, never permission for a scanner or mutation.

| Done | IDs | Planned verification |
|---|---|---|
| [ ] | SEC-01 | Read headers through real ingress for HTML, API and media; compare CSP, cache, framing, MIME, referrer, permissions and transport requirements with the deployed specification. |
| [ ] | SEC-02 | Inspect fixture cookies and browser storage: HttpOnly, Secure on the HTTPS origin, SameSite, path/domain policy and bounded server-side lifetime. |
| [ ] | SEC-03 | Use approved non-mutating cards for foreign/null Origin and preflight behavior; websocket checks are N/A if no websocket endpoint exists. |
| [ ] | SEC-04 | Use approved read-only reflected/rendering fixtures to check encoding/CSP; any persistence-based injection test remains BLOCKED under the read-only security policy. |
| [ ] | SEC-05/11 | Read protected resources without a session, as a viewer and with another seeded account's or a nonexistent identifier; status/body reveal no foreign data or owner capability. Never exercise an unauthorized write to prove denial. |
| [ ] | SEC-06 | Validate the agreed read-only boundary/error cases; unsupported mutating payload tests stay BLOCKED with local automated evidence listed separately. |
| [ ] | SEC-07 | Inspect documented limits, headers and existing isolated local regression evidence. No brute force or rate-limit burst is authorized; if staging cannot prove throttling within its read-only cards, mark BLOCKED rather than repeat the historical 320/3050-call runs. |
| [ ] | SEC-08/09/10 | Check safe error/status metadata, bundle/source-map exposure and observed outbound hosts. Record status/size only for sensitive-path cards; do not collect secret file bodies or probe third parties. |
| [ ] | SEC-12 | Use product-session transitions on disposable fixtures, then approved protected reads to confirm invalidation; preserve the real owner's session. Record any unsupported security-specific mutation as BLOCKED. |
| [ ] | SEC-13/15/17/19 | Follow only approved read-only cards for path/query/template input, state/authorization boundaries, sensitive-path status and verb/unknown-route handling. Do not expand payloads or follow an out-of-scope redirect. |
| [ ] | SEC-18 | Link the exact deployed image's vulnerability/SBOM evidence and approved scoped exceptions. Recheck picomatch proof/expiry (exclusive 2026-12-01) and #352 assumptions; existing acceptance never covers a new finding. |
| [ ] | SEC-14/16/20/21/22 | Upload, OAuth/JWT, native mobile, firmware and LLM cases are N/A only when those features are absent at the deployed SHA. Application opaque setup/redeem tokens remain in the product/session cases. |

If #327 services are deployed as part of this staging session, separately record
their source/image identities and architecture. Replay the applicable
[discovery cases](../architecture/qa/cases/327-local-discovery.md): required auth
from first listen, anonymous initialization denial, empty state, effective
loopback publication, exact owned network membership, retained private state,
expiry refusal, failed-proof withdrawal and owned-stop fallback. Use disposable
configuration for malformed XML, changed ingress, busy ports, unconfirmed stop
and foreign-ownership refusals. Check that a successful Compose command alone
cannot satisfy effective-topology proof.

Read resource limits, non-root UID, capabilities, read-only mounts and logs;
record actual resource usage and architecture. Runtime limits observed on x64
do not qualify the Pi. Egress-denial fixture trials are separate controlled
infrastructure acceptance, never permission to contact a real source, perform a
VPN leak experiment or modify another project's network. Link existing local
evidence separately if the staging session does not include the services.

The first complete-file wishlist → preparation → transfer → ready notification →
playback trial remains [#315 milestone A](https://github.com/benoit-bremaud/popcorntv/issues/315).
It needs integrated #328/#310/#311/#314 A and separately authorized real-service
configuration/writes. Its eventual acceptance includes the required source
quality, original/French audio, French subtitles, complete-file readiness and
per-episode notification behavior. A passing catalog/player FULL session cannot
close it.

Dependency inversion and other source architecture properties require a separate
code review. Successful staging behavior does not certify SOLID conformance;
preserve the architecture refinement findings separately from runtime verdicts.

## Result recording and exit conditions

- [ ] Write the dated session report under `docs/architecture/qa/` with the exact deployed SHA/digest, base, target URL, timestamps, checklist hash and evidence locations. Use a durable report worktree/branch; keep the deployed/main checkout clean.
- [ ] Expand every applicable generic item and project case into report rows with `ID | Domain | Check | Result | Verdict | Evidence | Issues | Shots`. Allowed verdicts: PASS, FAIL, BLOCKED, N/A, NOT TESTED and INCONCLUSIVE. Unavailable functionality/tooling or missing fixtures are never PASS.
- [ ] State all ten domains' applicability. Give every skipped/blocked/not-tested item a reason and the action that would unblock it. A common helper, a local unit test or a previous release's screenshot is not fresh staging evidence.
- [ ] Record expected negative-test errors separately from unexplained console/network/server failures. Read server/container logs for the entire run window before closing the result.
- [ ] File every product defect with a reproducible issue and severity; keep sensitive security details out of the public repository, using redacted private-advisory placeholders and the owner's approved handling process.
- [ ] Update only actually exercised cells in [the coverage ledger](qa-matrix.md) with date, exact SHA, staging environment, verdict and evidence. Preserve historical results and fixed-but-not-replayed failures.
- [ ] Scan the final report, screenshots' accompanying text and changed ledger for secrets before publication; keep raw cookies, tokens, signed links, headers containing credentials and private library data out of artifacts.
- [ ] Keep the overall FULL gate red for any Must failure and explicit for all incomplete coverage. No release/staging attestation on a failed or silently partial session. A local gate note is not a staging QA attestation.
- [ ] Before a staging attestation, verify that the tested deployment SHA still equals `origin/main` and the clean attestation checkout's HEAD. If main or the deployed image moved, deploy the intended target and rerun the required checks; never attest a different build using this session's evidence.
- [ ] Record remaining Should/Nice findings, approved exceptions, cleanup of owned fixture objects, final health, rollback readiness and the exact boundary of any Pi qualification still missing.

**Current execution state: NOT TESTED.** This is the preparation checklist for a
future owner-confirmed staging session, not a report of checks performed today.
