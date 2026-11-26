#!/usr/bin/env python3
"""Prepare a new bounded filesystem image; never mount or replace an existing file."""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

from retrieval_config import (
    FREE_RESERVE,
    GIB,
    MAX_STORAGE,
    Refusal,
    reject_media_root,
)

LOGGER = logging.getLogger("retrieval")


def create_storage(
    directory: Path, *, media_root: str | None, size: int | None = None
) -> None:
    """Reserve a fresh bounded ext4 image without changing privileges.

    An exclusive directory and file prevent formatting existing data. Allocate real
    blocks before formatting so the accepted ceiling is reserved on the host too.
    Failure preserves owned partial state for diagnosis, never deletes another file.
    Mounting and changing ownership of the filesystem root are separate operator actions.
    Without an explicit size the image takes the whole accepted ceiling.
    The destination never shares a tree with the declared library (``media_root``).
    """
    if size is None:
        size = MAX_STORAGE
    elif not FREE_RESERVE < size <= MAX_STORAGE:
        raise Refusal("storage_image_size_out_of_bounds")
    if directory.absolute() != directory.resolve() or "$" in str(directory):
        raise Refusal("storage_destination_unsafe")
    reject_media_root(directory, media_root)
    if directory.exists() or directory.is_symlink():
        raise Refusal("storage_destination_exists")
    if shutil.disk_usage(directory.parent).free < size + FREE_RESERVE:
        raise Refusal("host_storage_reserve")
    directory.mkdir(mode=0o700)
    image = directory / "retrieval.ext4"
    descriptor = os.open(image, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        os.posix_fallocate(stream.fileno(), 0, size)
        os.fsync(stream.fileno())
    # Lazy first-mount inode zeroing can punch holes through a loop backing file.
    result = subprocess.run(
        [
            "mkfs.ext4",
            "-F",
            "-q",
            "-m",
            "0",
            "-E",
            "nodiscard,lazy_itable_init=0,lazy_journal_init=0",
            str(image),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=60,
    )
    if result.returncode:
        raise Refusal("storage_format_failed")
    # Some filesystems reclaim zeroed ranges even with mke2fs discard disabled.
    # Re-reserve after formatting, then measure the actual allocated blocks.
    with image.open("r+b") as stream:
        os.posix_fallocate(stream.fileno(), 0, size)
        os.fsync(stream.fileno())
    if image.stat().st_blocks * 512 < size:
        raise Refusal("storage_reservation_lost")
    (directory / "mount").mkdir(mode=0o700)
    logging.getLogger("retrieval").info("retrieval.storage_prepared_mount_pending")


def main() -> int:
    """Prepare storage only after explicit invocation, reporting categorical failures."""
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--size-gib", type=int)
    args = parser.parse_args()
    try:
        create_storage(
            args.directory,
            media_root=os.environ.get("MEDIA_ROOT"),
            size=None if args.size_gib is None else args.size_gib * GIB,
        )
        return 0
    except Refusal as error:
        LOGGER.error("retrieval.refused reason=%s", error)
    except (OSError, subprocess.TimeoutExpired):
        LOGGER.error("retrieval.refused reason=storage_io")
    return 1


if __name__ == "__main__":
    sys.exit(main())
