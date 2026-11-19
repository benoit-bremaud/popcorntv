#!/bin/sh
# Build an ARM64 staging artifact from the reviewed Git archive.
set -eu

if [ "$#" -ne 2 ]; then
    printf '%s\n' 'Usage: sh deploy/pi-staging/build-image.sh <git-archive.tar> <version>' >&2
    exit 2
fi
archive=$1
version=$2

case "$version" in
    ''|dev|[!a-zA-Z0-9]*|*[!a-zA-Z0-9.+_-]*)
        printf '%s\n' 'pi-staging.build_refused:invalid_version' >&2
        exit 2 ;;
esac
if [ "${#version}" -gt 64 ]; then
    printf '%s\n' 'pi-staging.build_refused:invalid_version' >&2
    exit 2
fi

if [ ! -f "$archive" ] || ! revision=$(git get-tar-commit-id < "$archive"); then
    printf '%s\n' 'pi-staging.build_refused:archive_revision_unconfirmed' >&2
    exit 2
fi
tag="popcorntv:git-$revision-arm64"

unset DOCKER_CONTEXT DOCKER_HOST
docker_local() {
    docker --host unix:///var/run/docker.sock "$@"
}

docker_local build --platform linux/arm64 \
    --label "org.opencontainers.image.revision=$revision" \
    --build-arg "APP_VERSION=$version" --tag "$tag" - < "$archive" >&2

docker_local image inspect --format '{{json .}}' "$tag" |
    python3 -c '
import json
import re
import sys

revision, version = sys.argv[1:]
try:
    image = json.load(sys.stdin)
    image_id = image["Id"]
    config = image["Config"]
    versions = [entry for entry in config["Env"] if entry.startswith("APP_VERSION=")]
    if (
        not re.fullmatch(r"sha256:[a-f0-9]{64}", image_id)
        or image["Os"] != "linux"
        or image["Architecture"] != "arm64"
        or config["Labels"]["org.opencontainers.image.revision"] != revision
        or versions != [f"APP_VERSION={version}"]
    ):
        raise ValueError("artifact mismatch")
except (AttributeError, KeyError, TypeError, ValueError):
    sys.exit("pi-staging.build_refused:artifact_version_unconfirmed")
print(image_id)
' "$revision" "$version"
