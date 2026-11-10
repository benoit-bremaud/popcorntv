# UC30 — Open my own link for a title

The owner attaches one personal web link to a title; every signed-in viewer sees it on the
title sheet as a button that opens it in a new tab.

> **Feature**: Catalog — [use cases](../diagrams/catalog/01-use-case.md),
> [components](../diagrams/catalog/03-component.md),
> [sequence](../diagrams/catalog/12-sequence-title-link.md)
> **Issue**: #278 · **Related ADRs**: ADR-0028, ADR-0029, ADR-0031
> Format: Cockburn casual use case.

## 1. Requirements

- **R1** A link belongs to a TMDB title, keyed by `(kind, tmdbId)` with `kind` `movie` or `tv`
  (ADR-0031 D1): the same link shows on the Discover title sheet and on the library detail
  dialog of a film or series with a `tmdbId`, and outlives rescans and duplicate copies. An
  episode or an unmatched title has no link.
- **R2** `GET /title-links/:kind/:tmdbId` (any signed-in caller) answers `{ url, editable }`:
  `url` is the stored link or null, `editable` is true for an owner caller.
- **R3** `PUT /title-links/:kind/:tmdbId` with `{ url }` and `DELETE /title-links/:kind/:tmdbId`
  are owner-only (ADR-0031 D2); both answer `204`; a delete of no link is a `204` too.
- **R4** The server accepts a URL only when: it is at most 2048 characters after trimming;
  `new URL()` parses it; the scheme is `http:` or `https:` (so no `javascript:`, `data:`,
  `file:`…); it has a host; it carries no user name nor password. Anything else → `400
  invalid_request`. The stored value is the normalised `URL.href`.
- **R5** PopCornTV never fetches, proxies, embeds nor plays the link: the server only stores
  and returns the string (project rule: own media only; ADR-0028).
- **R6** The web shows **Open my link** (an `<a target="_blank" rel="noopener noreferrer">`)
  under *Where to watch* when a link exists. An owner also gets **Add my link** / **Edit
  link**, a URL field with Save, Cancel and Remove; a refused save shows "Enter an http(s)
  link". A load failure shows nothing; the rest of the sheet is unaffected.
- **R7** Each change logs `title_link.set` or `title_link.removed` (info) with `kind`,
  `tmdbId`, `userId` — never the URL (it may carry a private token in its query).

## 2. Main scenario

1. The owner opens a title sheet; the web reads `GET /title-links/movie/603`.
2. The owner chooses **Add my link**, pastes `https://example.org/watch`, Save.
3. The server validates it (R4), stores it, logs `title_link.set`, answers `204`.
4. Any viewer opening the title later sees **Open my link**; a click opens a new tab.

## 3. Extensions

- 2a. The URL is `javascript:alert(1)` or `https://u:p@host/` → `400`; the field stays
  open with the error line.
- 2b. The owner empties the field and chooses Remove → `DELETE`, the button disappears.
- 1a. A viewer that is not an owner: `editable` false, no edit control; a forged `PUT` → `403`.
