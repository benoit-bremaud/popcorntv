# UC27 — See where to watch legally in France

A viewer opening a title sheet (Discover or library) sees the French legal offers for it —
subscription, free, with ads, rent, buy — and opens the chosen one in a new tab.

> **Feature**: Catalog — [use cases](../diagrams/catalog/01-use-case.md),
> [components](../diagrams/catalog/03-component.md),
> [sequence](../diagrams/catalog/09-sequence-where-to-watch.md)
> **Issue**: #184 · **Related ADRs**: ADR-0020, ADR-0027, ADR-0028, ADR-0029
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** `GET /discover/:kind/:tmdbId/providers` (signed-in caller) answers
  `WatchProviders`: `{ link, offers }`. `link` is the TMDB watch page of the title for
  France (`results.FR.link`, JustWatch data), null when TMDB has no French entry or the link
  is not an `https://www.themoviedb.org/` URL (a hostile payload cannot redirect). `offers`
  lists `{ providerId, name, logoPath, type }`, `type` one of `flatrate`, `free`, `ads`,
  `rent`, `buy`, in that order, each group sorted by TMDB `display_priority`. No French
  entry → `{ link: null, offers: [] }`, not an error.
- **R2** Only the `FR` region is read; other regions are dropped by the client parser.
- **R3** Caching (ADR-0027 pattern): an answer is fresh for 24 hours, then served stale while
  one TMDB call refreshes it; concurrent requests for a title share the call in flight; at
  most 500 titles are kept, the least recently read forgotten first. A failed refresh logs
  `discover.providers.refresh_failed` (warn) and keeps the old answer.
- **R4** Errors as the Discover routes (spec discover-wishlist R9): `400` bad params, `409
  tmdb_not_configured`, `404 title_not_found`, `502 tmdb_unavailable` when nothing is cached.
- **R5** Provider logos go through the artwork cache at `w92`:
  `GET /discover/logo/:file`, served only for a logo path this server handed out (same
  guard as posters, ADR-0020); otherwise `404 artwork_not_found`.
- **R6** Each offer opens `link` (ADR-0029) in a new tab with `target="_blank"
  rel="noopener noreferrer"`; TMDB gives no per-provider deep link. The block shows the
  attribution "Data: JustWatch via TMDB".
- **R7** The block **Where to watch (France)** appears on the Discover title sheet and on the
  library detail dialog of a film or series with a `tmdbId`; nothing for an episode or an
  unmatched title. No offer → "No legal offer in France for now". A failure → a short
  "Offers could not be loaded" line; the rest of the sheet is unaffected.
- **R8** PopCornTV never fetches, proxies, embeds or plays a third-party stream: only the
  TMDB metadata and logos cross the server (project rule: own media only; ADR-0028).
- **R9** Offers carry the stable TMDB `providerId` so a later "my providers" setting (#277)
  can filter or notify on them without a new contract.

## 2. Main scenario

1. The viewer opens a title sheet.
2. The web asks `GET /discover/:kind/:tmdbId/providers`.
3. The server answers from its memo, or asks TMDB `/{kind}/{id}/watch/providers` once.
4. The sheet groups the offers by type with their logos.
5. The viewer clicks an offer; the TMDB watch page opens in a new tab and lists the
   provider's own link.

## 3. Extensions

- 3a. TMDB fails, nothing cached → `502`; the sheet shows R7's failure line.
- 3b. Cached but stale → served at once, refreshed behind (R3).
- 4a. No French offer → R7's empty line.
