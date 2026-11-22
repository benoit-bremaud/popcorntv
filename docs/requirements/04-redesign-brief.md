# Redesign brief — web player

What the front-end redesign (epic #401) must achieve, for whom, on which screens and with which
inputs, measured by numbers the later phases can check.

- Status: **proposed**, awaiting the owner's validation (#395, phase 1 of epic #401).
- Date: 2026-11-22.
- Inputs: [vision](01-vision.md), [parity](03-plex-jellyfin-parity.md), the
  [benchmark](../architecture/specs/redesign-benchmark.md), the UI audit of 2026-11-20 (#378,
  25 / 40), the [player audit](../architecture/qa/2026-11-22-ui-review-player.md) (21 / 40),
  [ADR-0004](../architecture/decisions/0004-catalog-design-tokens.md) (current tokens),
  ADR-0037 (Penpot, `tokens.css` as the source; #393).

## 1. Problem

The web player works but was built screen by screen: the 2026-11-20 audit scores it 25 / 40
(controls under 44 px, no wide layout, posters without titles, a hero that cannot play), and the
player scores 21 / 40 (the pause key closes it, no key map, no track choice while playing). The
product's end target is to replace the homelab Jellyfin, so it must hold up wherever the household
watches, the TV included.
The redesign rebuilds the front end on one design system drawn in Penpot before any code.

## 2. Goals

| ID | Goal | Measure | Baseline | Target |
|---|---|---|---|---|
| G1 | Craft quality | `ui-review` total over the 8 scored dimensions, every screen and the player | 25 / 40 (screens), 21 / 40 (player) | ≥ 34 / 40 each |
| G2 | No blocking defect | `ui-review` Must findings | 1 (player, Space closes it) | 0 |
| G3 | Fast to play | Activations from the home screen to a playing title, for the hero and for *Continue watching* | Hero: 2 (*More info*, then *Play*); row: 2 | 1 from *Continue watching*, ≤ 2 from the hero |
| G4 | Keyboard and remote complete | Flows of the #396 inventory done with arrows, Enter and Back only | Not measured; player fails (G2) | 100 %, focus never lost to `<body>` |
| G5 | Targets | Pointer and touch targets | 9 control families at 29–42 px | 100 % ≥ 44 px (house size), never < 24 px (WCAG 2.2 AA) |
| G6 | Readable | Text contrast (WCAG 2.2 AA); smallest text | AA met; 12.8 px | AA kept; ≥ 14 px on screens ≤ 1440 px, ≥ 24 px at 1920 × 1080 TV distance |
| G7 | Comfortable motion | Motion under `prefers-reduced-motion`; autoplay with sound | Fades kept (ADR-0004 v2); no autoplay | Same rule; nothing plays with sound unasked |
| G8 | Usable by the household | Moderated test on local staging: owner and one relative, five tasks (#400) | Not run | ≥ 4 tasks of 5 done unaided by each |
| G9 | Fast first view | Largest Contentful Paint of the catalog on local staging, 4× CPU throttling | Not measured | ≤ 2.5 s |

G1, G2 and G8 repeat the epic's done criteria; G3–G7 and G9 are new and come from the audits and
the benchmark.

## 3. Users

Two actors from the vision, detailed as personas in #396:

- **Viewer** — a household member, from a child to a grandparent; browses and watches, often on
  the TV, sometimes on a phone or tablet.
- **Owner** — also a viewer; manages libraries, accounts and profiles, mostly on a laptop.

## 4. Target devices

| Class | Reference size (CSS px) | Typical use | Wireframes (#398) |
|---|---|---|---|
| Phone | 390 × 844 portrait, landscape for playback | Browse, quick play, administration on the go | Yes |
| Tablet | 768 × 1024 | Browse and watch | Yes |
| Laptop / desktop | 1440 × 900 | Browse, watch, administration | Yes |
| Wide desktop | ≥ 1920 | Same, with a capped content width | Through the 1440 layout and a max width |
| TV browser | 1920 × 1080 seen from about 3 m | Browse and watch from the sofa | See decision D1 |

TV means a web browser on the TV or on a box attached to it (Android TV / Google TV browser, a
mini-PC). Native TV apps stay out of scope (vision: no native apps in v1). Browsers: current
Chromium and Firefox; Safari / WebKit to confirm with the #394 baselines.

## 5. Input modes

| Mode | Devices | Requirements |
|---|---|---|
| Mouse / trackpad | Laptop, desktop | Hover reveals, never hides essentials; every hover effect also on focus |
| Keyboard | Laptop, desktop, TV with a keyboard | Visible focus on every stop; one documented player key map (Space / K, ← → 10 s, ↑ ↓, F, M, C, Escape) |
| Touch | Phone, tablet | 44 px targets; no hover-only information; swipe rows |
| Remote / D-pad | TV browser | Arrows reach every control in a predictable grid; Enter selects; Back (Escape, browser back) closes the top layer (ADR-0024); focus growth has room reserved; 5 % safe margin |

## 6. Theme and language

- **Theme**: decision D2. The "cinema room" direction (dark, seat red, gold accents) stays the
  owner's brief for #397 (memory of 2026-10-23, ADR-0004).
- **Language**: decision D3. Today the interface is English (`lang="en"`), metadata language
  follows `TMDB_LANGUAGE`.

## 7. Decisions for the owner

Each matrix: scores 0–5, weights sum to 100, total out of 500; the top score is the
recommendation.

### D1 — TV support level

- A: first-class TV — a dedicated 10-foot layout and full D-pad support.
- B: TV-ready responsive — full D-pad support, a 1920 breakpoint with larger type and safe margins,
  no separate layout.
- C: no TV target — desktop and mobile only.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Replace Jellyfin in the living room | 35 | 5 — best on the sofa | 4 — usable, less tailored | 1 — TV left to Jellyfin |
| Design and build cost | 25 | 2 — a fourth layout to draw, build, test | 4 — tokens and focus rules | 5 |
| One coherent system | 20 | 3 — two layouts drift | 5 — one system | 4 |
| Risk (TV browsers we cannot test in CI) | 20 | 2 | 4 | 5 |
| **Total /500** | 100 | **325** | **420** | **340** |

Recommendation: **B**. Sensitivity: A overtakes B only if "replace Jellyfin in the living room"
weighs above about 67.

### D2 — Theme

- A: dark only, tokens structured so a light theme can be added later.
- B: dark and light, chosen by the viewer.
- C: dark, plus light following `prefers-color-scheme`.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Fits watching films (dim room, artwork first) | 35 | 5 | 4 | 4 |
| Cost (tokens, mockups and QA doubled) | 30 | 5 | 2 | 2 |
| Accessibility (some viewers read better on a light background) | 20 | 3 | 4 | 4 |
| Matches the benchmark (all five are dark-first) | 15 | 5 | 3 | 3 |
| **Total /500** | 100 | **460** | **325** | **325** |

Recommendation: **A**. Sensitivity: B overtakes A only if accessibility weighs above about 66.

### D3 — Interface language

- A: English only, as today.
- B: French and English, chosen per profile, French first; strings extracted in #400.
- C: French only.

| Criterion | Weight | A | B | C |
|---|---:|---|---|---|
| Household can use it unaided (French-speaking family) | 35 | 2 | 5 | 4 |
| Cost (string extraction, two lengths in mockups, tests) | 25 | 5 | 2 | 4 |
| Repository rule (code English; UI text is product content) | 15 | 5 | 4 | 3 |
| Open to other households later | 25 | 3 | 5 | 2 |
| **Total /500** | 100 | **345** | **410** | **335** |

Recommendation: **B**; mockups are drawn with the longer French strings. Sensitivity: A overtakes
B only if cost weighs above about 38.

### D4 — Trailers from the selected poster (owner request 2026-11-22, #395 comment)

Requirement: when a title is selected — hover, keyboard or remote focus, or the detail sheet — the
viewer can watch its trailer, in the spirit of Netflix and Apple TV previews. Benchmark: the
*Trailer* button in the detail view is the common baseline; previews on hover or focus are a layer
on top, muted, with a per-profile or motion switch.

Constraint, **not decided here**: TMDB lists trailers as YouTube or Vimeo videos, and ADR-0029
keeps every third-party stream out of PopCornTV. An ADR settles it before any code, with at least
these options:

- link: the *Trailer* button opens the video page in a new tab (the ADR-0029 pattern);
- embed: a `youtube-nocookie.com` player in the sheet, on an explicit click only (privacy notice,
  CSP `frame-src`, no autoplay with sound);
- local files: trailers next to the media (`trailers/`, `-trailer`, as Plex and Jellyfin), played by
  PopCornTV's own player, the only option that allows a preview on focus;
- a combination: local first, link as the fallback.

Criteria for that ADR: privacy and ADR-0029, viewer experience, availability per title, cost,
breakage risk. Design phases draw the *Trailer* button and its states (none, loading, playing,
error, reduced motion) in every option; the preview on focus is drawn as optional.

### D5 — Player controls

The player audit's three conflicts (native controls, one *Next episode* button, audio chosen before
Play) are reopened by the redesign: custom controls drawn in Penpot, an in-player audio and subtitle
panel, an optional countdown. Decided in #396 / #399 with the screen inventory, not in this brief.

## 8. Scope

In: every screen of the 2026-11-20 audit (19) and the player, at the sizes of § 4; design tokens,
components and their states; UX writing; the trailer entry points.

Out: server features the designs need (trailer source, skip intro segments, seek previews) — each
gets its own issue and ADR; native TV or mobile apps; any third-party content (vision).

## 9. Constraints

- `tokens.css` stays the token source; Penpot mirrors it (ADR-0037). ADR-0004 stays the baseline
  until the art direction (#397) supersedes it.
- No external request at run time for fonts, images or scripts beyond TMDB artwork already proxied
  by the server.
- Test baselines (#394) land before the implementation (#400).
- Each phase ends with the owner's validation.

## 10. Validation

The brief is done when the owner validates §§ 2, 4, 5 and the decisions D1–D3, and acknowledges D4
and D5 as open.
