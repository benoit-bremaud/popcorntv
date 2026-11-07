# Plex and Jellyfin parity

What PopCornTV still lacks to replace the homelab Jellyfin for a household, ranked by a
weighted decision matrix (MCDA), with the next-brick order (issue #62, 2026-11-07).

Scope stays the vision's: the owner's own files only. Download, indexer and request
sources are never integrated; Seerr setup is the owner's own job (#128 only links to it).

## Status on 2026-11-07

Done: library scan and web management (#3, #123), TMDB metadata (#4), catalog rows (#5),
direct play (#7), HLS transcode (#8, #74), resume and next episode (#9), profiles (#10),
embedded subtitles (#24), accounts, invitations, devices and auth events (#18, #73),
rate limit (#72), homelab deployment (#60).

Already filed, not re-ranked here: #124 fit / fill, #127 TMDB discover, #128 Seerr link,
#19 cast, #58 password reset by email, #59 TOTP.

## Matrix

Criteria and weights: household value (40), effort, 5 = small (25), needed before the
Jellyfin removal on bb-homelab, due 2026-11-21 (25), risk and scope fit, 5 = safe (10).
The homelab decisions D1–D4 of `02-homelab-ecosystem.md` are void for bb-homelab (its
2026-11-07 correction): files are added and replaced by hand, no Tdarr or Bazarr runs.
Total = 40·V + 25·E + 25·C + 10·R, out of 500.

| Item | Feature | Plex | Jellyfin | PopCornTV | V | E | C | R | Total |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Continue-watching row (in-progress titles, next episode) | yes | yes | missing — `GET /profiles/:profileId/progress` exists, no row | 5 | 5 | 4 | 5 | **475** |
| 2 | Scheduled or watched-folder library scan (files added by hand) | yes | yes | missing — manual scan only | 4 | 4 | 5 | 5 | **435** |
| 3 | Watched / unwatched marks, set by hand and at the end of playback | yes | yes | missing | 4 | 4 | 4 | 5 | **410** |
| 4 | Resume progress survives a file replaced by hand on another path | yes | partial | missing — row cascades on media delete | 4 | 3 | 5 | 4 | **400** |
| 5 | Search by title and person | yes | yes | missing | 4 | 4 | 3 | 5 | **385** |
| 6 | Audio track choice (language) | yes | yes | missing — HLS maps the first audio stream, direct play leaves it to the browser | 4 | 3 | 4 | 4 | **375** |
| 7 | Database backup and restore | yes | yes | done at homelab level — nightly `appdata-backup.sh`, ADR-0013 §4 | — | — | — | — | — |
| 8 | One-shot import of Jellyfin watch history | n/a | n/a | not needed — no Jellyfin history (#125 closed) | — | — | — | — | — |
| 9 | Installable PWA and TV-friendly (D-pad) navigation | apps | apps | missing — desktop web only | 4 | 2 | 3 | 3 | **315** |
| 10 | Background scan with progress in the UI | yes | yes | missing — scan request blocks | 3 | 3 | 2 | 4 | **285** |
| 11 | Parental rating limit per profile | yes | yes | missing | 3 | 3 | 2 | 4 | **285** |
| 12 | TMDB collections (sagas) | yes | yes | missing | 2 | 4 | 1 | 5 | **255** |
| 13 | Hardware-accelerated transcoding | Plex Pass | yes | missing — software only | 3 | 2 | 2 | 3 | **250** |
| 14 | Server dashboard: active streams, logs | yes | yes | partial — auth events and device sessions, no list of active streams | 2 | 3 | 1 | 4 | **220** |
| 15 | Trickplay seek thumbnails | yes | yes | missing | 2 | 2 | 1 | 4 | **195** |
| 16 | External subtitle sidecars (`.srt`) | yes | yes | missing — embedded tracks only (ADR-0009) | 3 | 2 | 2 | 3 | **250** |
| 17 | Intro and credits skip | Plex Pass | plugin | missing | 2 | 1 | 1 | 3 | **160** |
| 18 | Music, photos, live TV, DLNA, plugins | yes, no plugins | yes, DLNA as a plugin | out — excluded by the vision | 1 | 1 | 0 | 2 | **85** |

Sensitivity: removal need at 40 and value at 25 gives item 1 460, item 2 450, item 4 415,
item 3 410, item 6 375, item 5 370; the top four stay the top four, item 4 moves above
item 3 and item 6 above item 5.

## Recommended next bricks

1. Continue-watching row (#131).
2. Scheduled library scan (#132), followed by matrix item 10 if scans grow long.
3. Watched marks (#133).
4. Progress carried over by TMDB id, season and episode (#134) — needed before the Jellyfin removal.
5. Search (#135), then audio track choice (#136).

Items 7 and 8 need no brick (#137 and #138 were filed in error). Items 9 to 17 stay
unfiled until Jellyfin is removed; item 18 is out of scope.
