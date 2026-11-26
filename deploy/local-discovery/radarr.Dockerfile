# syntax=docker/dockerfile:1.28
# check=error=true
FROM mcr.microsoft.com/dotnet/sdk:11.0.100-alpine3.24@sha256:52556c0fb9d0f609ae9aeab9efeeba96f4acc2f7038f7696f2235ccbdbb8e290 AS source
WORKDIR /src
ADD --checksum=sha256:e64fd88a9cc31c7737b049b606bf412f6e7d9042d1c0c50e17f3862f9506a4fc https://api.github.com/repos/Radarr/Radarr/tarball/af772b051ac27a0615c7f8b7f78622b6dc183be0 /tmp/radarr.tar.gz
RUN tar -xzf /tmp/radarr.tar.gz --strip-components=1 -C /src

FROM source AS backend
# Rebuild the entire dependency graph, including its accurate dependency manifests.
RUN test "$(grep -c 'Include="SixLabors.ImageSharp" Version="3.1.12"' src/NzbDrone.Core/Radarr.Core.csproj)" = 1 \
    && sed -i 's/Include="SixLabors.ImageSharp" Version="3.1.12"/Include="SixLabors.ImageSharp" Version="3.2.0"/' src/NzbDrone.Core/Radarr.Core.csproj
RUN --mount=type=secret,id=sixlabors,required=true \
    dotnet publish src/NzbDrone.Console/Radarr.Console.csproj \
    -c Release -f net10.0 -r linux-musl-x64 --self-contained true \
    -p:RuntimeIdentifiers=linux-musl-x64 -p:Platform=Posix -p:SolutionDir=/src/src/ \
    -p:AssemblyVersion=7.0.3.10912 -p:AssemblyConfiguration=popcorntv-local \
    -p:Deterministic=true -p:SixLaborsLicenseFile=/run/secrets/sixlabors -o /out \
    && dotnet publish src/NzbDrone.Mono/Radarr.Mono.csproj \
    -c Release -f net10.0 -r linux-musl-x64 --self-contained true \
    -p:RuntimeIdentifiers=linux-musl-x64 -p:Platform=Posix -p:SolutionDir=/src/src/ \
    -p:AssemblyVersion=7.0.3.10912 -p:AssemblyConfiguration=popcorntv-local \
    -p:Deterministic=true -p:SixLaborsLicenseFile=/run/secrets/sixlabors -o /out

FROM backend AS regression
RUN --mount=type=secret,id=sixlabors,required=true \
    dotnet test src/NzbDrone.Core.Test/Radarr.Core.Test.csproj \
    -c Release -f net10.0 -r linux-musl-x64 \
    --filter FullyQualifiedName~ImageResizerFixture \
    -p:RuntimeIdentifiers=linux-musl-x64 -p:Platform=Posix -p:SolutionDir=/src/src/ \
    -p:AssemblyVersion=7.0.3.10912 -p:AssemblyConfiguration=popcorntv-local \
    -p:Deterministic=true -p:SixLaborsLicenseFile=/run/secrets/sixlabors \
    --logger 'trx;LogFileName=imagesharp.trx' --results-directory /tmp/regression \
    && grep -q '<Counters total="2" executed="2" passed="2" failed="0"' /tmp/regression/imagesharp.trx

FROM node:26.13.0-trixie-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072 AS frontend
WORKDIR /src
COPY --from=source /src/ /src/
RUN corepack enable && corepack prepare yarn@1.22.22 --activate \
    && yarn install --frozen-lockfile --non-interactive --network-timeout 120000 \
    && yarn run build --env production

# The base supplies only the init and OS packages; its own .NET app (and the HIGH findings in its
# deps.json) is replaced below. Scan a base repin on the rebuilt image, never on the base alone.
FROM lscr.io/linuxserver/radarr:nightly-7.1.0.10947-ls36@sha256:943aa63178b50eb7489f66a1e850fdb60601c35b644cc2e5b6186a493e046fd0 AS runtime
# Preserve the vendor's init/native OS packages, replace its complete published app.
RUN rm -rf /app/radarr/bin && mkdir -p /app/radarr/bin
COPY --from=backend /out/ /app/radarr/bin/
COPY --from=frontend /src/_output/UI/ /app/radarr/bin/UI/
COPY --from=source /src/LICENSE /app/radarr/bin/LICENSE
LABEL org.opencontainers.image.source="https://github.com/Radarr/Radarr" \
    org.opencontainers.image.revision="af772b051ac27a0615c7f8b7f78622b6dc183be0" \
    io.popcorntv.radarr.imagesharp="3.2.0" \
    org.opencontainers.image.version="7.0.3.10912-popcorntv-local"
USER 1000:1000
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=24 \
    CMD ["curl", "--fail", "--silent", "--max-time", "2", "http://127.0.0.1:7878/ping"]
