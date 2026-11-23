# Redesign — screen inventory

Every screen of the redesigned front end with its states, surfaces and flows, so the wireframes
(#398), the design system (#399) and the implementation (#400) draw and build the same list.

- Status: **content validated** by the owner on 2026-11-23 (#396); paths and the S06 / S07
  grouping stay provisional until the tree test (#429).
- Date: 2026-11-23.
- Inputs: the UI audit of 2026-11-20 (19 entries; report in PR #402, open), the
  [MoSCoW](../../requirements/07-redesign-moscow.md), the
  [personas](../../requirements/06-personas.md), the
  [use cases](../diagrams/redesign/01-use-case.md), ADR-0040, ADR-0041.

## 1. From the audit's 19 entries to screens

The audit mixed screens and states. Here *no result* becomes a state of Search, *empty catalog*
and *server unreachable* become states of Home, and *Films A–Z* becomes the type list. The
redesign adds the trailer surface, the two TV pairing screens and the three phone remote
screens.

## 2. Cross-cutting states

Every screen is drawn and tested in these states unless the table says *n/a*:

| ID | State | Rule |
|---|---|---|
| X1 | Loading | Skeleton with the final layout, no bare "Loading…" (#389) |
| X2 | Error | Heading, plain cause, one recovery action |
| X3 | Server unreachable | Same as X2, with retry; no partial screen |
| X4 | Focus | Visible on every stop, never colour-only, never hidden by a sticky bar (WCAG 2.4.11) |
| X5 | Reduced motion | No travel or autoplay; fades only (G7) |
| X6 | French strings | Drawn with the longer French text (D3) |
| X7 | Sizes | 390, 768, 1440 and TV 1920 × 1080 with a 5 % safe margin and 28 px body (D1, NFR-15) |
| X8 | Role | Owner, viewer, child account: what each sees |

## 3. Screens

Path: ADR-0041, provisional until the validated tree. Surface: W web (phone, tablet, laptop),
T TV app (D6), P phone remote.

| ID | Screen | Path | Surface | Specific states | MoSCoW | Personas |
|---|---|---|---|---|---|---|
| S01 | Sign in | `/sign-in` | W, T | Wrong credentials, rate-limited, TV → offer S17 | M1 | All |
| S02 | First-run setup | hash link (#87) | W | Expired link | M1 | Alex |
| S03 | Redeem an invitation or reset link | hash link (#87) | W | Used or expired link, password rules | M1 | Monique |
| S04 | Who's watching | `/profiles` | W, T | One profile, many profiles, child account badge | M2 | All |
| S05 | Manage profiles | `/profiles/manage` | W, T | Add, rename, delete, last profile undeletable | M2 | Alex |
| S06 | Home | `/` | W, T | Populated; empty catalog (owner: add a library; viewer: ask the owner); no continue watching; reserved suggestions slot (C2); child account | M3 | All |
| S07 | Type list (films, series, documentaries A–Z, by genre) | `/films`, `/series`, `/documentaries` | W, T | One item, empty type, genre filter | M3 | All |
| S08 | Search | `/search?q=` | W, T, P | Empty query, results, no result, people results | M7 | Alex, Monique |
| S09 | Title details (film, series) | `/title/:kind/:id` | W, T, P | Several copies, audio and subtitle choice, watched, seasons and episodes, trailer states (§ 4), where to watch, own link, owner override control (C3), not in library | M5 | All |
| S10 | Player | `/play/:mediaId` | W, T | Starting, playing, paused, controls hidden, track panel, buffering, error, end screen, next episode offer, child end without chaining | M6, S9 | All |
| S11 | Trailer | inside S09 | W, T | Local playing, remote link (W), remote QR (T), none, error, child account: no remote link or QR (until #316) | S3 | Alex |
| S12 | Discover | `/discover` | W, T | Lists, search, TMDB unavailable, TMDB not configured (owner) | S4 | Alex |
| S13 | Discover title sheet | `/discover/:kind/:id` | W, T | Wished, available in my library, where to watch, my providers | S4, S5 | Alex |
| S14 | Notifications panel | panel | W, T | None, unread, read | S6 | Alex |
| S15 | Account menu | panel | W, T | Owner, viewer, version | S7 | All |
| S16 | Administration (libraries, accounts, devices, links, events) | `/admin/…` | W | Each tab empty, populated, confirm destructive actions, last owner protected | S8 | Alex |
| S17 | Connect this TV (code on the TV) | `/tv/connect` | T | Code shown, expired, connected | S2 | Léa, Monique |
| S18 | Pair a phone (code on the TV) | `/tv/pair` | T | Code and QR shown, paired, refused | S1 | Alex |
| R1 | Remote — pair | `/remote/pair` | P | Scan, type the code, refused, paired | S1 | Alex |
| R2 | Remote — browse and pick | `/remote` | P | Rows, search, title, "now on the TV" | S1 | Alex |
| R3 | Remote — control | `/remote/control` | P | Playing, paused, tracks, D-pad mode, TV offline | S1 | Alex |
| S19 | Not found | any unknown path | W | Server 404 page (ADR-0025) and in-app fallback to Home | M11 | All |

## 4. Trailer states (ADR-0040)

No trailer · local available · remote available · loading · playing (muted until the viewer
turns the sound on) · error · QR shown (TV) · reduced motion (no preview on focus) · child account (no
remote link or QR until #316). The preview
on focus is optional, off by default, local trailers only.

## 5. Flows

The flows the redesign must complete with arrows, OK and Back only (G4), and that the
prototype test (#411) samples from.

| ID | Flow | Screens | Activity / use case |
|---|---|---|---|
| F1 | Sign in | S01 → S04 | UC (auth) |
| F2 | Pick a profile | S04 → S06 | UC (profiles) |
| F3 | Resume from *Continue watching* | S06 → S10 | ACT-choose-a-title |
| F4 | Browse and open a title | S06 / S07 → S09 | ACT-choose-a-title |
| F5 | Search and open a title | S08 → S09 | ACT-choose-a-title |
| F6 | Play, pause, seek, change subtitles, close | S09 → S10 | ACT-play-and-resume |
| F7 | Watch a trailer | S09 → S11 | UC37 |
| F8 | Discover and wish a title | S12 → S13 | UC26 |
| F9 | See where to watch | S13 / S09 | UC27 |
| F10 | Open a notification | S14 → S09 | UC28 |
| F11 | Pair the phone and control the TV | S18 → R1 → R2 → R3 | ACT-pair-phone-remote |
| F12 | Connect a TV without typing | S17 | UC38 |
| F13 | Child watches an episode and stops | S04 → S06 → S10 | ACT-child-session |
| F14 | Owner adds a library and scans it | S16 | UC1 |
| F15 | Owner invites a relative | S16 | UC15 |
| F16 | Owner revokes a device | S16 | auth |
| F17 | Sign out | S15 → S01 | auth |
| F18 | Leave a dead link | S19 → S06 | ADR-0025 |
| F19 | Add a profile | S04 → S05 | UC (profiles) |

## 6. Open points

- D5 (player controls) is decided in #399; S10 lists the states any option must draw.
- Paths and the S06 / S07 grouping follow the tree test (information architecture § 5).
- #398 says "dedicated TV template"; D1 B keeps one layout with a TV breakpoint (X7).
