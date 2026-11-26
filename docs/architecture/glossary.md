# Architecture glossary

Incremental glossary for adaptive wishlist design (#307), signed local gates (#329), local discovery (#327) and the front-end redesign (#396). Historical features and the separate #128 branch retain their own specifications; this is not a historical backfill.

| Term | Definition | Source |
|---|---|---|
| Bell and player | Existing browser UI responsibilities for private notices and playback handoff. | Adaptive wishlist specification §2–7 |
| Cache boundary | Confined temporary media access, resource admission and playback-lease protection; distinct from permanent media. | Adaptive wishlist specification §2–7 |
| Child account policy | Owner-controlled account restriction configured at invitation and enforced across profiles, acquisition and playback. | Adaptive wishlist spec §3 |
| D-pad | Arrow keys plus OK and Back on a TV remote or keyboard; every redesigned control is reachable with them. | Redesign brief § 5 |
| Download client | Engine that retrieves bytes, distinct from an indexer or publication source; initially qBittorrent, future second backend tracked by #325. | ADR-0034 |
| External recovery service | Configured retrieval engine behind server-owned boundaries; qBittorrent is first under ADR-0034, with future client diversity. | Adaptive wishlist specification §2–7 |
| Generation | Stable version of one preparation content/source attempt; restart and ordinary telemetry fluctuations do not change it. | Adaptive wishlist specification §2–7 |
| Indexer | Search/catalog service managed through Prowlarr; multiple configured indexers can reference the same upstream content. | REQ-28 / ADR-0034 |
| Local checks | Required verification commands executed on the owner's machine. | Accepted local gate design, REQ-30–33 |
| Local discovery services | Isolated Prowlarr/Radarr installation, initially empty and distinct from retrieval or playback. | Implemented #327 topology, REQ-34–37 |
| Local gate | Repository command that checks and attests one clean, origin-published commit. | Accepted local gate design, REQ-30–33 |
| Local operator | Owner administering private local service configuration; distinct from a PopcornTV viewer. | Implemented #327 topology, REQ-35 |
| Notification store | Existing private persisted notices extended with exact target/generation deduplication. | Adaptive wishlist specification §2–7 |
| Override | The owner's allowance of one title above a child account's rating, for that account only. | J8, #316 |
| Owner | Existing administrative role; viewer interest alone does not grant acquisition permission. | Adaptive wishlist specification §2–7 |
| Pairing | Linking a phone remote or a TV app to the viewer's account through the PopCornTV server, with a short-lived code. | Brief D6, #418, #200 |
| Persona | A short, evidence-tagged portrait of a household user the redesign serves (Alex, Léa, Monique). | Personas (#396) |
| Phone remote | A PopCornTV web screen on a phone that browses, picks and controls what the paired TV app shows. | Brief D6, #418 |
| Playback boundary | Authorized reader/session responsibilities for complete or verified partial media. | Adaptive wishlist specification §2–7 |
| Playback lease | Session-bound pin preventing cache replacement or eviction while content is consumed. | Adaptive wishlist specification §2–7 |
| Preparation | Persisted lifecycle for one movie or episode target, shared by interested profiles. | Adaptive wishlist specification §2–7 |
| Preparation coordinator | Proposed responsibility for due work, recovery reconciliation and persisted transitions. | Adaptive wishlist specification §2–7 |
| Prowlarr | Service centralizing configured indexers and synchronizing their settings to applications such as Radarr. | Implemented #327 topology, REQ-36 |
| Radarr | Movie-service search executor proposed for the future PopcornTV cadence; not the authority for local playability. | Implemented #327 topology, REQ-36 |
| Readiness policy | Pure decision from verified coverage, metadata, conservative throughput and resource evidence. | Adaptive wishlist specification §2–7 |
| Readiness snapshot | Generation-bound evidence of whether a target can currently start playback. | Adaptive wishlist specification §2–7 |
| Ready notification | Profile-specific historical notice that a preparation became ready; Play rechecks current readiness. | Adaptive wishlist specification §2–7 |
| Recovery boundary | Injected interface for the selected backend protocol, with a deterministic test double. | Adaptive wishlist specification §2–7 |
| Source candidate | Publication/content identity satisfying the accepted language, quality and format constraints. | Adaptive wishlist specification §2–7 |
| SSH signer | Existing or dedicated protected signing identity, authorized only through the trusted main-branch public signer file. | Accepted local gate design, REQ-31 |
| Trailer | A title's promotional video: a local file played in PopCornTV, or a remote video handed off to a personal device. | ADR-0040 |
| TV app | The thin Android TV application that shows the PopCornTV web app in a WebView. | Brief D6, #417 |
| Verified coverage | Byte/time regions confirmed readable by the recovery backend, not inferred from filesystem length. | Adaptive wishlist specification §2–7 |
| Viewer | Signed-in household user acting through an owned profile. | Adaptive wishlist specification §2–7 |
| Wishlist | Existing authenticated personal title interests and their private repository/API. | Adaptive wishlist specification §2–7 |
| Wishlist interest | A profile subscription to a movie/series title; distinct from a shared episode/movie preparation. | Adaptive wishlist specification §2–7 |
| « À venir » (upcoming) | The wishlist as shown since #434: titles for which no source was found yet. | REQ-43 |
| Degraded version | A version that misses part of the target (quality, original or French audio, French subtitles); played only on an explicit choice. | REQ-54, ADR-0046 |
| Favourite third | The first third of a favourite's file (bytes 0 … size / 3, whole pieces) kept on disk so it starts at once. | REQ-52, ADR-0045 |
| Global ceiling | min(owner value, free space − 15 % of the volume): the most the retrieval cache may hold. | REQ-53, ADR-0044 |
| Prefetch | Retrieval of the start buffer triggered by opening a title's sheet; purged 6 h after the last opening if unplayed. | REQ-46, ADR-0043 |
| Retrieved title | A title retrieved on demand into the retrieval cache, shared by profiles, with its own lifecycle. | On-demand retrieval spec § 2 |
| Start buffer | The verified contiguous span from the start position that lets playback run without a stall, floor 30 s, capped per title. | REQ-47, ADR-0044 |
