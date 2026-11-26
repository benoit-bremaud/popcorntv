# On-demand progressive retrieval — requirements

Epic [#306](https://github.com/benoit-bremaud/popcorntv/issues/306) redefined by the owner on
2026-11-23 ([#434](https://github.com/benoit-bremaud/popcorntv/issues/434)): a title is retrieved
when someone shows interest in it, starts as fast as possible and leaves the disk soon after.

- Status: accepted conception, not implemented.
- Replaces: the "every wishlisted title is searched daily and prepared in the background" model of
  [adaptive-wishlist-lifecycle.md](../architecture/specs/adaptive-wishlist-lifecycle.md)
  (§ Replaced items below).
- Contract: [on-demand retrieval spec](../architecture/specs/on-demand-retrieval.md);
  diagrams in [`diagrams/on-demand-retrieval/`](../architecture/diagrams/on-demand-retrieval/);
  decisions ADR-0043 to ADR-0047.
- Identifiers: REQ-43 onwards and NFR-16 onwards (REQ-38–42 and UC34 are reserved by #315,
  UC35–39 by the redesign).

## Why

The owner wants disk economy and an instant start, not a bulk pre-download of every wish. The
file exists on disk only while someone is about to watch it, is watching it, or has marked it as
a favourite.

## Actors

- **Viewer**: a signed-in adult account with a profile. Children are out of scope until #316.
- **Guest**: a viewer from another household, under a quota.
- **Owner**: configures limits and channels, supervises activity and statistics.
- **Source**: an external retrieval source reached through the VPN only (ADR-0034, ADR-0035 on
  the #315 branch).

## Use cases

| ID | Goal (actor-initiated) | Level | Slice |
|---|---|---|---|
| UC40 | Watch a title from its sheet (prefetch, filling Play button, progressive playback) | user goal | 1 (films) |
| UC41 | Follow an upcoming title (« À venir ») until a source appears | user goal | 3 |
| UC42 | Keep a favourite ready to start | user goal | 3 |
| UC43 | Choose another version of a title, degraded included | user goal | 1 |
| UC44 | Supervise retrieval (activity, disk, limits, statistics) | user goal | 4 |
| UC45 | Choose my notification channels | user goal | 3 |

Diagram and descriptions: [01-use-case](../architecture/diagrams/on-demand-retrieval/01-use-case.md).

## Functional requirements

### « À venir » (upcoming)

| ID | Requirement |
|---|---|
| REQ-43 | The wishlist is shown as « À venir » and holds only titles for which no source was found. A title leaves it once a source is found or once it is watched. An unreleased title shows its release date and a countdown; its search starts at release. |
| REQ-44 | A title in « À venir » is searched every 6 h during the first month after release, daily until 6 months, weekly after. Searches are serial and bounded; an outage of one source never drops the title. |
| REQ-45 | When a source appears, each profile that follows the title is notified once, through its chosen channels (REQ-59). A degraded-only source still notifies and says that it is degraded. |

### Prefetch and the Play button

| ID | Requirement |
|---|---|
| REQ-46 | Opening a film's sheet (web, TV, phone) starts a prefetch of its start buffer. A prefetch never played is purged 6 h after the sheet was last opened. |
| REQ-47 | The start buffer is the verified contiguous span from the start position that lets playback run without a stall at the measured download speed, with a 30 s floor and a per-title cap of min(1 GiB, 10 % of the file). When the cap is reached first, the button is full and the sheet says "playback may pause" (ADR-0044). |
| REQ-48 | The Play button keeps its label. Its background fills as the start buffer grows, with no text or percentage. The progress is exposed to assistive technologies (`role="progressbar"` value on the button's description). |
| REQ-49 | Clicking Play before the button is full gives this title top priority; the viewer stays on the sheet until playback starts. |

### Progressive playback

| ID | Requirement |
|---|---|
| REQ-50 | During playback the rest of the file is retrieved. Closing the player stops the retrieval and keeps the bytes already there. A seek into a missing part prioritises that part. Only verified bytes are ever served (ADR-0034 verified-read contract, kept). |
| REQ-56 | If the source or the VPN fails, the buffered part keeps playing, then playback pauses with a clear message, resumes by itself when the source returns and offers a Retry button. Nothing ever leaves the host outside the VPN. |

### Deletion and favourites

| ID | Requirement |
|---|---|
| REQ-51 | A retrieved title that is not a favourite is deleted 48 h after its last playback, whether it was finished or abandoned. Files under `MEDIA_ROOT` (the owner's own library) are never touched. A title being played is never deleted. |
| REQ-52 | Favourites are per profile. A title stays a favourite while at least one profile has it. On disk a favourite keeps only the first third of its file: adding a favourite retrieves that third at once; after a playback it is trimmed back to the first third 48 h after the last playback (ADR-0045). Removing the last favourite mark applies REQ-51; a third that was never played is deleted at once. |
| REQ-53 | The retrieval cache never exceeds min(owner value, cache usage + free space − 15 % of the volume), owner value 100 GiB by default. Under pressure: first the unplayed prefetches (oldest first), then the titles awaiting their 48 h (oldest last playback first), then new prefetches are refused with a clear message. Favourite thirds and titles being played are never evicted. A playback with nothing left to evict releases the parts of its own title already played (never a favourite third); if that frees nothing, it pauses with a clear message (ADR-0044). |

### Quality and sources

| ID | Requirement |
|---|---|
| REQ-54 | The default quality is 720p; a profile may choose a higher one. The target version has the original audio, the French audio and French subtitles. The best conforming version is picked automatically; an "Other versions" menu lists the rest. A non-conforming version is shown as degraded with its reasons (for example 360p, original audio only) and is played only on an explicit choice. Missing French subtitles are fetched as an external subtitle file, otherwise the version is degraded. Each profile has a default audio language (ADR-0046). |
| REQ-55 | A source is accepted only if it contains video and subtitle files and nothing else; any other file rejects the whole source. Every file is checked by ffprobe with the confined input of ADR-0028; nothing is executed. Among conforming sources the fastest one (measured speed, peers) wins. |

### Access, concurrency and quotas

| ID | Requirement |
|---|---|
| REQ-57 | Every request is served. Playback comes before prefetch; the bandwidth is shared under an owner cap (default 70 % of the link). A soft cap of about 3 simultaneous retrievals applies. Each account has a limit on active preparations (3 for the household, 2 for a guest by default, owner-adjustable). Guests may prefetch within their quota, after household playback. |
| REQ-58 | Only adult accounts trigger retrieval until #316 delivers child policies. Remote access through Tailscale follows the same rules. |

### Notifications, administration, statistics

| ID | Requirement |
|---|---|
| REQ-59 | The bell is always on. Web Push and e-mail are chosen per profile in its settings. E-mail is immediate or a daily digest. Push has quiet hours, 22:00–08:00 by default, adjustable (ADR-0047). |
| REQ-60 | The owner sees current activity (and may cancel it), disk usage, history and logs in the administration. |
| REQ-61 | A Statistics tab shows start time, stalls, prefetch hit rate, space saved, degraded picks, source success, VPN uptime and host load. Statistics are anonymous. The history is nominative and household members are informed of it. Detail is kept 90 days, monthly aggregates are kept. |
| REQ-62 | Cards show a favourite icon and at most one status badge, degraded before ready to watch (to validate in the #398 wireframes). |
| REQ-63 | One search bar lists the library first, then available titles, then upcoming ones (aligned with #396 views and #426). |

### Later slices (recorded, not in slice 1)

| ID | Requirement |
|---|---|
| REQ-64 | Series: the next episode is prefetched during playback; deletion and favourites apply per episode; a "next episode in 10 s" countdown with Cancel can be switched off per profile. |
| REQ-65 | On the phone, the sheet prefetches too and the button offers "Watch here" or "Watch on TV" (#417, #418). |

Deferred elsewhere: offline download on the phone (#432), skip intro and credits (#433), ratings
and a "For you" row (#160), child policies (#316).

## Non-functional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR-16 | On the Pi through the VPN: full button → first frame ≤ 3 s; immediate click → first frame ≤ 30 s at ≥ 20 Mb/s. | Owner-run staging measurement, recorded in Statistics |
| NFR-17 | Automated tests use synthetic or local fixtures only, offline and repeatable. Real-source runs happen on staging, run by the owner; an agent never triggers real retrieval. | Gate review |
| NFR-18 | Retrieval egress goes through the VPN only; Web Push and e-mail go to configured endpoints only; no profile name, wish or history ever reaches a source. | Data-flow review, network test |
| NFR-19 | Retention: statistics anonymous; nominative history and detail 90 days; monthly aggregates kept; logs follow ADR-0021. | Repository tests |

## Delivery slices

1. **Films**: sheet prefetch → filling Play button → progressive playback → 48 h deletion →
   degraded choice (UC40, UC43; REQ-46–51, 53–58, NFR-16–18).
2. **Series**: REQ-64.
3. **« À venir », favourites, notifications**: UC41, UC42, UC45; REQ-43–45, 52, 59.
4. **Administration and statistics**: UC44; REQ-60, 61, NFR-19.

The UI of each slice is built on the redesign (#401) after the back-end, per the owner's order D
(MCDA 415/500): #306 conception → #306 back-end → redesign → #306 UI.

## Replaced items

| Old item | Replaced by | Note |
|---|---|---|
| UC32 Follow a title until it is playable | UC41, UC40 | No background preparation of every wish |
| UC33 Watch a prepared wishlist title | UC40 | Playback starts from the sheet, not from a ready notice |
| REQ-11 Daily search of every pending target | REQ-44 | Age-based cadence, « À venir » only |
| REQ-15 Full-file-only latch from sustained speed | REQ-47 | The start buffer absorbs slow sources; no latch |
| REQ-17 Ready state observed in the background | REQ-47, REQ-50 | No "ready" state; the button shows the start buffer |
| REQ-20 Ready transition notification | REQ-45 | Notify when a source appears |
| REQ-21 Ready notice opens playback | REQ-45, UC40 | The notice opens the sheet, which prefetches |
| REQ-22 No automatic deletion | REQ-51, REQ-52, REQ-53 | Deletion 48 h after last playback |
| REQ-24 Audio and subtitles required before ready | REQ-54 | Target kept; a degraded version can be chosen knowingly |
| REQ-25 Every wish triggers automatic preparation | REQ-46, REQ-57 | Interest = opening the sheet, under quotas |

Still valid: REQ-9, REQ-10 (shared retrieval across profiles), REQ-12, REQ-13, REQ-14, REQ-16,
REQ-18, REQ-19, REQ-23, REQ-26–29, NFR-5–10.
