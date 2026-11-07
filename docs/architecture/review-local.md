# Local review — end of run #127 / #131–#136

End-of-run gate on `main` `f770fa3`, 2026-11-08 (owner rule 2026-11-07: features chained, checks
at the end). Opus adversarial review of #127 plus a verify round of the #134–#136 stack review,
then the full local CI.

## Verify round, #134–#136 stack review

M1, M2, S1, S3–S6 confirmed fixed on `main`. S2 (track index applied to every episode) had
regressed into Must 3 below; S7 (Next episode keeps the track) and the `audioIndex` 400 test were
missing: both added.

## Findings (#127 and the regression)

| # | Level | Finding | Outcome |
|---|---|---|---|
| 1 | Must | Poster route downloaded any TMDB path a viewer named: unbounded queue and disk | Fixed: only paths the server handed out (last 2000), test proves no download otherwise |
| 2 | Must | Four docs said TMDB only receives a title, year or provider id | Fixed: data-flow 06 (Discover flow, wishlist store), enrich sequence, tmdb spec, client docblock |
| 3 | Must | A series switched to HLS with no track picked when episodes order tracks differently | Fixed: no pick = first track, spec audio-track R4 states the language match, 2 tests |
| 4 | Should | `openMediaId` reopened a title after a profile switch | Fixed: cleared on pick |
| 5 | Should | Unknown TMDB id answered 502 | Fixed: `404 title_not_found`, spec R9 |
| 6 | Should | Poster answer `Cache-Control: public` on a signed-in route | Fixed: `private` |
| 7 | Should | UC26 extend arrow reversed | Fixed: UC4 extends UC26 at *title on disk* |
| 8 | Should | `CLAUDE.md` layout and auth note missed `src/discover/`, UC26 | Fixed |
| 9 | Should | ADR-0020 "four calls per quarter hour" too broad | Fixed: limited to the lists, poster rule added |
| 10 | Should | ADR-0018 tie-breaker cited a criterion where A and B tie | Fixed |
| 11 | Should | No test for the tabs hand-off nor another account's profile | Fixed: both added |
| 12 | Should | No unit test of `matchAudioTrack` / `effectiveAudioIndex` | Fixed: shared coverage 75 % → 100 % |
| 13 | Nice | Search over 100 characters shown as a TMDB failure | Fixed: `maxLength={100}` |
| 14 | Nice | ADR-0020 "two route modules", component header without UC26, `CLAUDE.md` PUT wording | Fixed |
| 15 | Nice | Index on `media.tmdb_id`, shared pending list promise, wishlist cap, artwork eviction | Filed #156 |
| 16 | Nice | #136: identity ignores `edition` / `episodeEnd`, duplicate labels and `und`, Audio select without Play, `decidePlayback` vs default disposition | Filed #157 |
| 17 | Disagree | Drop `MEDIA_ROUTE` from the poster route | Kept: a Discover page loads ~80 posters, the 300 / min bucket would throttle it; finding 1 already bounds what the route can fetch |

SonarQube: 3 new issues on #127 (S7721, S2004, S1874) fixed, gate PASSED.
