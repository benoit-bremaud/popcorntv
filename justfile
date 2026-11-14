set shell := ["sh", "-eu", "-c"]

default: check

# Install the locked toolchain and hooks in this clone.
setup:
    mise install --locked
    mise x -- pnpm install --frozen-lockfile
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
