# UI review — web (all screens) — 2026-11-20

Baseline audit of the whole web player before the Penpot front-end study: what the render
does today, measured at three widths, scored against the craft floor.

**URL / build:** Vite dev server, `apps/web` @ `e02ee78`, **API mocked at the network layer**
(14 films, 1 series, 4 profiles, 2 libraries, generated SVG artwork) ·
**Tool:** Playwright test runner (Chromium) · **Widths:** 390 / 768 / 1440
**Mode:** Experience (browse and play), secondary Operate (administration, profiles) ·
**Invention level:** Extend (ADR-0004 v2 "velvet house" is the incumbent system)

Screens covered (19): sign-in, setup, redeem invite, profile picker, manage profiles,
catalog, search, no result, Films A–Z, film detail, series detail, Discover, title sheet,
notifications, account menu, administration, empty catalog, server unreachable, 404.

## Decisions in conflict with doctrine (not defects)

| Choice | Conflicts with | Decided on | Source | Reopen? |
|---|---|---|---|---|
| Reduced motion keeps the `rise` / `fade` animations (only travel, lift and stagger go to 0) | ADR-0004 §3 "motion … disabled under `prefers-reduced-motion`" | 2026-10-23 | ADR-0004 §5 (v2), `tokens.css` comment | No: v2 supersedes §3; fix the wording of §3 |
| ADR-0004 status is still "proposed" while the palette, type scale and motion are shipped | Decision traceability (`common.md`) | 2026-10-23 | ADR-0004 header | Yes: mark accepted, or reopen in the Penpot study |
| No deep link: catalog view state lives in a reducer, not the URL | Back / share expectations of a browse surface | 2026-10-23 | ADR-0004 §4 (A 440 vs B 385) | Yes, in the UX study (ADR says "with a router when #7 adds a player route") |

## Scores

| Dimension | Score /5 | Evidence |
|---|---|---|
| Hierarchy | 3 | `catalog-1440.png`: hero is the big thing, but its only action is "More info" (no Play / Resume); posters carry no title, only a rating |
| Typography | 3 | Sizes rendered: 12.8, 16, **18.72**, 20, **24**, 25, 31.25, 39.06 px — 18.72 (default `h3`) and 24 (empty-state `h2`) are off the ×1.25 scale; weights 400 / 500 / 700 consistent |
| Layout and rhythm | 2 | `catalog-1440.png`, `discover-1440.png`: no content max-width, header items spread by `space-between` (profile at x≈520, bell at x≈970), search capped at 640 px left-aligned, rows of 1–4 posters leave 70–90 % of the row empty; no breakpoint tokens, four different breakpoint syntaxes |
| Colour and contrast | 4 | No low-contrast pair measured on any of the 57 renders; palette matches ADR-0004; raw `z-index` in three files (no token) |
| States | 3 | Empty catalog, no result, server unreachable, 404 all exist and render; no skeleton (plain "Loading…"); no-result and server-unreachable have no heading; dialog content cut at the bottom edge with no scroll cue (`detail-film-390.png`) |
| Motion | 4 | Reduced motion: `--travel` = 0 px measured, fades remain (decided); focus walk shows no motion-only state |
| Accessibility | 3 | Focus ring `2px solid rgb(232,73,92)` on every stop (`focus-1440.png`); no target under 24 px; 9 control families under 44 px (table below); heading order clean (h1 → h2 → h3 → h4) |
| Content resilience | 3 | No horizontal overflow at any width (document width = viewport on 57 renders); at 390 px the profile name becomes "M." and the account "o…", "Grand-père Maximilien" becomes "Grand-p…" in the picker |
| AI tells | not checked | `bans.md` not applied in this pass |
| **Total** | **25 / 40** | 8 dimensions scored |

Targets under the 44 px house size (all ≥ 24 px, so Should):

| Control | Measured | Where |
|---|---|---|
| Episode chip `.chip--small` | 36 × 29 | series detail |
| `.button` (More info, Retry, Add a library, admin actions, `a.button`) | 40 high | hero, error, empty catalog, administration |
| `select.chip` (Audio) | 162 × 40 | detail dialog |
| `.bell__item` | 40 high | notification panel |
| `.chip` (Library / Discover, view and genre chips) | 42 high | catalog |
| `.tab` (All / Films / Series / Documentaries) | 42 high | catalog |
| `.search__input` | 42 high | catalog, Discover |
| `.button-quiet` | 91 × 42 | forms |

