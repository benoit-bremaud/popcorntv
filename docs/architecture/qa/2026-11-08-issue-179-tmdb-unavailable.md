# QA report — #179 Discover answers 502 when TMDB is unreachable

Targeted check of the #179 fix on the local production build, 2026-11-08.

## Setup

- Build: `pnpm build`, then `node dist/index.js` in `apps/server` (branch
  `fix/179-malformed-tmdb-body-502`, working tree on top of 52d0b68), temporary database and
  folders, `SCAN_INTERVAL_MIN=0`.
- TMDB unreachable: `TMDB_API_KEY` set to a fake value, `NODE_USE_ENV_PROXY=1` and
  `HTTPS_PROXY=http://127.0.0.1:9` (closed port), so every `fetch` fails with
  `ECONNREFUSED`.
- First owner created through `POST /auth/setup` with the logged setup token.

## Results

| Call | Before (`main`) | After |
|---|---|---|
| `GET /discover?list=trending&kind=movie` | 500 (raw `TypeError`) | 502 `tmdb_unavailable` |
| `GET /discover/search?q=dune` | 500 | 502 `tmdb_unavailable` |
| `GET /discover/movie/1` | 500 | 502 `tmdb_unavailable` |
| `PUT /profiles/:id/wishlist/movie/1` | 500 | 502 `tmdb_unavailable` |
| `GET /profiles/:id/wishlist` | — | 200 `[]` (nothing added) |

- Log: four `discover.tmdb.failed` warn lines, `err.type` `TmdbRequestError`, message
  `TMDB /trending/movie/week answered 0: fetch failed: connect ECONNREFUSED 127.0.0.1:9`;
  no `statusCode` 500 line; the API key appears nowhere in the log.
- The "Before" column comes from the failing route tests written first (red run), not
  from a replay of `main`.
- A `200` with a body that is not JSON cannot be produced by hand (fixed HTTPS base URL);
  it is covered by `tmdb-client.test.ts` and `discover/routes.test.ts`.

Verdict: OK.
