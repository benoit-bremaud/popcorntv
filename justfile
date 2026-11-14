set shell := ["sh", "-eu", "-c"]

default: check

# Install the locked toolchain and hooks in this clone.
setup:
    mise install --locked
    mise x -- pnpm install --frozen-lockfile
    mise x -- uv sync --frozen --group ci
    mise x -- lefthook install

# Staged files only. Does not recursively invoke lefthook.
fast:
    python3 scripts/local-ci.py fast

# Full local pre-push checks, including real FFmpeg fixtures.
check:
    python3 scripts/local-ci.py check

# Exact clean published head, required checks, then trusted signed evidence.
gate base="origin/main":
    python3 scripts/local-ci.py gate {{quote(base)}}

# Signature/status verification and SHA-pinned merge under the gate's lock.
merge pr:
    python3 scripts/local-ci.py merge {{quote(pr)}}

# Build the corrected Radarr snapshot using a private, external license file.
discovery-build license:
    test -f {{quote(license)}}
    SIXLABORS_LICENSE_FILE={{quote(license)}} docker buildx bake --allow=fs.read={{quote(license)}} -f deploy/local-discovery/docker-bake.hcl radarr

# Initialize private local state; never configures an external source.
discovery-init:
    uv run --frozen --group ci python scripts/local_discovery.py init

# Scan and authenticate privately before publishing loopback administration ports.
discovery-start:
    uv run --frozen --group ci python scripts/local_discovery.py start

# Verify authenticated, empty configuration without rewriting owner edits.
discovery-status:
    uv run --frozen --group ci python scripts/local_discovery.py status

# Stop only the owned local installation; retain state and credentials.
discovery-stop:
    uv run --frozen --group ci python scripts/local_discovery.py stop
