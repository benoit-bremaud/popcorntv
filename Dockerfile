# syntax=docker/dockerfile:1.28
# check=error=true
# PopCornTV server image: builds the TypeScript workspace, ships only the runtime output,
# runs as a non-root user with FFmpeg available for transcoding.

FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS build
# better-sqlite3 is compiled from source when no prebuilt binary matches: node-gyp needs
# python3 + a C++ toolchain. Build stage only; the runtime image ships the .node binary.
# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter @popcorntv/server...
COPY packages/shared packages/shared
COPY apps/server apps/server
# --legacy: pnpm 10 only deploys injected workspaces by default; the workspace keeps plain
# links so edits to packages/shared are seen live in dev (no injected hard-link copies).
RUN pnpm --filter @popcorntv/server... build \
  && pnpm --filter @popcorntv/server --prod deploy --legacy /out

FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
# ffmpeg comes from Debian stable: pinned by the base image tag, patched by Dependabot bumps.
# `apt-get upgrade` (DL3005) is deliberate: the node base image lags Debian's security
# updates (17 fixed HIGH/CRITICAL CVEs in perl, pcre2, gnutls, libcap on 2026-10-23) and
# the weekly Trivy scan blocks on them; the upgrade is reproducible per base image digest.
# Keep while the base can lag Debian security (it did on 2026-10-23 and 2026-11-06);
# re-check on each base bump.
# hadolint ignore=DL3008,DL3005
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && apt-get install -y --no-install-recommends ffmpeg tini \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
COPY --from=build --chown=1000:1000 /out /app
RUN mkdir -p /app/data /app/media && chown 1000:1000 /app/data /app/media
USER 1000
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 MEDIA_ROOT=/app/media
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# tini as PID 1 forwards signals to Node and reaps any FFmpeg child left behind, whatever
# starts the container (compose, docker run, a homelab orchestrator).
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
