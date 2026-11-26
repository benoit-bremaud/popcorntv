set shell := ["sh", "-eu", "-c"]

default: check

# Install the locked toolchain and hooks in this clone.
setup:
    mise install --locked
    mise x -- pnpm install --frozen-lockfile
    mise x -- uv sync --locked --group ci
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
    SIXLABORS_LICENSE_FILE={{quote(license)}} docker buildx bake --allow=fs.read={{quote(license)}} -f deploy/local-discovery/docker-bake.hcl radarr ingress radarr-regression

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

# Build the gateway from pinned sources for this host (amd64).
retrieval-build:
    docker buildx bake -f deploy/local-retrieval/docker-bake.hcl gluetun

# Export the ARM64 gateway image with the given buildx builder.
retrieval-build-arm64 builder:
    mkdir -p data/build-artifacts/local-retrieval
    docker buildx bake --builder {{quote(builder)}} -f deploy/local-retrieval/docker-bake.hcl gluetun-arm64

# Lint, type-check and unit-test the retrieval controller on synthetic fixtures only.
retrieval-check:
    uv run --frozen --group ci ruff check scripts/local_retrieval.py scripts/retrieval_config.py scripts/create_retrieval_storage.py scripts/retrieval_fault.py scripts/retrieval_f02.py scripts/tests/test_local_retrieval.py scripts/tests/test_retrieval_config.py scripts/tests/test_retrieval_storage.py scripts/tests/test_retrieval_fault.py scripts/tests/test_retrieval_f02.py scripts/tests/test_retrieval_runtime.py
    uv run --frozen --group ci ruff format --check scripts/local_retrieval.py scripts/retrieval_config.py scripts/create_retrieval_storage.py scripts/retrieval_fault.py scripts/retrieval_f02.py scripts/tests/test_local_retrieval.py scripts/tests/test_retrieval_config.py scripts/tests/test_retrieval_storage.py scripts/tests/test_retrieval_fault.py scripts/tests/test_retrieval_f02.py scripts/tests/test_retrieval_runtime.py
    uv run --frozen --group ci mypy --strict scripts/local_retrieval.py scripts/retrieval_config.py scripts/create_retrieval_storage.py scripts/retrieval_fault.py scripts/retrieval_f02.py
    uv run --frozen --group ci python scripts/check_python_tests.py -q --cov=retrieval_config --cov=local_retrieval --cov=retrieval_fault --cov=retrieval_f02 --cov=create_retrieval_storage --cov-branch --cov-report=xml:coverage/retrieval.xml --cov-fail-under=90 scripts/tests/test_local_retrieval.py scripts/tests/test_retrieval_config.py scripts/tests/test_retrieval_storage.py scripts/tests/test_retrieval_fault.py scripts/tests/test_retrieval_f02.py

# Check Docker inspection semantics on never-started containers; needs the local images.
retrieval-contract:
    uv run --frozen --group ci python scripts/check_python_tests.py -q scripts/tests/test_retrieval_runtime.py

# Print the F01 (gateway loss) fault plan; changes nothing.
retrieval-fault-plan:
    uv run --frozen --group ci python scripts/retrieval_fault.py

# Owner-run only: execute F01 against the owner's running installation.
retrieval-fault-f01 storage:
    uv run --frozen --group ci python scripts/retrieval_fault.py --storage {{quote(storage)}} --execute

# Print the F02 (blocked tunnel) fault plan; changes nothing.
retrieval-fault-f02-plan:
    uv run --frozen --group ci python scripts/retrieval_f02.py

# Owner-run only: execute F02 against the owner's running installation.
retrieval-fault-f02 storage:
    uv run --frozen --group ci python scripts/retrieval_f02.py --execute --storage {{quote(storage)}}

# Owner-run only: create private state from the owner's WireGuard file; starts nothing.
retrieval-init storage wireguard:
    uv run --frozen --group ci python scripts/local_retrieval.py init --storage {{quote(storage)}} --wireguard {{quote(wireguard)}}

# Owner-run only: scan the images, start the gateway, prove the tunnel, then the client.
retrieval-start storage:
    uv run --frozen --group ci python scripts/local_retrieval.py start --storage {{quote(storage)}}

# Verify the running installation without changing it.
retrieval-status storage:
    uv run --frozen --group ci python scripts/local_retrieval.py status --storage {{quote(storage)}}

# Stop the client, then the gateway; retain state and credentials.
retrieval-stop storage:
    uv run --frozen --group ci python scripts/local_retrieval.py stop --storage {{quote(storage)}}
