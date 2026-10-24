# Local review — popcorntv (#10 profiles)

- Date: 2026-10-24
- Commit: 391131a + focus / cancel fixes (head of `feat/10-profiles`)
- Scope: branch diff `origin/main...HEAD`
- Checks run: design · docs · tests · security · correctness · QA pass
- Verdict: ship — every Must and Should of this diff fixed · Must 0 · Should 0 open · Nice 6 deferred

## Pre-merge gate

| Step        | Result                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Tests     | ✅ 19 shared · 296 server · 123 web (no E2E suite yet)                                                                                                          |
| 2 Coverage  | server 98.1 % stmts / 95.4 % branches / 95.0 % funcs / 98.2 % lines · web 99.8 / 93.2 / 100 / 100 · shared 87.1 % · docs ≈ 96 % (doc-auditor estimate)        |
| 3 SonarQube | ✅ PASSED (new coverage 95.2 %, 0 new issues after fixing S7754 / S1874)                                                                                        |
| 4 Secrets   | ✅ gitleaks clean (`origin/main..HEAD`) · only `.env.example` tracked · diff read: nothing sensitive                                                             |
| 5 QA pass   | ✅ pass · 0 Must · SEC-01 ❌ pre-existing (#31) · report: [qa/2026-10-24-profiles.md](qa/2026-10-24-profiles.md)                                                 |

- Gate: **GREEN** (step 1 and 3 re-run on the final head before push).

## 🔴 Must Have

- `packages/shared/src/playback.ts:114`, `specs/resume-playback.md:69,77`, `diagrams/playback/03-component.md:91` `[docs]` · stale `/progress` routes · fixed.
- `decisions/0008-profiles.md` `[docs]` · MCDA totals and sensitivity figures miscomputed (winners unchanged; §2 and §3 sensitivity flips now disclosed) · fixed.

## 🟡 Should Have (all fixed)

- `playback/PlayerDialog.tsx` `[design]` · `playbackApi` factory + `useMemo` → plain `profileId` prop.
- `profiles/repository.ts` `[correctness|docs]` · unique-index race → `profile_name_taken`; refusals documented.
- `App.tsx` `[correctness]` · only the latest `GET /profiles` sets the list.
- `api.ts` `[correctness]` · non-API error bodies no longer typed as `ApiErrorCode`; "refused" message.
- tests `[tests]` · route-level two-profile isolation, cascade via `remove`, status codes, rename refusal, delete success, unique backstop.
- `profiles/ManageProfiles.tsx`, `ProfilePicker.tsx` `[qa]` · focus moved to the view heading; delete confirm cancellable.

## 🔵 Nice to Have (deferred)

- Unicode-normalised name key (NFC/NFKC, reject control chars) `[security]`.
- Pre-#18 warning in deployment notes about `HOST=0.0.0.0` `[security]`.
- Error message not cleared on edit, no `aria-invalid`, whitespace-only names sent `[qa]`.
- Touch targets 40–42 px on phone `[qa]`; colour picker without swatches `[qa]`.
- `progress/routes.test.ts` table cleanup `[tests]`.

## ⚪ Disagree / Intentional

- Business rules in `ProfileRepository`, no service layer — matches `progress/repository.ts` (flat layout, CLAUDE.md).
- No auth on `/profiles` — ADR-0008 §4, owned by #18.
- `name_key` column rather than `COLLATE NOCASE` — NOCASE is ASCII-only.

## Per-dimension summary

- Design: one Should (fixed), Nice applied · Docs: stale routes + ADR arithmetic fixed · Tests: trustworthy, gaps filled · Security: clean, 3 Nice · Correctness: no Must, 3 Should fixed.
