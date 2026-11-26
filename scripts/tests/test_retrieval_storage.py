"""Check exclusive storage provisioning without allocating a real 100 GiB image in tests."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

import create_retrieval_storage as provisioner
import pytest
from create_retrieval_storage import create_storage
from retrieval_config import FREE_RESERVE, GIB, MAX_STORAGE, Refusal


def test_existing_storage_is_never_formatted(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "existing"
    target.mkdir()
    valuable = target / "retrieval.ext4"
    valuable.write_bytes(b"foreign-data")
    with pytest.raises(Refusal, match="storage_destination_exists"):
        create_storage(target, media_root="none")
    assert valuable.read_bytes() == b"foreign-data"


def test_insufficient_host_reserve_refuses_before_mutation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        shutil,
        "disk_usage",
        lambda path: shutil._ntuple_diskusage(
            MAX_STORAGE, 1, MAX_STORAGE + FREE_RESERVE - 1
        ),
    )
    target = tmp_path / "new"
    with pytest.raises(Refusal, match="host_storage_reserve"):
        create_storage(target, media_root="none")
    assert not target.exists()


def test_new_image_is_exclusive_private_and_allocated_before_format(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[str] = []
    monkeypatch.setattr(provisioner, "MAX_STORAGE", 65536)
    original_allocate = os.posix_fallocate
    monkeypatch.setattr(
        shutil,
        "disk_usage",
        lambda path: shutil._ntuple_diskusage(MAX_STORAGE * 2, 0, MAX_STORAGE * 2),
    )

    def allocate(descriptor: int, offset: int, length: int) -> None:
        assert os.fstat(descriptor).st_mode & 0o777 == 0o600
        assert offset == 0
        assert length == 65536
        original_allocate(descriptor, offset, length)
        events.append("allocated")

    def run(arguments: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        assert events == ["allocated"]
        assert arguments[:5] == ["mkfs.ext4", "-F", "-q", "-m", "0"]
        assert arguments[5:7] == [
            "-E",
            "nodiscard,lazy_itable_init=0,lazy_journal_init=0",
        ]
        assert Path(arguments[-1]).name == "retrieval.ext4"
        events.append("formatted")
        return subprocess.CompletedProcess(arguments, 0, "", "")

    monkeypatch.setattr(os, "posix_fallocate", allocate)
    monkeypatch.setattr(subprocess, "run", run)
    target = tmp_path / "new"
    create_storage(target, media_root="none")
    assert target.stat().st_mode & 0o777 == 0o700
    assert (target / "mount").is_dir()
    assert events == ["allocated", "formatted", "allocated"]


def test_format_failure_preserves_partial_owned_image(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        shutil,
        "disk_usage",
        lambda path: shutil._ntuple_diskusage(MAX_STORAGE * 2, 0, MAX_STORAGE * 2),
    )
    monkeypatch.setattr(os, "posix_fallocate", lambda *args: None)
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            args, 1, "", "categorical-not-shown"
        ),
    )
    target = tmp_path / "new"
    with pytest.raises(Refusal, match="storage_format_failed"):
        create_storage(target, media_root="none")
    assert (target / "retrieval.ext4").exists()
    assert not (target / "mount").exists()


def test_real_format_retains_reserved_blocks(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    size = 64 * 1024**2
    monkeypatch.setattr(provisioner, "MAX_STORAGE", size)
    target = tmp_path / "real-format"
    create_storage(target, media_root="none")
    image = target / "retrieval.ext4"
    assert image.stat().st_size == size
    assert image.stat().st_blocks * 512 >= size


def test_post_format_allocation_failure_preserves_image_without_ready_mount(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(provisioner, "MAX_STORAGE", 65536)
    attempts = 0
    original_allocate = os.posix_fallocate

    def allocate(descriptor: int, offset: int, length: int) -> None:
        nonlocal attempts
        attempts += 1
        if attempts == 2:
            raise OSError("controlled post-format allocation failure")
        original_allocate(descriptor, offset, length)

    monkeypatch.setattr(os, "posix_fallocate", allocate)
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, "", ""),
    )
    target = tmp_path / "partial"

    with pytest.raises(OSError, match="controlled post-format allocation failure"):
        create_storage(target, media_root="none")

    assert attempts == 2
    assert (target / "retrieval.ext4").stat().st_size == 65536
    assert not (target / "mount").exists()


@pytest.mark.parametrize(
    ("arguments", "expected"),
    [(["--size-gib", "20"], 20 * GIB), ([], None)],
)
def test_command_line_passes_the_requested_image_size(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    arguments: list[str],
    expected: int | None,
) -> None:
    seen: list[tuple[Path, str | None, int | None]] = []
    monkeypatch.setenv("MEDIA_ROOT", "/srv/media")
    monkeypatch.setattr(
        provisioner,
        "create_storage",
        lambda directory, *, media_root, size=None: seen.append(
            (directory, media_root, size)
        ),
    )
    monkeypatch.setattr(
        "sys.argv", ["create_retrieval_storage.py", str(tmp_path / "new"), *arguments]
    )
    assert provisioner.main() == 0
    assert seen == [(tmp_path / "new", "/srv/media", expected)]


@pytest.mark.parametrize("size_gib", ["2", "101", "0", "-1"])
def test_command_line_size_outside_the_bounds_writes_nothing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, size_gib: str
) -> None:
    target = tmp_path / "new"
    monkeypatch.setattr(
        "sys.argv", ["create_retrieval_storage.py", str(target), "--size-gib", size_gib]
    )
    assert provisioner.main() == 1
    assert not target.exists()


@pytest.mark.parametrize(
    ("relation", "reason"),
    [
        ("same", "storage_inside_media_root"),
        ("library_inside", "storage_inside_media_root"),
        ("destination_inside", "storage_inside_media_root"),
        ("undeclared", "media_root_undeclared"),
        ("empty", "media_root_undeclared"),
    ],
)
def test_destination_sharing_a_tree_with_the_library_creates_nothing(
    tmp_path: Path, relation: str, reason: str
) -> None:
    target = tmp_path / "new"
    library = {
        "same": str(target),
        "library_inside": str(target / "films"),
        "destination_inside": str(tmp_path),
        "undeclared": None,
        "empty": "",
    }[relation]
    with pytest.raises(Refusal, match=reason):
        create_storage(target, media_root=library)
    assert not target.exists()


def test_destination_beside_an_existing_library_is_created(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    library = tmp_path / "library"
    library.mkdir()
    monkeypatch.setattr(provisioner, "MAX_STORAGE", 65536)
    monkeypatch.setattr(
        shutil,
        "disk_usage",
        lambda path: shutil._ntuple_diskusage(MAX_STORAGE * 2, 0, MAX_STORAGE * 2),
    )
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(args, 0, "", ""),
    )
    target = tmp_path / "new"
    create_storage(target, media_root=str(library))
    assert (target / "mount").is_dir()


def test_mistyped_library_creates_nothing(tmp_path: Path) -> None:
    target = tmp_path / "new"
    with pytest.raises(Refusal, match="media_root_not_a_directory"):
        create_storage(target, media_root=str(tmp_path / "medai-typo"))
    assert not target.exists()


def test_command_line_without_a_declared_library_writes_nothing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "new"
    monkeypatch.delenv("MEDIA_ROOT")
    monkeypatch.setattr(
        "sys.argv", ["create_retrieval_storage.py", str(target), "--size-gib", "3"]
    )
    assert provisioner.main() == 1
    assert not target.exists()
