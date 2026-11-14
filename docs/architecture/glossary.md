# Architecture glossary

Incremental glossary for adaptive wishlist design (#307) and signed local gates (#329). Historical features and the separate #128 branch retain their own specifications; this is not a historical backfill.

| Term | Definition | Source |
|---|---|---|
| Bell and player | Existing browser UI responsibilities for private notices and playback handoff. | Adaptive wishlist specification §2–7 |
| Cache boundary | Confined temporary media access, resource admission and playback-lease protection; distinct from permanent media. | Adaptive wishlist specification §2–7 |
| Child account policy | Owner-controlled account restriction configured at invitation and enforced across profiles, acquisition and playback. | Adaptive wishlist spec §3 |
| Download client | Engine that retrieves bytes, distinct from an indexer or publication source; initially qBittorrent, future second backend tracked by #325. | ADR-0034 |
| External recovery service | Configured retrieval engine behind server-owned boundaries; qBittorrent is first under ADR-0034, with future client diversity. | Adaptive wishlist specification §2–7 |
| Generation | Stable version of one preparation content/source attempt; restart and ordinary telemetry fluctuations do not change it. | Adaptive wishlist specification §2–7 |
| Local checks | Required verification commands executed on the owner's machine. | Proposed local gate protocol, REQ-30–33 |
| Local gate | Repository command that checks and attests one clean, origin-published commit. | Proposed local gate protocol, REQ-30–33 |
| Indexer | Search/catalog service managed through Prowlarr; multiple configured indexers can reference the same upstream content. | REQ-28 / ADR-0034 |
| Notification store | Existing private persisted notices extended with exact target/generation deduplication. | Adaptive wishlist specification §2–7 |
| Owner | Existing administrative role; viewer interest alone does not grant acquisition permission. | Adaptive wishlist specification §2–7 |
| Playback boundary | Authorized reader/session responsibilities for complete or verified partial media. | Adaptive wishlist specification §2–7 |
| Playback lease | Session-bound pin preventing cache replacement or eviction while content is consumed. | Adaptive wishlist specification §2–7 |
| Preparation | Persisted lifecycle for one movie or episode target, shared by interested profiles. | Adaptive wishlist specification §2–7 |
| Preparation coordinator | Proposed responsibility for due work, recovery reconciliation and persisted transitions. | Adaptive wishlist specification §2–7 |
| Readiness policy | Pure decision from verified coverage, metadata, conservative throughput and resource evidence. | Adaptive wishlist specification §2–7 |
| Readiness snapshot | Generation-bound evidence of whether a target can currently start playback. | Adaptive wishlist specification §2–7 |
| Ready notification | Profile-specific historical notice that a preparation became ready; Play rechecks current readiness. | Adaptive wishlist specification §2–7 |
| Recovery boundary | Injected interface for the selected backend protocol, with a deterministic test double. | Adaptive wishlist specification §2–7 |
| Source candidate | Publication/content identity satisfying the accepted language, quality and format constraints. | Adaptive wishlist specification §2–7 |
| SSH signer | Existing or dedicated protected signing identity, authorized only through the trusted main-branch public signer file. | Proposed local gate protocol, REQ-31 |
| Verified coverage | Byte/time regions confirmed readable by the recovery backend, not inferred from filesystem length. | Adaptive wishlist specification §2–7 |
| Viewer | Signed-in household user acting through an owned profile. | Adaptive wishlist specification §2–7 |
| Wishlist | Existing authenticated personal title interests and their private repository/API. | Adaptive wishlist specification §2–7 |
| Wishlist interest | A profile subscription to a movie/series title; distinct from a shared episode/movie preparation. | Adaptive wishlist specification §2–7 |
