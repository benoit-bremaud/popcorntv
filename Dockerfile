# syntax=docker/dockerfile:1.28
# check=error=true
# PopCornTV image: builds the TypeScript workspace, ships the server runtime output and the
# web build (copied out by the deploy compose), runs as a non-root user with FFmpeg.

# Static FFmpeg build (#110): Debian's FFmpeg packages carry unfixed decoder CVEs on both
# Debian 12 and 13, and FFmpeg parses every media file. Upstream releases ship the fixes;
# Dependabot bumps this tag + digest. Trivy cannot see a static binary: see SECURITY.md.
FROM mwader/static-ffmpeg:9.0.2-1@sha256:f5d100184884eb3e82b0eb14bb5ebf98da99826ac824989720297fb9ef21c822 AS ffmpeg

FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6 AS build
# better-sqlite3 is compiled from source when no prebuilt binary matches: node-gyp needs
# python3 + a C++ toolchain. Build stage only; the runtime image ships the .node binary.
# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY patches patches
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @popcorntv/server... --filter @popcorntv/web...
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY apps/web apps/web
RUN pnpm --filter @popcorntv/server... build \
  && pnpm --filter @popcorntv/web build

# A clean production workspace preserves the lockfile and relative package links.
# Reuse the downloaded store and Node headers. Offline packaging cannot re-resolve
# versions through the registry, even if a dependency is missing from the store.
# Copy cached files directly across build layers to avoid overlay link copy-up.
RUN --network=none mkdir -p /out/apps/server /out/apps/web /out/packages/shared \
  && cp package.json pnpm-lock.yaml pnpm-workspace.yaml /out/ \
  && cp -R patches /out/ \
  && cp apps/server/package.json /out/apps/server/ \
  && cp apps/web/package.json /out/apps/web/ \
  && cp packages/shared/package.json /out/packages/shared/ \
  && npm_config_nodedir="/root/.cache/node-gyp/$(node -p process.versions.node)" \
    pnpm --dir /out --filter @popcorntv/server... install --prod --frozen-lockfile --offline \
      --package-import-method=copy \
  && cp -R apps/server/dist apps/server/drizzle /out/apps/server/ \
  && cp -R packages/shared/dist /out/packages/shared/ \
  && rm -r /out/apps/web /out/patches \
  && test -f /out/apps/server/drizzle/meta/_journal.json
WORKDIR /out/apps/server
RUN --network=none node --input-type=module -e 'import Database from "better-sqlite3"; import "@popcorntv/shared"; const db = new Database(":memory:"); if (db.prepare("SELECT 1 AS ready").get().ready !== 1) process.exit(1); db.close();' \
  && test -f /app/apps/web/dist/index.html \
  && test -f /app/apps/web/dist/404.html

FROM node:22.23.4-trixie-slim@sha256:be1e2a3dc2c4fd68cdfadad2a696a280e0d2749098bee509230174d72fb768c6
# `apt-get upgrade` (DL3005) is deliberate: the node base image lags Debian's security
# updates (17 fixed HIGH/CRITICAL CVEs in perl, pcre2, gnutls, libcap on 2026-10-23) and
# the weekly Trivy scan blocks on them; the upgrade follows the base image digest and the Debian archive of the build day.
# Keep while the base can lag Debian security (it did on bookworm on 2026-10-23 and
# 2026-11-06; trixie digest be1e2a3d had nothing to upgrade on 2026-11-07); re-check on
# each base bump.
# APT_UPGRADE_DATE busts this layer's cache: the gate passes the day's date, so a Debian fix
# published after the layer was first built still reaches the scanned image (#444).
ARG APT_UPGRADE_DATE=unset
# hadolint ignore=DL3008,DL3005
RUN echo "apt upgrade layer of ${APT_UPGRADE_DATE}" \
  && apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
# Fail the build if the binary drifts from the pinned release: a Dependabot bump of the
# ffmpeg tag fails here until a manual commit updates this version too (grouped PR
# included), after a look at the FFmpeg security page (#116). ffprobe ships from the same
# image. No pipe (DL4006).
RUN v="$(ffmpeg -hide_banner -version)" && v="${v#ffmpeg version }" && test "${v%% *}" = "9.0.2"
WORKDIR /app
COPY --from=build --chown=1000:1000 /out /app
# The web build ships in the same image so web and API versions never drift (ADR-0013); the
# reverse proxy serves it from a volume the compose `web-sync` service fills from /app/web.
COPY --from=build --chown=1000:1000 /app/apps/web/dist /app/web
# /app/cache exists so a fresh named volume mounted there (local staging) belongs to uid 1000.
RUN mkdir -p /app/data /app/cache /app/media /srv/web \
  && chown 1000:1000 /app/data /app/cache /app/media /srv/web
USER 1000
# The running build shown in the account menu (#162): the release tag, else the commit SHA,
# passed as `--build-arg APP_VERSION=$(git describe --tags --always)`.
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 MEDIA_ROOT=/app/media APP_VERSION=${APP_VERSION}
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# tini as PID 1 forwards signals to Node and reaps any FFmpeg child left behind, whatever
# starts the container (compose, docker run, a homelab orchestrator).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/server/dist/index.js"]
