# ADR-0038 — Play local trailers, hand remote ones off to a personal device

- Status: accepted (owner, 2026-11-23, #413)
- Date: 2026-11-23
- Deciders: owner
- Related: [brief](../../requirements/04-redesign-brief.md) D4, J3, NFR-14, D6; ADR-0029,
  ADR-0006; [benchmark](../specs/redesign-benchmark.md) § 1; issues #413, #417, #418, epic #401

## Context

The owner wants to watch a title's trailer from the selected poster (2026-11-22). The P1
interview asks for it **on request only**, never autoplayed (J3). Three facts frame the
choice:

- **Sources.** TMDB lists trailers as YouTube or Vimeo videos. ADR-0029 keeps every third-party
  stream out of PopCornTV, and NFR-14 forbids any run-time request to a host other than the
  PopCornTV server. Plex and Jellyfin also read local trailers next to the media (`trailers/`
  folder, `-trailer` suffix); Jellyfin's remote YouTube trailers break when YouTube changes
  (benchmark § 1).
- **Privacy-enhanced embeds are not private.** YouTube's privacy-enhanced mode
  (`youtube-nocookie.com`) only promises that the view does not personalise YouTube or its ads;
  it still needs YouTube hosts allowed, a `Referer` sent to YouTube, and YouTube's terms
  ([Google support 171780](https://support.google.com/youtube/answer/171780)).
- **The TV has no browser to hand off to.** D6 puts PopCornTV in a thin Android TV app built
  around a `WebView`. By default a `target="_blank"` link replaces the current page in that
  `WebView` instead of opening a window
  ([`setSupportMultipleWindows`](https://developer.android.com/reference/android/webkit/WebSettings#setSupportMultipleWindows(boolean))),
  and the Android TV quality guidelines forbid launching a browser app (TV-WB) while pointing
  to off-screen methods such as QR codes
  ([TV app quality](https://developer.android.com/docs/quality-guidelines/tv-app-quality)).

Autoplay evidence: in a field experiment with 76 Netflix users, turning autoplay off cut viewing
by 21.0 minutes a day on average and sessions by 17.6 minutes (Schaffner et al., CSCW 2025,
[arXiv 2412.16040](https://arxiv.org/abs/2412.16040)). The redesign keeps nothing playing with
sound unasked (brief G7).

## Options

- **A — Link**: a *Trailer* button opens the YouTube / Vimeo page in a new tab (ADR-0029
  pattern).
- **B — Embed**: a `youtube-nocookie.com` player in the detail view, loaded on an explicit click
  only (CSP `frame-src`, privacy notice).
- **C — Local only**: trailer files next to the media, played by PopCornTV's own player; no
  remote trailer.
- **D — Local first, remote handed off**: local trailers play in PopCornTV's player; when a title
  has none, the remote trailer is handed to a personal device — a link on a laptop or phone, a
  QR code (generated locally) on the TV, or *Open on my phone* once the phone remote (#418)
  exists. PopCornTV never loads the remote video itself.
- **E — None**: no trailer.

## Decision drivers and matrix

| Criterion | Weight | A Link | B Embed | C Local only | D Local + hand-off | E None |
|---|---:|---|---|---|---|---|
| Privacy, NFR-14 and ADR-0029 | 25 | 4 — leaves the app on a click | 1 — YouTube hosts inside the app | 5 | 5 — the remote video never loads in PopCornTV | 5 |
| Works on every D6 surface (TV `WebView`, phone remote, laptop) | 20 | 1 — replaces the app on the TV; browser launch forbidden | 3 — plays in a `WebView`, depends on YouTube's embed rules | 5 | 4 — QR on the TV, link elsewhere | 5 |
| Viewer experience (J3: decide without leaving the choice) | 20 | 2 — leaves the choice | 5 | 4 — in-app, preview on focus possible | 4 — in-app when local, one step out otherwise | 0 |
| Availability per title | 15 | 5 — most TMDB titles | 5 | 1 — only files the owner adds | 5 | 0 |
| Cost and breakage | 20 | 5 | 2 — CSP, notice, embed changes | 3 — scanner and player reuse | 2 — local, QR and link | 5 |
| **Total /500** | 100 | **335** | **300** | **380** | **400** | **325** |

Points: A = 100 + 20 + 40 + 75 + 100 · B = 25 + 60 + 100 + 75 + 40 · C = 125 + 100 + 80 + 15 + 60 ·
D = 125 + 80 + 80 + 75 + 40 · E = 125 + 100 + 0 + 0 + 100.

Sensitivity: C overtakes D only if availability weighs under about 10 (the trailer would then
exist only for the few titles with a local file); B ties D only if privacy weighs nothing,
which NFR-14 rules out.

## Decision

**D** (owner, 2026-11-23).

- **Local trailer**: a file in a `trailers/` folder next to the media or named
  `<title>-trailer.<ext>` is a trailer of that title; it plays in PopCornTV's player (direct play
  or HLS, ADR-0005 / ADR-0006), muted until the viewer turns the sound on, never chained to the
  film.
- **Remote trailer**: the server reads the official trailer key from TMDB (server egress only, as
  today) and answers a URL pinned to `https://www.youtube.com/watch?v=` or `https://vimeo.com/`.
  The web app shows it as a link on a laptop or phone (`rel="noopener noreferrer"`, new tab) and
  as a locally generated QR code on the TV; *Open on my phone* is added with #418.
- **On request only**: the *Trailer* button in the detail view is the entry point. A muted
  preview on focus or hover is a per-profile setting, **off by default**, for local trailers only,
  and never under `prefers-reduced-motion`.
- **States to draw** (#398, #399): no trailer, local available, remote available, loading,
  playing, error, QR shown, reduced motion.

## Consequences

- No third-party request from PopCornTV at run time; NFR-14 holds.
- On the TV, a title without a local trailer costs the viewer a phone scan; the phone remote
  (#418) later makes it one press.
- Server work outside the redesign, tracked in #425: trailer detection in the scanner, the TMDB
  trailer key, and the trailer playback path.
- The ADR-0029 *Where to watch* links have the same TV problem (a new tab replaces the app in
  the `WebView`); they get the same QR hand-off in #423.
