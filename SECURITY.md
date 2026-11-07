# Security

## Reporting

Open a private security advisory on GitHub (Security → Advisories → Report a
vulnerability). Do not open a public issue for a vulnerability.

## What is scanned in CI

| Tool              | Scope                                           | Blocking |
| ----------------- | ----------------------------------------------- | -------- |
| Gitleaks          | Secrets, full history, every push + weekly      | yes      |
| CodeQL            | SAST on JavaScript/TypeScript                   | yes      |
| Dependency review | New CVEs introduced by dependency changes (PRs) | yes      |
| OSSF Scorecard    | Repository hygiene                              | no       |
| Hadolint          | Dockerfile lint (`make lint-docker`)            | yes      |
| Trivy config      | Dockerfile misconfigurations                    | yes      |
| Trivy image       | HIGH/CRITICAL CVEs, fixed or not, in the image  | yes      |
| SonarQube         | Quality gate + coverage (local, pre-merge)      | yes      |

Accepted Trivy findings live in `.trivyignore.yaml`, each scoped (`paths`), time-boxed
(`expired_at`) and justified (`statement`); OS packages are scoped by `purls`, as they have no
file path. The current entries are unfixed HIGH CVEs in Debian 13 base packages outside the
media path (#110). The image scan runs without `--ignore-unfixed` (audit SA-03), so a new
unfixed CVE fails it until fixed or accepted here; the entries expire for a re-check (#116).

FFmpeg and ffprobe are a static upstream build (`mwader/static-ffmpeg`, pinned by tag and
digest in the `Dockerfile`, bumped by Dependabot), not Debian packages: Debian's FFmpeg
carried unfixed decoder CVEs on both Debian 12 and 13 (#110). Trivy cannot see a static
binary nor the ~50 libraries it links statically (dav1d, libvpx, libass, libxml2, openssl…),
so they are tracked by hand (#116): on each bump, check the FFmpeg security page and the
upstream `wader/static-ffmpeg` commit log for library updates. The build fails if the binary
drifts from the pinned version. Accepted risk: a library fix reaches the image only when a
new versioned tag is cut and pinned here.

Not scanned: third-party images referenced from `docker-compose.yml` (reviewed by hand on
Dependabot bumps).

## Runtime posture

- The container runs as a numeric non-root user with a `HEALTHCHECK` on `GET /health`.
- Secrets (TMDB key) come from environment variables only; `.env*` files are gitignored.
- Media paths are resolved under `MEDIA_ROOT` and validated against path traversal before
  any file is served or handed to FFmpeg.
