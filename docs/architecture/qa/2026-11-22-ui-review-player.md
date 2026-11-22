# UI review — player — 2026-11-22

Complementary audit of the web player (`PlayerDialog`), the one surface the 2026-11-20 baseline
(#378) did not cover, run on real playback for the redesign framing (#395).

**URL / build:** Vite dev server on `apps/web` @ `493c080`, real API (`pnpm dev:server`), no TMDB
key · **Tool:** Playwright MCP (Chromium 158) · **Widths:** 390 / 768 / 1440
**Mode:** Experience (watch) · **Invention level:** Extend (ADR-0004 "velvet house")

**Media:** three synthetic clips generated with FFmpeg on the workstation (test patterns, no
third-party content): one MP4 H.264 / AAC film (direct play), two MKV HEVC episodes with two AAC
tracks (English, French) and two SRT subtitle tracks. Choosing the French track forces HLS
(ADR-0019), so both playback modes were exercised.

## Decisions in conflict with doctrine (not defects)

| Choice | Conflicts with | Decided on | Source | Reopen? |
|---|---|---|---|---|
| Native `<video controls>` instead of custom controls | House control sizes, a consistent keyboard map | 2026-10-23 | ADR-0005 (`PlayerDialog` on the native `<video controls>`) | Yes, in the redesign (brief D5) |
| *Next episode* is one button, no countdown | Benchmark (Netflix, Apple TV auto-advance) | 2026-10-24 | ADR-0007 (one button chosen over timers and focus management) | Yes, in the redesign |
| Audio track chosen in the detail dialog, before Play | In-player track switching (every benchmark product) | 2026-11-07 | ADR-0019 ("switching mid-play is a later improvement") | Yes, in the redesign |

## Scores

| Dimension | Score /5 | Evidence |
|---|---|---|
| Hierarchy | 2 | `player-direct-1440.png`: the picture fills the screen, but nothing says what is playing (no title, no episode); the only custom control is a close glyph |
| Typography | 3 | Only two texts of our own: *Preparing playback…* (`--text-sm`) and the *Next episode* button; native control text is the browser's |
| Layout and rhythm | 3 | Full viewport, `object-fit: contain` keeps the ratio at all widths; the page scrollbar stays visible beside the player (`player-direct-1440.png`, `player-hls-390.png`) |
| Colour and contrast | 3 | The close button background `rgba(14, 11, 13, 0.8)` disappears on the black letterbox and is half hidden by the picture (top right of `player-direct-1440.png`) |
| States | 2 | Starting is plain text, error is a sentence with no title and no *Try again*, *busy* offers no action; no buffering state of our own |
| Motion | 4 | One `fade` on open and on *Next episode*; reduced motion keeps fades (decided in ADR-0004 v2) |
| Accessibility | 2 | Focus opens on *Close player*: <kbd>Space</kbd> closes the player instead of pausing; focus falls to `<body>` after closing; *Next episode* 40 px high |
| Content resilience | 2 | At 390 px portrait the video sits in the middle with 60 % empty height and the subtitle cue touches the bottom edge (`player-hls-390.png`); a series without TMDB titles shows *Next episode: Test Show* (series title, not the episode) |
| AI tells | not checked | No layout of our own to judge |
| **Total** | **21 / 40** | 8 dimensions scored, same basis as the 25 / 40 baseline |

Measured at 1440 × 900: dialog and video 1425 × 900 (the remaining 15 px is the page scrollbar),
close button 44 × 44 at (1369, 12), *Next episode* 254 × 40 at (1155, 796). At 390 × 844: video
375 × 844, document width 375, no horizontal overflow.

## Findings

| # | Severity | Dimension | Evidence | Finding | Proposed fix |
|---|---|---|---|---|---|
| 1 | Must | Accessibility | Keyboard run: Play → <kbd>Space</kbd> → player closed | Initial focus is the close button, so the universal pause key closes the player and ends the session | Focus the video (or the player surface) on open; keep *Close* reachable by <kbd>Tab</kbd>, <kbd>Escape</kbd> and Back |
| 2 | Should | Accessibility | After <kbd>Escape</kbd>, `document.activeElement` is `BODY` while the detail dialog is still open | Focus is not returned to the control that opened the player | Return focus to *Play* / *Resume* on close (or to the episode button) |
| 3 | Should | Accessibility | No `keydown` handler in `PlayerDialog.tsx`; <kbd>F</kbd> did nothing, <kbd>→</kbd> moved about 1 s in Chromium | The keyboard map is whatever the browser's native controls do, which differs between Chromium, Firefox, Safari and TV browsers; no ±10 s skip, no fullscreen or mute key | One documented player key map (Space / K, ← →, ↑ ↓, F, M, C, Escape), aligned with the benchmark (Netflix, Jellyfin) |
| 4 | Should | Hierarchy | `player-hls-subtitles-1440.png` | No title, episode or time-left context in the player | Top bar with title and episode, shown with the controls, hidden with them |
| 5 | Should | States | `PlayerDialog.tsx` *starting* / *error* / *busy* branches | Starting shows plain text; error and busy show a sentence with no title, no *Try again* and no way to pick another copy | Designed loading, error and busy states with a primary action (retry, back to details) |
| 6 | Should | Hierarchy | Detail dialog → Audio select; native menu ⋮ for captions | Audio is chosen only before Play; subtitles only through the browser's own menu, whose look and placement change by browser | In-player audio and subtitle panel; an audio change restarts the session at the current position (the "later improvement" of ADR-0019) |
| 7 | Should | Layout | `player-direct-1440.png`, `player-hls-390.png` | The page behind the modal keeps its scrollbar and can scroll during playback | Lock the document scroll while the player is open (`overflow: hidden` on the root, `scrollbar-gutter: stable`) |
| 8 | Should | Accessibility | `player-next-episode-1440.png` | *Next episode* is 40 px high (house size 44 px) and sits just above the native control bar | 44 px target, placed clear of the controls; the countdown question is a redesign decision (table above) |
| 9 | Nice | Colour | `player-direct-1440.png` top right | The close button background vanishes on black and is clipped by the picture; the glyph stays visible over the image when the native controls hide | Make it part of the player chrome, with the same auto-hide as the controls |
| 10 | Nice | Content resilience | `player-hls-390.png` | Subtitle cues use the browser default style and touch the bottom edge in portrait | Subtitle style tokens (size, background) via `::cue`, safe-area padding |
| 11 | Nice | States | Benchmark (Jellyfin, Plex, Infuse) | No seek preview, no skip intro / credits | Record as redesign backlog; both need server data (trickplay, segments) and their own ADR |

## Checks

- Run: direct play and HLS (French audio) at 1440; HLS at 768 and 390; French subtitles shown;
  resume (*Resume from 0:34* after closing at 34 s); *Next episode* offer at 90 %; keyboard:
  <kbd>Space</kbd> with focus on the video (pause, correct), <kbd>Space</kbd> on open (closes, finding
  1), <kbd>→</kbd>, <kbd>F</kbd>, <kbd>Escape</kbd> (closes, finding 2); server log events
  `playback.decision` and `playback.session.opened`.
- Not run: Firefox and WebKit (their native controls differ; findings 3 and 6 likely worse), a
  real touch device, a TV browser with a remote, a screen reader, the transcode-busy and failed
  states on a live server (read from the code), reduced motion (the player has two fades only),
  real artwork and episode titles (no TMDB key).

## Follow-up

- Findings feed the redesign brief ([04-redesign-brief.md](../../requirements/04-redesign-brief.md)
  D5) and the screen inventory (#396). Finding 1 is a defect on the shipped player; filing it as
  its own issue is proposed in the #395 pull request.
