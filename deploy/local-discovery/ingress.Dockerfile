# syntax=docker/dockerfile:1.28
# check=error=true
FROM golang:1.27.4-alpine3.24@sha256:0a5f7fe796599ff487605987432e7619ae45beeb2fba4c2ce0b907879932aebf AS build
WORKDIR /src
ADD --checksum=sha256:23ab43a740477cdfbcecb129010add212003a49089db9145f36e04227856625d https://api.github.com/repos/caddyserver/caddy/tarball/7ce9f0823762109fc67911f95f6af1a697345ab7 /tmp/caddy.tar.gz
RUN tar -xzf /tmp/caddy.tar.gz --strip-components=1 -C /src
ENV CGO_ENABLED=0 GOMAXPROCS=2 GOTOOLCHAIN=local
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -mod=readonly -trimpath -buildvcs=false \
    -ldflags="-s -w -X github.com/caddyserver/caddy/v2.CustomVersion=v2.12.0-dev-popcorntv-7ce9f08" \
    -o /out/caddy ./cmd/caddy

FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0
COPY --from=build /out/caddy /usr/bin/caddy
LABEL org.opencontainers.image.source="https://github.com/caddyserver/caddy" \
    org.opencontainers.image.revision="7ce9f0823762109fc67911f95f6af1a697345ab7"
USER 1000:1000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=24 \
    CMD ["wget", "--quiet", "--spider", "--timeout=2", "http://127.0.0.1:9696/.well-known/popcorntv-ingress-health"]
