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

Criteria and weights: household value (40), effort, 5 = small (25), needed for the
Jellyfin cut-over (25), risk and scope fit, 5 = safe (10). Total = 40·V + 25·E + 25·C +
10·R, out of 500.

| Item | Feature | Plex | Jellyfin | PopCornTV | V | E | C | R | Total |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Continue-watching row (in-progress titles, next episode) | yes | yes | missing — `GET /progress` exists, no row | 5 | 5 | 4 | 5 | **475** |
| 2 | Scheduled or watched-folder library scan | yes | yes | missing — manual scan only | 4 | 4 | 5 | 5 | **435** |
| 3 | Watched / unwatched marks, set by hand and at the end of playback | yes | yes | missing | 4 | 4 | 4 | 5 | **410** |
| 4 | Resume progress survives a file replaced on another path (Radarr upgrade, Tdarr remux) | yes | partial | missing — row cascades on media delete | 4 | 3 | 5 | 4 | **400** |
| 5 | Search by title and person | yes | yes | missing | 4 | 4 | 3 | 5 | **385** |
| 6 | Audio track choice (language) | yes | yes | missing — default track only | 4 | 3 | 4 | 4 | **375** |
| 7 | Database backup and restore | yes | yes | missing — SQLite file copied by hand | 3 | 4 | 3 | 5 | **345** |
| 8 | One-shot import of Jellyfin watch history | n/a | n/a | missing | 3 | 3 | 4 | 4 | **335** |
| 9 | Installable PWA and TV-friendly (D-pad) navigation | apps | apps | missing — desktop web only | 4 | 2 | 3 | 3 | **315** |
| 10 | Background scan with progress in the UI | yes | yes | missing — scan request blocks | 3 | 3 | 2 | 4 | **285** |
| 11 | Parental rating limit per profile | yes | yes | missing | 3 | 3 | 2 | 4 | **285** |
| 12 | TMDB collections (sagas) | yes | yes | missing | 2 | 4 | 1 | 5 | **255** |
| 13 | Hardware-accelerated transcoding | Plex Pass | yes | missing — software only | 3 | 2 | 2 | 3 | **250** |
| 14 | Server dashboard: active streams, logs | yes | yes | partial — auth events only | 2 | 3 | 1 | 4 | **220** |
| 15 | Trickplay seek thumbnails | yes | yes | missing | 2 | 2 | 1 | 4 | **195** |
| 16 | External subtitle sidecars (`.srt`) | yes | yes | out — D3 muxes them with Tdarr | 2 | 2 | 1 | 3 | **185** |
| 17 | Intro and credits skip | Plex Pass | plugin | missing | 2 | 1 | 1 | 3 | **160** |
| 18 | Music, photos, live TV, DLNA, plugins | yes | yes | out — excluded by the vision | 1 | 1 | 0 | 2 | **85** |

Sensitivity: cut-over at 40 and value at 25 gives item 1 460, item 2 450, item 4 415,
item 3 410, item 5 375, item 8 365, item 6 360; the top four stay the top four, item 4
moves above item 3 and item 8 above items 6 and 7. Cut-over need weighs most for items 2
and 4, which the homelab decisions D3 and D4 depend on.

## Recommended next bricks

1. Continue-watching row (#131).
2. Scheduled library scan (#132), followed by matrix item 10 if scans grow long.
3. Watched marks (#133).
4. Progress carried over by TMDB id, season and episode (#134) — Jellyfin cut-over gate.
5. Search (#135), then audio track choice (#136).
6. Backup (#137) and Jellyfin history import (#138) before the cut-over.

Items 9 to 17 stay unfiled until the cut-over is done; item 18 is out of scope.
