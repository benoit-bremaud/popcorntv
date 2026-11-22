# Redesign brief — web player

What the front-end redesign (epic #401) must achieve, for whom, on which screens and with which
inputs, measured by numbers the later phases can check.

- Status: **accepted** by the owner on 2026-11-23 (#395, phase 1 of epic #401), on the first
  [discovery interview](05-discovery-interviews.md). Decisions: D1 B, D2 A, D3 B (2026-11-22),
  D6 B (2026-11-23); D4 goes to #413, D5 to #396 / #399. Interviews P2 and P3 (#420) may
  amend it with the owner's validation.
- Date: 2026-11-22, updated 2026-11-23.
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
| G6 | Readable | Text contrast (WCAG 2.2 AA); smallest text | AA met; 12.8 px | AA kept; ≥ 14 px on screens ≤ 1440 px, body ≥ 28 px at 1920 × 1080 (NFR-15) |
| G7 | Comfortable motion | Motion under `prefers-reduced-motion`; autoplay with sound | Fades kept (ADR-0004 v2); no autoplay | Same rule; nothing plays with sound unasked |
| G8 | Usable by the household | Moderated test on local staging: owner and one relative, five tasks (#400) | Not run | ≥ 4 tasks of 5 done unaided by each |
| G9 | Fast and steady | Core Web Vitals of the catalog and the detail view (NFR-12, NFR-13) | Initial JS 90.5 kB gzip (`main` chunk, `493c080`); vitals not measured | Within NFR-12 and NFR-13 |

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
| TV / projector | 1920 × 1080 seen from about 3 m | Browse and watch from the sofa | See decisions D1 and D6 |
| Phone as remote | 390 × 844 portrait | Pick, play and control what the TV shows (J1) | Yes, as its own screen set |

The household's big screens run Android / Google TV (P1 interview). Per D6, the TV gets a thin
Android TV app that shows the PopCornTV web app, so the same front end serves every class; this
amends the vision's "no native apps in v1" for this shell only. Browsers: current Chromium and
Firefox; Safari / WebKit to confirm with the #394 baselines.

## 5. Input modes

| Mode | Devices | Requirements |
|---|---|---|
| Mouse / trackpad | Laptop, desktop | Hover reveals, never hides essentials; every hover effect also on focus |
| Keyboard | Laptop, desktop, TV with a keyboard | Visible focus on every stop; one documented player key map (Space / K, ← → 10 s, ↑ ↓, F, M, C, Escape) |
| Touch | Phone, tablet | 44 px targets; no hover-only information; swipe rows |
| Remote / D-pad | Android TV app (D6) | Arrows reach every control in a predictable grid; Enter selects; Back (Escape, browser back) closes the top layer (ADR-0024); focus growth has room reserved; 5 % safe margin |
| Phone remote | Phone paired with the TV app (D6) | Browse and pick on the phone, the title plays on the TV; play / pause, ±10 s, seek, volume, audio and subtitles, arrows / OK / Back; pairing and commands go through the PopCornTV server only |

## 6. Non-functional requirements

IDs continue the system-wide series of the [traceability matrix](../architecture/traceability-matrix.md)
(NFR-1 to NFR-10 are taken).

| ID | Requirement | Verified by |
|---|---|---|
| NFR-11 | **Accessibility**: WCAG 2.2 level AA on every screen and the player, including the criteria new in 2.2 — 2.4.11 focus not obscured, 2.5.7 dragging alternative, 2.5.8 target size (24 px floor; house size 44 px, G5), 3.3.8 accessible authentication, and the level A 3.2.6 consistent help and 3.3.7 redundant entry ([W3C](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)) | Automated axe pass per screen, keyboard and remote pass, `ui-review` (#400), screen-reader smoke test |
| NFR-12 | **Core Web Vitals**, 75th percentile on local staging, catalog and detail view: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 ([web.dev](https://web.dev/articles/vitals)); the same with 4× CPU throttling as a stand-in for a TV box | Lighthouse / DevTools trace per screen (#412) |
| NFR-13 | **Budget**: initial JavaScript ≤ 150 kB gzip (baseline 90.5 kB), CSS ≤ 30 kB gzip (baseline 5.4 kB); `hls.js` stays loaded on demand (ADR-0006); artwork requested at the rendered size; long rows and grids keep the DOM small on TV | A build check that fails above the budget (#400) |
| NFR-14 | **Privacy**: no request at run time to any host other than the PopCornTV server (fonts self-hosted, no analytics, no third-party script); a trailer source, if any, follows #413 | Network log of each screen |
| NFR-15 | **TV**: the platform of D6; 5 % safe margin on every edge; body text ≥ 28 px and focus inside the inner 90 % at 1920 × 1080 ([Fire TV guidelines](https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html)); every control reachable with the arrows, OK and Back; a pointer still works | Remote pass on the D6 device (#411) |

## 7. Theme and language

- **Theme**: decision D2. The "cinema room" direction (dark, seat red, gold accents) stays the
  owner's brief for #397 (memory of 2026-10-23, ADR-0004).
- **Language**: decision D3. Today the interface is English (`lang="en"`), metadata language
  follows `TMDB_LANGUAGE`.

## 8. Decisions for the owner

Each matrix: scores 0–5, weights sum to 100, total out of 500; the top score is the
recommendation; the owner's choice is recorded under each matrix.

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

Decision (owner, 2026-11-22): **B**. Sensitivity: A overtakes B only if "replace Jellyfin in the living room"
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

Decision (owner, 2026-11-22): **A**. Sensitivity: B overtakes A only if accessibility weighs above about 66.

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

Decision (owner, 2026-11-22): **B**; mockups are drawn with the longer French strings. Sensitivity: A overtakes
B only if cost weighs above about 38.

### D4 — Trailers from the selected poster (owner request 2026-11-22, #395 comment)

Decided in #413. The P1 interview asks for trailers **on request only**, no autoplay (J3).

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

### D6 — How PopCornTV reaches the big screen (2026-11-23)

Input: the P1 interview — the projector and the TV run Android / Google TV and receive casts; the
phone as a remote is the top wish (J1); children start their shows with the physical remote (J4).

- A: the web app in the TV browser only.
- B: a thin Android TV app that shows the PopCornTV web app, plus a phone remote (a web screen
  paired with the TV through the PopCornTV server); Google Cast stays in #202.
- C: Google Cast only — the phone sends the video and acts as the remote (Cast SDK, a receiver
  app registered with Google).
- D: B and C together.

| Criterion | Weight | A | B | C | D |
|---|---:|---|---|---|---|
| Covers the household's devices | 25 | 2 — Google TV often has no browser | 4 — projector and TV, no cast | 4 — cast, no TV app | 5 |
| Phone remote (J1, top priority) | 25 | 1 — none | 4 — full control through our server | 4 — Cast controls, no D-pad | 5 |
| Everything in PopCornTV, no third party (NFR-14) | 20 | 5 | 5 | 2 — Google Cast SDK and registration | 2 |
| Build and upkeep cost | 15 | 5 | 3 — APK shell and pairing | 2 — receiver app, media access without cookies | 1 |
| Children on their own with the physical remote (J4) | 15 | 3 | 5 | 2 — needs the phone | 5 |
| **Total /500** | 100 | **295** | **420** | **300** | **380** |

Decision (owner, 2026-11-23): **B**. It reverses the order of the 2026-11-08 brainstorm (#202:
cast 435, native TV apps 350), which predates the interview and did not weigh the phone remote,
the children's physical remote or NFR-14. Sensitivity: D overtakes B only if 3 × the third-party weight
plus 2 × the cost weight falls below 50 (for example 10 and 10). The Android TV shell (#417)
and the phone remote (#418) get their own spec and ADR; the redesign draws the TV screens and the
phone remote screens.

## 9. Scope

In: every screen of the 2026-11-20 audit (19) and the player, at the sizes of § 4; design tokens,
components and their states; UX writing; the trailer entry points.

In as well: the phone remote screens and the TV layout of D6; room in the screens for suggestions
(J2) and a children's profile with per-title owner overrides (J4).

Out: server features the designs need (trailer source, skip intro segments, seek previews,
pairing, suggestions engine, children's ratings and overrides, home-automation scene) — each gets
its own issue and ADR; the Android TV shell itself (D6, own issue); native mobile apps; any
third-party content (vision).

## 10. Constraints

- `tokens.css` stays the token source; Penpot mirrors it (ADR-0037). ADR-0004 stays the baseline
  until the art direction (#397) supersedes it.
- No external request at run time for fonts, images or scripts beyond TMDB artwork already proxied
  by the server.
- Test baselines (#394) land before the implementation (#400).
- Each phase ends with the owner's validation.

## 11. Validation

The brief is done when the owner validates §§ 2, 4, 5 and 6, the decisions D1–D3 and D6, and the
job stories of the discovery interviews (P1 done 2026-11-23; P2 and P3 in #420); D4 (#413) and D5 stay open. The validation is logged in
`PROJECT_LOG.md`.
