# MoSCoW — redesign scope

What the redesigned front end must, should and could cover, and what waits for later, so the
inventory, the wireframes and the implementation (#396–#400, epic #401) work on the same list.

- Status: **validated** by the owner on 2026-11-23 (#396), Must share of 66 % accepted.
- Date: 2026-11-23.
- Inputs: [brief](04-redesign-brief.md) (§ 9 scope), [personas](06-personas.md),
  [job stories](05-discovery-interviews.md#5-job-stories), open issues of the backlog.

## Categories

| Category | Meaning for the redesign |
|---|---|
| **Must** | Designed (#398, #399) and built (#400); the redesign fails without it |
| **Should** | Designed and built unless the effort of #400 runs out; a gap is logged |
| **Could** | Room reserved in the screens (a slot, a state, an entry point); built later by its own issue |
| **Won't (this time)** | Out of the redesign; tracked by its own issue |

Effort is a rough size for #398–#400 together: S = 1, M = 2, L = 3. DSDM rule: Must stays at
or under about 60 % of the total effort, so Should can absorb overruns.

## Must

| ID | Item | Personas | Job / goal | Issue | Effort |
|---|---|---|---|---|---|
| M1 | Sign-in, first-run setup, redeem an invitation or reset link | All | NFR-11 (3.3.8) | — | S |
| M2 | Who's watching: pick, add, rename, delete a profile | All | J4 | — | S |
| M3 | Home: hero with Play / Resume, *Continue watching* first, rows by type and genre | All | G3, J6 | #383, #390 | L |
| M4 | Poster card with title, progress and watched mark | All | J3, J6 | #382 | M |
| M5 | Title detail (film and series): synopsis, rating, cast, seasons and episodes, copy, audio and subtitles, mark watched | All | J3, J5 | — | L |
| M6 | Player: custom controls, documented key map, Space pauses, Back closes, track choice entry point | All | J5, G2, G4 | #415, D5 in #399 | L |
| M7 | Search titles and people, no-result state | Alex, Monique | J2 | — | M |
| M8 | Remote and keyboard navigation everywhere: focus system, D-pad grid, Back closes the top layer | All | G4, NFR-15 | — | L |
| M9 | TV breakpoint (1920 × 1080 at 3 m): safe margin, 28 px body, focus room | All | D1, NFR-15 | — | M |
| M10 | Touch and phone layout (390 px), 44 px targets | Alex, Monique | G5 | #379 | M |
| M11 | Status screens: loading, empty catalog, server unreachable, 404 | All | NFR-11 | #389 | S |
| M12 | French and English per profile, layouts sized for French strings | All | D3 | — | M |
| M13 | Accessibility WCAG 2.2 AA and reduced motion | All | G7, NFR-11 | #265 | M |

## Should

| ID | Item | Personas | Job / goal | Issue | Effort |
|---|---|---|---|---|---|
| S1 | Phone remote screens: pair, browse and pick, control playback (drawn here; feature in #418) | Alex | J1 | #418 | L |
| S2 | TV sign-in without typing: pair the TV with a code (drawn here; feature in #200) | Léa, Monique | J4 | #200, #417 | S |
| S3 | Trailer on request from the detail view, per ADR-0040 | Alex | J3 | #413, #425 | S |
| S4 | Discover: trending and popular lists, search beyond the library, wishlist | Alex | J2 | — | M |
| S5 | Where to watch and my providers; personal title link | Alex | J2 | — | S |
| S6 | Notifications (wishlist titles that became available) | Alex | — | #386 | S |
| S7 | Account menu: version, sign-out, profile switch | All | — | #380 | S |
| S8 | Administration: libraries, accounts, devices, links, events — usable on a phone | Alex | — | #387 | M |
| S9 | End-of-episode and end-of-film screen: next episode, back to the catalog, a clear end for a child account | Alex, Léa | J4 | #160 | S |
| S10 | Wide layout with a maximum content width | Alex | G1 | #381 | S |

## Could

| ID | Item | Personas | Job / goal | Issue |
|---|---|---|---|---|
| C1 | Preview on focus or hover, muted, off by default (only with local trailers, ADR-0040) | Alex | J3 | #413 |
| C2 | Suggestions row from viewing history, filtered by mood or running time | Alex | J2 | #160 |
| C3 | Child account badge, rating chip and a per-title owner override control | Alex, Léa | J4, J8 | #316 |
| C4 | Fit or fill the video to the screen | All | J5 | #124 |
| C5 | Leaving soon row | Alex | — | #193 |
| C6 | Original language and title (VO) toggle | Alex | J5 | #185 |

## Won't (this time)

| ID | Item | Why later | Issue |
|---|---|---|---|
| W1 | Suggestions engine | Server feature, own ADR | #160 |
| W2 | Children's ratings and overrides enforcement | Server feature, own ADR | #316 |
| W3 | Android TV shell itself | Native app, own spec | #417 |
| W4 | Phone remote pairing and command channel | Server feature, own spec | #418 |
| W5 | Home-automation scene | Outside the player | #419 |
| W6 | Google Cast and AirPlay | Third-party SDK, D6 kept it out | #202 |
| W7 | Switching audio during playback | New HLS session on the server | #424 |
| W8 | In cinemas rows and release tracking | Own epic | #195 |
| W9 | Request a title through Seerr | Own design branch | #128 |
| W10 | Light theme | D2 A, dark only | — |
| W11 | Native phone apps | Vision, v1 | — |
| W12 | Continuous themed channels | Own feature | #194 |
| W13 | Shared household list, follow an actor, release calendar | Own features | #192, #191, #190 |

## Effort check

Must: 1 + 1 + 3 + 2 + 3 + 3 + 2 + 3 + 2 + 2 + 1 + 2 + 2 = **27**. Should: 3 + 1 + 1 + 2 + 1 + 1
+ 1 + 2 + 1 + 1 = **14**. Must share: 27 / 41 = **66 %** — above the DSDM 60 % guide; the
owner accepted it on 2026-11-23: the Musts are today's features, already built once.
