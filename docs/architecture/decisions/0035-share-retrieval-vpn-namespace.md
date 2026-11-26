# Share the retrieval client's dedicated VPN namespace

Issue #328 uses a dedicated Gluetun/WireGuard namespace for the persistent local qBittorrent client.

## Status

Accepted by the owner in conversation on 2026-11-15: option A, following the
[weighted design comparison](../specs/nordvpn-retrieval.md#proposed-topology-decision).
Acceptance permits implementation; it does not claim image, runtime or deployment qualification.

## Context and decision

The host must retain its existing routes and Tailscale behavior. #308 established bounded
WireGuard evidence; #310's first adapter remains read-only. Put qBittorrent only in Gluetun's
network namespace, use the existing owner-supplied private WireGuard file and require
firewall/namespace verification plus a dedicated bounded retrieval filesystem.

The authoritative comparison has weights 35/20/15/15/10/5 and totals A 475, B 390,
C 145 out of 500. C is ineligible because host routing fails the dedicated-isolation
requirement. Halving/doubling evidence weight preserves A's lead; exact sensitivity results
and per-cell reasons remain in the linked specification to avoid duplicated calculations.

## Consequences and fallback

Gluetun is a privileged network appliance; the client remains non-root with no capabilities.
Namespace replacement recreates the client in order. No public acquisition or player
integration is enabled by installing the empty infrastructure. No broad LAN exception is allowed.
Initial administration can remain private through authenticated Docker-exec API control;
host-port publication stays disabled until its effective ingress is qualified.

B, Gluetun/OpenVPN (390/500), is the fallback if supported WireGuard qualification fails.
It needs a different protected credential input, device/permission review and protocol tests;
it is a design change, not an automatic runtime downgrade. If image or storage qualification
fails, refuse startup instead of falling back to host networking or an unbounded directory.

## Note — 2026-11-26

Epic #306 was redefined on 2026-11-23 as on-demand progressive retrieval. This decision
stands unchanged: the shared namespace and its kill switch are the retrieval egress that
REQ-56 and NFR-18 rely on, and the dedicated filesystem holds the cache capped by ADR-0044
(100 GiB by default, the provisioner's ceiling). The controller refuses a retrieval mount
that shares a tree with `MEDIA_ROOT`.
