# Redesign benchmark — Netflix, Apple TV, Plex, Jellyfin, Infuse

How five media products handle browsing, the detail view, trailers, the player, TV remotes and
profiles, and what PopCornTV should take or avoid, as input to the redesign brief (#395).

- Date: 2026-11-22 (desk research, sources read on that day).
- Scope: epic #401, phase 1. Feeds [04-redesign-brief.md](../../requirements/04-redesign-brief.md),
  the UX structure (#396) and the wireframes (#398).
- Rules: written findings and links only. No third-party screenshot is stored in this repository.
- Trust tags: **[v]** the source was read; **[u]** search snippet, forum post or indirect source,
  to re-check before a decision rests on it. Official pages of Plex support answered 403 and are
  therefore mostly **[u]**.

## 1. Trailers and previews (owner request 2026-11-22)

| Product | Preview on card hover / focus | Autoplay in the hero | *Trailer* button | Sound | Off switch | Trailer source |
|---|---|---|---|---|---|---|
| Netflix | Yes on web [u]; on TV a held focus starts a short preview (2024 test) [v] | Yes [v] | Not documented | Not documented; press reports intrusive sound [u] | *Autoplay previews*, per profile, Account › Profiles › Playback settings [v] | Own hosting [u] |
| Apple TV | Not documented | Yes, and spreading to more rows in 2026 [u] | Trailers listed in the app guide [v] | Separate *Autoplay Video Sound* setting, per device [v] | tvOS: Accessibility › Motion › *Auto-Play Video Previews* [v, press]; web: none, only pause / mute [u] | Apple [u] |
| Plex | Not found, including the 2025 redesign [u] | Not found | Extras and *Cinema Trailers* pre-roll [u] | Not documented | Per library [u] | Local trailer files; streamed extras with Plex Pass [u] |
| Jellyfin | No (core) | Plugins only [u] | Yes [u] | Not documented | Removing the `youtubePlayer` entry of `config.json`, off by default [v] | Local files (`trailers/` folder, `-trailer` suffix) [v]; remote YouTube / Vimeo trailers, which break when YouTube changes [u] |
| Infuse | Not documented | Not documented | Yes, since 7.5 (2023), a Pro feature [v] | Plays even with the mute switch on (7.5.1) [v] | Option to hide the button (7.5.3) [v]; parental controls apply (7.5.2) [v] | A streamed catalog of about 250,000 trailers; provider not named [v] |

Sources: Netflix [help 2102](https://help.netflix.com/en/node/2102),
[MacRumors 2024-06-06](https://www.macrumors.com/2024/06/06/netflix-tv-app-redesign/),
[What Hi-Fi](https://www.whathifi.com/news/netflix-now-lets-you-turn-off-those-annoying-autoplay-previews);
Apple [TV app guide](https://support.apple.com/guide/tvapp/welcome/web),
[autoplay settings](https://support.apple.com/guide/tvapp/atvbd0b95e5d/web),
[Six Colors 2026-07](https://sixcolors.com/post/2026/07/stop-previews-from-autoplaying-on-apple-tv/),
[9to5Mac 2026-03-19](https://9to5mac.com/2026/03/19/apples-tv-app-just-added-autoplaying-video-to-more-parts-of-the-app);
Plex [Cinema Trailers](https://support.plex.tv/articles/202934883-cinema-trailers-extras/),
[TechCrunch 2025-03-31](https://techcrunch.com/2025/03/31/streaming-service-plex-rolls-out-a-revamped-mobile-app);
Jellyfin [movies naming](https://jellyfin.org/docs/general/server/media/movies/),
[web config](https://jellyfin.org/docs/general/clients/web-config/),
[forum: TMDb trailers broken](https://forum.jellyfin.org/printthread.php?tid=11144);
Infuse [releases](https://firecore.com/releases), [product page](https://firecore.com/infuse),
[9to5Mac 2023-03-15](https://9to5mac.com/2023/03/15/infuse-update-apple-tv-trailers-more/).

Not documented anywhere read: the delay before a preview starts, and the default sound state.

## 2. Browse and detail

- **Netflix**: hero billboard, then horizontal rows (Continue watching first); landscape cards with
  the title in the artwork [u]. Hovering expands the card and pushes neighbours aside, animated with
  `transform` and `opacity` only [u]
  ([CSS-Tricks](https://css-tricks.com/?p=305681)). Netflix states that artwork drives most browsing
  attention and that a title gets a couple of seconds of consideration [u]
  ([Netflix: The power of a picture](https://about.netflix.com/news/the-power-of-a-picture)).
- **Apple TV**: hero with background video; Up Next row; the app guide covers trailers and skip
  intro [v] ([guide](https://support.apple.com/guide/tvapp/welcome/web)). Detail layout not sourced.
- **Plex** (2025 redesign): closer to a streaming service; Watchlist in the top navigation,
  favourite libraries get their own tab, detail pages gain title artwork [v]
  ([TechCrunch](https://techcrunch.com/2025/03/31/streaming-service-plex-rolls-out-a-revamped-mobile-app)).
- **Jellyfin**: home is ten per-user slots of section types (Continue watching, Next up, Latest
  media, library tiles…) [v]
  ([homesections.js](https://raw.githubusercontent.com/jellyfin/jellyfin-web/master/src/components/homesections/homesections.js));
  fifteen card shapes (portrait, backdrop, square, banner, each with a scrolling variant) [v]
  ([shape.ts](https://raw.githubusercontent.com/jellyfin/jellyfin-web/master/src/components/cardbuilder/utils/shape.ts)).
- **Infuse**: artwork, cast and ratings fetched automatically from TMDB [v]
  ([product page](https://firecore.com/infuse)).

## 3. Player

| Feature | Netflix | Apple TV | Plex | Jellyfin | Infuse |
|---|---|---|---|---|---|
| Web key map | Documented: Space / Enter, F, Esc, ← → 10 s, ↑ ↓ volume, M, S skip intro [v] | Not documented on web; TV ← → 10 s [u] | In-app list only [u] | Space / K, ← → / J L, ↑ ↓, F, M, G H subtitle offset, `,` `.` frame step, 0–9 seek to %, Home / End [v] | Not applicable (apps) |
| Skip intro / credits | Yes, key S [v] | Not found | Markers from the server; manual or automatic [u] | Media segments (intro, outro, recap, preview, commercial); per-type Skip / Ask / Nothing on Android TV, prompt times out after 8 s [v] | Automatic skipping; separate intro and credits settings (8.5.2) [v] |
| Next episode | Countdown; per-profile autoplay setting [u] | *Play Next Episode* toggle [v] | Not sourced | Next up row | Not sourced |
| Subtitle styling | Typeface, size, shadow, background [v] | Options in the guide [v] | Not sourced | Web styling settings; Android TV background and outline colours [v] | Background, opacity, HDR brightness [v] |
| Seek preview | Yes [u] | Not sourced | Not sourced | Trickplay, opt-in, keyframe mode about 100× faster [v] | Option to disable [u] |
| Picture-in-picture | Yes [u] | Yes [v] | Not sourced | Not sourced | Not sourced |

Sources: Netflix [shortcuts](https://help.netflix.com/en/node/24855),
[accessibility](https://help.netflix.com/en/node/116022); Apple
[guide](https://support.apple.com/guide/tvapp/welcome/web); Plex
[forum: player experience](https://forums.plex.tv/t/player-experience/857990); Jellyfin
[video controller](https://raw.githubusercontent.com/jellyfin/jellyfin-web/master/src/apps/legacy/controllers/playback/video/index.js),
[media segments](https://jellyfin.org/docs/general/server/metadata/media-segments),
[10.10 release](https://jellyfin.org/posts/jellyfin-release-10.10.0/),
[Android TV 0.18](https://jellyfin.org/posts/androidtv-v0.18.0/); Infuse
[releases](https://firecore.com/releases).

## 4. TV and remote (10-foot interface)

- **tvOS** [v] ([focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection),
  [remotes](https://developer.apple.com/design/human-interface-guidelines/remotes),
  [typography](https://developer.apple.com/design/human-interface-guidelines/typography)):
  directional focus reaches every element; selecting is a separate gesture; up to five states
  (unfocused, focused, highlighted, selected, unavailable); a focused item grows and must not crowd
  its neighbours; no pointer. Back goes to the parent screen in the app hierarchy, not to the
  previous screen. Text: 29 pt default, 23 pt minimum at 1080p.
- **Android TV** [v] ([layouts](https://developer.android.com/design/ui/tv/guides/styles/layouts),
  [design for TV](https://developer.android.com/design/ui/tv/guides/foundations/design-for-tv)):
  viewing distance about 3 m; 960 × 540 dp canvas for 1080p; about 5 % safe margin (the page gives
  two slightly different dp values); 12 columns; leave room for the focused card's growth; the TV is
  a shared screen, so be careful with personal data.
- **Jellyfin web** [v] ([keyboardNavigation.js](https://raw.githubusercontent.com/jellyfin/jellyfin-web/master/src/scripts/keyboardNavigation.js)):
  arrow and TV media keys drive navigation on its TV layout only.
- **Netflix TV** (2024 test) [v] ([MacRumors](https://www.macrumors.com/2024/06/06/netflix-tv-app-redesign/)):
  a focused tile expands in place; a top bar replaces the side menu.
- **WCAG 2.2** [v] ([target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)):
  24 × 24 CSS px is the AA floor; PopCornTV's house size is 44 px.

## 5. Profiles and accessibility

- **Netflix** [v] ([profiles](https://help.netflix.com/en/node/10421),
  [accessibility](https://help.netflix.com/en/node/116022)): up to five profiles, an avatar and a
  maturity level each, a Kids experience; audio description, subtitle styling, screen readers,
  voice. Maturity cannot be changed on a TV.
- **Apple TV** [v]: profiles and content restrictions in the guide; motion setting also stops
  previews.
- **Plex Home** [u] ([managed users](https://support.plex.tv/articles/203948776-managed-users/)):
  up to 15 members; restrictions by content rating.
- **Jellyfin** [v] ([users](https://jellyfin.org/docs/general/server/users/)): users can be hidden
  from the login screen; avatars and parental ratings not sourced.

## 6. Takeaways for PopCornTV

Adopt:

1. **A *Trailer* button in the detail view is the baseline**; any preview on hover or focus is a
   layer on top, never the only way in (four products of five have the button).
2. **Previews off by default or switchable per profile**, muted by default, with a separate sound
   switch, and **off under `prefers-reduced-motion`** (Netflix per-profile switch, Apple's sound and
   motion settings).
3. **Local trailers first** with the naming Plex and Jellyfin share (`trailers/`, `-trailer`): no
   third-party request, no breakage when YouTube changes. A remote trailer stays an explicit choice
   (ADR to come).
4. **One documented player key map** close to Netflix and Jellyfin: Space / K, ← → 10 s, ↑ ↓, F, M,
   C (captions), Escape.
5. **In-player audio and subtitle choice, and subtitle styling** (all five products).
6. **Next-episode with an optional countdown** and a profile setting, as Netflix and Apple do.
7. **TV: directional focus that reaches every control**, a visible growth on focus with room
   reserved for it, Back to the parent layer, a 5 % safe margin and text no smaller than about
   24 px at 1920 × 1080.
8. **Skip intro and seek previews** as later bricks: they need server data (segments, trickplay)
   and are opt-in in Jellyfin.

Avoid:

1. Previews that start with sound and cannot be switched off (Netflix complaints until 2020) [u].
2. A switch that covers only part of the app, or takes effect late (Apple, Netflix) [v].
3. Autoplay spreading to every row (Apple TV 2026) [u].
4. Depending on a remote trailer source that fails silently (Jellyfin plugins, Infuse missing
   trailers) [u] ([Firecore forum](https://community.firecore.com/t/trailers-are-unavailable/58290)).
5. Skip prompts that need hidden server data the owner never generated (Jellyfin) [u].

## Gaps

Plex official pages (403), Netflix and Apple detail-page layouts, preview delays and the default
sound state, Jellyfin avatars and parental ratings, and tvOS search input were not sourced. None
blocks the brief; re-check before the wireframes rely on them.
