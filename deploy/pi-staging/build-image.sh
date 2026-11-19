#!/bin/sh
# Build an ARM64 staging artifact from the reviewed Git archive.
set -eu

if [ "$#" -ne 2 ]; then
    printf '%s\n' 'Usage: sh deploy/pi-staging/build-image.sh <git-archive.tar> <trusted-sha256>' >&2
    exit 2
fi
archive=$1
expected_digest=$2

if [ ! -f "$archive" ] ||
    ! printf '%s\n' "$expected_digest" | LC_ALL=C grep -Eq '^[0-9a-f]{64}$'; then
    printf '%s\n' 'pi-staging.build_refused:archive_digest_unconfirmed' >&2
    exit 2
fi

# Verify and build the same private snapshot on the archive's filesystem.
umask 077
build_dir=$(mktemp -d "$(dirname -- "$archive")/.popcorntv-build.XXXXXXXX")
trap 'rm -f -- "$build_dir/release.tar" "$build_dir/image.id"; rmdir -- "$build_dir"' EXIT
snapshot="$build_dir/release.tar"
cp -- "$archive" "$snapshot"
digest=$(sha256sum < "$snapshot")
if [ "${digest%% *}" != "$expected_digest" ]; then
    printf '%s\n' 'pi-staging.build_refused:archive_digest_mismatch' >&2
    exit 2
fi

if ! revision=$(git get-tar-commit-id < "$snapshot") ||
    ! printf '%s\n' "$revision" | LC_ALL=C grep -Eq '^[0-9a-f]{40}([0-9a-f]{24})?$'; then
    printf '%s\n' 'pi-staging.build_refused:archive_revision_unconfirmed' >&2
    exit 2
fi
version=$(printf '%.12s' "$revision")
tag="popcorntv:git-$revision-arm64"

unset BUILDX_BUILDER DOCKER_CONTEXT DOCKER_HOST
docker_local() {
    docker --host unix:///var/run/docker.sock "$@"
}

docker_local build --iidfile "$build_dir/image.id" --platform linux/arm64 \
    --label "org.opencontainers.image.revision=$revision" \
    --build-arg "APP_VERSION=$version" --tag "$tag" - < "$snapshot" >&2

image_id=$(cat "$build_dir/image.id")
docker_local image inspect --format '{{json .}}' "$image_id" |
    python3 -c '
import json
import re
import sys

revision, version, built_id = sys.argv[1:]
try:
    image = json.load(sys.stdin)
    image_id = image["Id"]
    config = image["Config"]
    versions = [entry for entry in config["Env"] if entry.startswith("APP_VERSION=")]
    if (
        not re.fullmatch(r"sha256:[a-f0-9]{64}", image_id)
        or image_id != built_id
        or image["Os"] != "linux"
        or image["Architecture"] != "arm64"
        or config["Labels"]["org.opencontainers.image.revision"] != revision
        or versions != [f"APP_VERSION={version}"]
    ):
        raise ValueError("artifact mismatch")
except (AttributeError, KeyError, TypeError, ValueError):
    sys.exit("pi-staging.build_refused:artifact_version_unconfirmed")
print(image_id)
' "$revision" "$version" "$image_id"
