# syntax=docker/dockerfile:1.28
# check=error=true
FROM lscr.io/linuxserver/prowlarr:nightly-3.1.0.5792-ls31@sha256:93db99069c77a5a294f65fb4ec3978af15e9f8e2b5bd868261dc22974f4def1e
# Keep the reviewed application; correct the vulnerable native parser package only.
RUN apk add --no-cache --upgrade libxml2=2.13.9-r5
LABEL org.opencontainers.image.base.digest="sha256:93db99069c77a5a294f65fb4ec3978af15e9f8e2b5bd868261dc22974f4def1e" \
    io.popcorntv.libxml2="2.13.9-r5"
USER 1000:1000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=24 \
    CMD ["curl", "--fail", "--silent", "--max-time", "2", "http://127.0.0.1:9696/ping"]
