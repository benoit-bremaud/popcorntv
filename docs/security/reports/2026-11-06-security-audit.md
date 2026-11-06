# Security audit — 2026-11-06

Full security audit of PopCornTV before the homelab exposure (#60), issue #109: no Critical or High finding in the application code; one container finding (unfixed CVEs in the Debian 12 FFmpeg stack) to settle before #60.

## Scope and method

Method B of the MCDA in #109 (445 / 500): a white-box review plus pentest-kit cards on a local production build.

- **Audited commit**: `30a3b86` (`main` after #74). The local image was built from `241d868` (before #74); #74 changes only playback session code, reviewed in the white-box pass, not the image layers.

- **White-box review** against the `security-policy` skill (OWASP Top 10:2025, ASVS 5.0) of `apps/server` (auth, sessions, CSRF, access hook, path guards, playback, FFmpeg arguments, subtitles, metadata, rate limit, logging) and `apps/web` (XSS sinks, tokens, browser storage).
- **Container** against `docker-hardening`: Dockerfile, `docker-compose.yml`, `.dockerignore`.
- **CI** against `security-ci-baseline`: the six workflows under `.github/workflows/`.
- **Tools**: `pnpm audit --prod`, gitleaks (full history), Hadolint, Trivy image and config. Semgrep: not run (no local target, SA-01).
- **pentest-kit cards** on the local production image (`docker compose up`, loopback only), scope `docs/security/scope.yaml` (gitignored, loopback targets only, expires 2026-11-20): SECRETS, CONTAINER, WEB-APP.

Out of scope: the homelab host, its network and the reverse proxy, none of which exist yet. Run EXT-EXPO, EXT-APP and the machine cards listed below after #60.

Not run: OSINT (the repository is public by design and gitleaks covers its history); ACCESS-ADMIN, TAILNET, PRIVESC, SSH, VULN, HARDEN-OS, RESOURCE, BACKUP-RESTORE (they need the homelab machine, after #60); LAN-SURFACE, LATERAL, DISCOVERY, MITM, MQTT, IOT, RADIO, PHYSICAL, RESILIENCE (not applicable to a single local container).

## Tests run

| Card | Risk | Result |
|---|---|---|
| SECRETS | read-only | gitleaks: 66 commits, no leak. trufflehog blocked by the scope guard (repository path is not a scope target); gitleaks covers it. |
| CONTAINER | active | Runs as UID 1000, not privileged, no added capability, healthy. Trivy config: clean. Trivy image: finding SA-03. |
| WEB-APP | active | Every non-public route answers 401 without a session (libraries, profiles, events, media file, artwork); encoded and raw `../` traversal answers 401 (the access hook stops it before the path guard, which the code review covers); cross-site POST answers 403; oversized header answers 431; 320 requests in a burst on an authenticated route give 28 × 429. Headers: `nosniff`, `Referrer-Policy: no-referrer`; no CSP (#46). |
| Code review | read-only | Passes listed below, #74 slot take-over included; findings SA-01, SA-02. |

## Findings

| ID | Severity | Priority before #60 | Issue | Summary |
|---|---|---|---|---|
| SA-03 | High | Must (scheduled before #60) | #110 | The runtime image (Debian 12, FFmpeg 5.1) ships 4 Critical and about 200 High CVEs with no fix available; CI hides them with `--ignore-unfixed`. FFmpeg parses media files, so the decoder CVEs are reachable. |
| SA-01 | Low | Should | #111 | No local `make sast` Semgrep target (skill `semgrep-sast`); CodeQL is the CI SAST of record on this public repository, so only the fast local first line is missing. |
| SA-02 | Low | Nice | #112 | `docker-compose.yml` lacks `no-new-privileges`, `cap_drop: [ALL]` and a read-only root file system. |
| SA-04 | Low | Nice | #114 | HLS and subtitle extraction hand the checked path to FFmpeg, which opens it later without `O_NOFOLLOW`: a writer on the media share could swap in a symlink in that window. The read-only media mount limits it (found by the Codex review of #113). |

### Known issues re-rated

| Issue | Priority before #60 | Note |
|---|---|---|
| #46 CSP | Should, done in #60 | First step of #60 in Caddy; the probe confirms no CSP or `frame-ancestors` today. |
| #86 password change after revocation | Should | Session hygiene after a compromise. |
| #87 tokens in the address bar | Should | One-time links limit the impact. |
| #89 client IP retention in logs | Should | GDPR data minimisation. |
| #88, #90, #91, #92, #93, #98, #105 | Nice | Residual timing gap, audit completeness, error shape, version on `/health`, artwork names are 64-hex digests, dev-only advisories (`pnpm audit --prod` is clean), test fixture. |

## Controls that passed

- argon2id hashing behind a concurrency cap; zod length caps on auth inputs.
- `__Host-` session cookie, `HttpOnly`, `SameSite=Lax`, `Secure` on https; CSRF by `Origin` and `Sec-Fetch-Site`.
- The access hook fails closed; owner routes check the role; profile, progress and playback routes check ownership.
- `confinedPath` resolves with `realpath` on every request; direct play then opens the file with `O_NOFOLLOW` (HLS and subtitles do not: SA-04); segment names are pattern-checked.
- FFmpeg runs through `spawn` with an argument array, the input behind `-i`; the session cap is reserved before the first await.
- The error handler logs only 5xx errors and never echoes them (`app.ts`).
- The TMDB key travels in the `Authorization` header only, never in an error (`tmdb-client.ts`).
- #74 slot take-over: a viewer only takes over their own session, an owner their own, else a viewer's, never another owner's; the role comes from the server-side caller, and `ownedBy` still guards every session route.
- No `dangerouslySetInnerHTML`, `innerHTML` or `eval` in the web app; `localStorage` holds the profile id only.
- Base image pinned by tag and digest, non-root, HEALTHCHECK, tini, complete `.dockerignore`; compose binds loopback and mounts media read-only.
- Every workflow action pinned by SHA, `contents: read` by default; CodeQL, Gitleaks, dependency review, Hadolint, Trivy, Scorecard and Dependabot in place.

## Next steps

1. Fix SA-03 before #60 (move the runtime to a base with a maintained FFmpeg, then drop or scope `--ignore-unfixed`).
2. Ship #46 as the first step of #60.
3. Schedule SA-01, #86, #87, #89 next; the Nice items stay in the backlog.
4. After #60, run the exposure and host cards against the homelab with a new scope.
