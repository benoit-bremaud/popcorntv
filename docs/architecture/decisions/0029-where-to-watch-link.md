# ADR-0029 — Where-to-watch offers link to the TMDB watch page

- Status: accepted (owner chose A in the #184 chat, 2026-11-10)
- Date: 2026-11-10
- Deciders: owner
- Related: spec [where-to-watch](../specs/where-to-watch.md), ADR-0020, ADR-0027, issue #184

## Context

TMDB `/{kind}/{id}/watch/providers` (JustWatch data) gives, per region, a `link` to the TMDB
watch page of the title and the providers (`provider_id`, name, logo, priority) per offer
type. It gives no deep link to the title on each provider. JustWatch attribution is
required. PopCornTV must never touch a third-party stream.

## Options

A — every offer opens the TMDB watch page `link` (which lists the providers' own deep links);
B — a curated `provider_id` → homepage table; C — a curated per-provider search URL template.

| Criterion                    | Weight | A                       | B                         | C                         |
| ---------------------------- | -----: | ----------------------- | ------------------------- | ------------------------- |
| Legal / attribution          |     30 | 5 — TMDB terms followed | 4 — attribution kept, own table | 3 — URL templates guessed |
| Clicks to watch              |     25 | 3 — one extra click     | 2 — home page, then search | 4 — search results        |
| Maintenance                  |     25 | 5 — none                | 2 — table to keep current | 1 — templates break       |
| Simplicity                   |     20 | 5 — one link per answer | 3 — a lookup table        | 2 — templates and encoding |
| **Total /500**               |    100 | **450**                 | **280**                   | **255**                   |

Sensitivity: C overtakes A only when "clicks to watch" weighs above about 75.

## Decision

A. The answer carries the French `link` once; every offer opens it in a new tab with
`rel="noopener noreferrer"`, and the block credits JustWatch via TMDB. Answers are cached per
title 24 h fresh, then stale-while-refresh, 500 titles at most (ADR-0027 pattern). Logos go
through the artwork cache at `w92`, issued paths only.

## Consequences

- One extra click (TMDB page) before the provider; no table to maintain.
- Offers keep `providerId`, so #277 can add a "my providers" filter or notification later.
- No title has an offer without `link`: when TMDB has no French entry, or its link is not an
  `https://www.themoviedb.org/` URL, the answer has no offer and the block says so.
