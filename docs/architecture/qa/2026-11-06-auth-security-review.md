# Security review — accounts and secure remote access, #18 R12 (2026-11-06)

Code-level security review of the merged #18 auth feature (lots 1 and 2), the second half
of spec auth R12 next to the QA pass in `2026-11-06-auth.md`.

| Head SHA | Scope | Rubric | Reviewer |
|---|---|---|---|
| 978cabb (`main`) | `apps/server/src/auth/**`, `http.ts`, `app.ts` wiring, ownership checks in profiles / progress / playback (R10), web auth screens | skill `security-policy` (OWASP A01 / A07, ASVS 5.0 V6–V8) | `adversarial-reviewer` · Opus 5.5, fresh context, read-only, reproductions with `tsx` against `buildApp` |

Verdict on 978cabb: 1 Must, 3 Should, 5 Nice, 4 Disagree (intentional), plus 2 out of scope.

## Findings and outcome

| # | Severity | Finding | Outcome |
|---|---|---|---|
| S1 | Must | Invitation and reset links outlive the owner who issued them: a demoted then deleted owner redeemed a reset for another owner (`200`, her sessions ended) and an owner invitation (`200`), breaking R2 | Fixed: demoting or deleting an owner revokes every pending link (MCDA M1-B 440/500 against an `issued_by` column 420/500), UC17 updated, route tests for both paths and for the viewer case that keeps links |
| S2 | Should | A password change left the account's pending reset link valid (24 h account takeover from a leaked link) | Fixed: UC19 revokes it in the same transaction; route test |
| S3 | Should | `TRUST_PROXY=1` trusted any socket peer: 40 sign-ins with a rotating `X-Forwarded-For` straight to Fastify never hit `429`; unset behind Caddy, every client shares one address | Fixed: `TRUST_PROXY` is now the proxy's addresses or CIDRs passed to Fastify, `1` / `true` / malformed refuse to start, a warning when `PUBLIC_URL` is https without it (MCDA M2-A 430/500); spec §5, deployment diagram, README, `.env.example` updated; config and route tests |
| S4 | Should | `username_tried` could store a password typed into the username field (90 days, shown to owners) | Fixed: recorded only when it names an existing account; R9 updated; route tests |
| N1 | Nice | `rotate` does not check the session is still live | #86 |
| N2 | Nice | No `Cache-Control: no-store` on auth JSON | Fixed with QA finding 1 |
| N3 | Nice | Link tokens stay in the address bar and history | #87 |
| N4 | Nice | Lazy dummy hash: one-shot timing difference | #88 |
| N5 | Nice | Client IPs in request logs without retention | #89 |
| O1 | Out of scope | Limiter windows grow without bound under many addresses | Comment on #72 |
| O2 | Out of scope | Authenticated artwork served `public` | #93 |

Disagree (held as designed): unsafe requests with neither `Origin` nor `Sec-Fetch-Site`
pass (R7, `SameSite=Lax` backstop); the setup link in the log (UC11, ADR-0010 §4); no
per-account cap across addresses (R8; per-token cap is #81); `409 username_taken` on redeem
(UC12, needs a valid invitation).

Checked clean: session fixation and rotation, cookie flags, CSRF ordering and HEAD
inheritance, right-most `X-Forwarded-For` hop, limiter reservation and refund, no
enumeration, single-use tokens under concurrency, last-owner invariant, role propagation
per request, IDOR on every `:id` (R10), no secrets in logs or error bodies, no open
redirect or raw HTML in the web.
