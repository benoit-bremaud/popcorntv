# syntax=docker/dockerfile:1.28
# check=error=true
FROM golang:1.27.4-alpine3.24@sha256:0a5f7fe796599ff487605987432e7619ae45beeb2fba4c2ce0b907879932aebf AS build
WORKDIR /src
ADD --checksum=sha256:8349498e14b9b5ae7cba3bd2547d1d45bb15f3195713778272b71542aebf5f3d https://api.github.com/repos/qdm12/gluetun/tarball/v3.41.3 /tmp/gluetun.tar.gz
RUN tar -xzf /tmp/gluetun.tar.gz --strip-components=1 -C /src
# Checked-in manifests replace upstream's to raise vulnerable modules; -mod=readonly pins them.
COPY deploy/local-retrieval/gluetun/go.mod deploy/local-retrieval/gluetun/go.sum ./
ENV CGO_ENABLED=0 GOMAXPROCS=2 GOTOOLCHAIN=local
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go test -mod=readonly ./internal/firewall/... ./internal/configuration/settings/... ./internal/wireguard/...
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -mod=readonly -trimpath -buildvcs=false \
    -ldflags="-s -w -X main.version=v3.41.3-popcorntv.2 -X main.commit=3d1e20c5551e9cae1f9d938dc7b7214a6987f27e" \
    -o /out/gluetun-entrypoint ./cmd/gluetun

FROM alpine:3.24.2@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
LABEL org.opencontainers.image.source="https://github.com/qdm12/gluetun" \
    org.opencontainers.image.revision="3d1e20c5551e9cae1f9d938dc7b7214a6987f27e" \
    org.opencontainers.image.version="v3.41.3-popcorntv.2"
# Root and NET_ADMIN are confined to the VPN appliance. The separate client is non-root.
# Only kernel WireGuard is supported. Stable Gluetun unconditionally probes OpenVPN's
# version; the compatibility alias reports its actual version without changing the tunnel.
# The pinned base predates fixed musl/zlib packages; upgrade before runtime qualification.
RUN apk upgrade --no-cache && \
    apk add --no-cache ca-certificates=20261020-r0 iptables=1.8.13-r0 \
    iptables-legacy=1.8.13-r0 tzdata=2026f-r0 openvpn=2.7.7-r0 \
    wireguard-tools-wg=1.0.20260223-r0 && \
    ln -s /usr/sbin/openvpn /usr/sbin/openvpn2.6 && mkdir /gluetun
COPY --from=build /out/gluetun-entrypoint /gluetun-entrypoint
# Root is required for the tunnel interface and firewall (ADR-0035, waiver re-check #456).
# hadolint ignore=DL3002
USER 0:0
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=12 CMD ["/gluetun-entrypoint", "healthcheck"]
ENTRYPOINT ["/gluetun-entrypoint"]
