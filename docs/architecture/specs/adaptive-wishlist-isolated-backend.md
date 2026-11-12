# Adaptive wishlist — isolated backend execution plan

Prepare a real-client experiment for #308 without granting Internet access to the download clients.

## Concrete scope

The owner accepted the qBittorrent-first investigation and requested continued work after
raising NordVPN. The next executable experiment uses the exact qBittorrent image below,
two separate clients, synthetic content and a Compose `internal` network. It is not a public
acquisition stack. No NordVPN credential, host-route change or Pi deployment belongs to this run.

- File: `deploy/recovery-spike/compose.yml`, independent project `popcorntv-recovery-spike`.
- Exact image: `lscr.io/linuxserver/qbittorrent:5.3.0_v2.1.2-ls487@sha256:3d4c4545d51a690a0df15a2ff99038823a88a9822df8e794526447b9afbd7384`.
- Manifest inspected 2026-11-12: published `linux/amd64` and `linux/arm64` entries. Architecture availability is not Pi performance validation.
- Non-root clients, read-only root filesystems, all capabilities dropped, bounded memory/processes/CPU and logs, writable temporary runtime paths only.
- Separate private configuration/cache directories under a new OS temporary root. No host library, existing download configuration or Docker socket mounted into either container.
- No published ports or Internet network. Use `docker compose exec` for local API control.
- Disable DHT, peer exchange, local discovery and UPnP before the clients start. Add exactly the intended peer through the API. The torrent has only a synthetic single-file info dictionary, marked private and with no tracker.
- Generate separate temporary authentication credentials before boot. Persist a compatible password hash in each configuration, preventing automatic plaintext-password startup logs. Never print passwords or session cookies.
- The seed directory is read-only; the target cache is writable. Piece-state observations must be compared with actual bytes through the same mounted target data path before progressive feeding.
- Record versions, observed piece states, readable verified prefix, first decoded frame before completion, exact-reference comparison, and stop/restart behavior. No fake progress substitutes for backend telemetry.

## VPN design boundary

For a later Internet-facing client, proposed topology is qBittorrent sharing a dedicated
Gluetun network namespace with NordVPN egress; private application access stays on Tailscale.
This is distinct from the internal-only peer experiment: there is no Internet download traffic
in that experiment to protect with a commercial exit tunnel.

Published stable Gluetun manifest inspected on 2026-11-12:
`qmcgaw/gluetun:v3.41.3@sha256:fa19cc76b2af13d57a8d3dc3066f2ada061b1c761b8aecf989b3877c0486e027`.
The manifest includes amd64 and arm64, but this image has not been pulled, scanned or executed.
Do not treat this pin as a security approval or use `latest` as a substitute.

NordVPN's manual setup documentation now includes WireGuard. Credentials/configuration must
be supplied through local secret files, never the chat or repository. Actual secret presence,
protocol choice, limited local control access and fail-closed rules remain to validate. Do not
mount a VPN into the whole Pi or change host/Tailscale routes for this experiment.

Before allowing public acquisition, test Internet/DNS egress from the client's namespace,
loss of the tunnel, restart and recovery, including IPv6. Lack of tunnel must prevent public
traffic rather than falling back to the host route. No positive claim about those checks is
made by this Compose file.

## Planned execution and cleanup

Initialization creates only its own temporary root and configs. Pull the pinned qBittorrent
image, validate Compose, scan the actual image, then start only `seed` and `target` with a
bounded wait. Validate actual user/capabilities/network and discovery settings before adding
the synthetic torrent. Stop and remove only this experiment's containers/network afterwards;
remove only the initializer-owned temporary root. Do not prune images, shared volumes or
unrelated containers. No service auto-start or persistent deployment is installed.

A failed health check, unexpected Internet route, missing configuration or failed scan is a
reported blocker, not a reason to grant privileged mode, disable authentication or expand mounts.

## Sources

- [LinuxServer qBittorrent documentation](https://docs.linuxserver.io/images/docker-qbittorrent/): supported architecture, non-root and read-only operation.
- [Docker Compose](https://docs.docker.com/reference/compose-file/networks/): network isolation and volume controls, additionally checked through Context7 `/docker/compose`.
- [qBittorrent WebUI API](https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-%28qBittorrent-5.0%29): client control and telemetry.
- [NordVPN manual WireGuard](https://support.nordvpn.com/hc/en-us/articles/51264943286545-WireGuard-connection-on-NordVPN).
- [Gluetun NordVPN integration](https://github.com/qdm12/gluetun-wiki/blob/main/setup/providers/nordvpn.md).