## Findings

| # | Severity | Dimension | Evidence | Finding | Proposed fix |
|---|---|---|---|---|---|
| 1 | Should | Accessibility | Table above | Nine control families are 29–42 px high while `--touch-target: 44px` exists | Apply `min-block-size: var(--touch-target)` to `.button`, `.chip`, `.tab`, `.search__input`, `.bell__item`; episode chip first |
| 2 | Should | Layout | `catalog-1440.png` | Header: brand, profile, bell and account spread across 1440 px with no grouping; the account `summary` is a 62 px box with its label at the top | Group profile + bell + account on the right; align the summary like the other header controls |
| 3 | Should | Layout | `catalog-1440.png`, `discover-1440.png` | No max content width and no wide breakpoint: at 1440 px the layout is the 768 px layout stretched | Define breakpoint and container tokens; design the ≥ 1280 px layout in Penpot |
| 4 | Should | Hierarchy | `catalog-1440.png`, `catalog-390.png` | Posters show a rating but no title; the title appears only as fallback text when artwork is missing | Decide in the UX study: title under the poster, or on hover / focus plus always on touch |
| 5 | Should | Hierarchy | `catalog-1440.png` | Hero offers "More info" only; playing the featured title takes two steps | Add Play / Resume as the primary hero action, "More info" as secondary |
| 6 | Should | States | `detail-film-390.png`, `title-sheet-390.png` | Dialog content is cut mid-row at the bottom edge ("Rent" logos half visible) with no fade or scroll cue | Bottom fade or sticky action bar; check the dialog height at 390 px |
| 7 | Should | Content resilience | `catalog-390.png`, `profile-picker-390.png` | At 390 px the header shows "M." and "o…"; a long profile name is cut to "Grand-p…" | Avatar-only switch below 40 rem; two-line profile names in the picker |
| 8 | Should | Layout | `notifications-390.png` | The open notification panel covers the hero title and overview with no scrim on the page | Scrim or elevation contrast for the panel; revisit placement on narrow screens |
| 9 | Should | Layout | `admin-390.png`, `admin-1440.png` | Administration: up to six equal-weight buttons per account row, "Delete" styled like "Rename", dates in raw ISO with offset | Primary / quiet / danger button roles, an overflow menu per row, a readable date format |
| 10 | Nice | Typography | Sizes list above | `h3` renders at the browser default 18.72 px, empty-state `h2` at 24 px | Map every heading level to a `--text-*` token |
| 11 | Nice | States | No-result and server-unreachable renders | Both screens have no heading; loading is a bare "Loading…" | Heading + skeleton rows |
| 12 | Nice | Layout | `catalog-1440.png` | Rows with 1–4 items (Series, Documentaries, Continue watching) leave the row mostly empty | Merge short rows or switch them to a wider card format |
| 13 | Nice | Colour | `auth.css:52`, `catalog.css:392`, `discover.css:148` | Raw `z-index` values, no layer tokens | Add `--layer-*` tokens |
| 14 | Nice | Layout | CSS media queries | Four breakpoint syntaxes (`max-width: 40rem`, `min-width: 48rem`, `width < 24rem`, `width < 40rem`) | One documented breakpoint set, one syntax |
| 15 | To confirm | Hierarchy | `detail-series-1440.png` | The series dialog showed no episode list and no Play button on the first screen with the mocked data | Re-check on real data before filing |
| 16 | To confirm | Accessibility | Focus walk | Posters read as "★ 8.3" in the focus walk text; the accessible name must be the title | Re-check with the accessibility tree |

No Must finding: no overflow, no contrast failure, no target under 24 px, focus always visible.

## Checks

- Run: full-page screenshot and in-page measurement (overflow, overlap, targets, contrast,
  header height, type sizes, headings) on 19 screens × 390 / 768 / 1440; Tab focus walk,
  hover and reduced-motion pass on the catalog at 1440.
- Not run: real server and real TMDB artwork (API mocked); the player (`PlayerDialog`,
  direct play and HLS); Firefox and WebKit; a real touch device; screen reader;
  `bans.md` (AI tells); performance (Lighthouse); the 320 px width (covered by
  `catalog.smoke.spec.ts` for the header and the notification panel only).

## Follow-up

- Findings 1–14 → issues on Project #71, input of the Penpot front-end study.
- Findings 15–16 → confirm on local staging first.
