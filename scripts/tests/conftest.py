"""Shared fixtures: keep every suite independent of the caller's shell environment."""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def no_declared_library(monkeypatch: pytest.MonkeyPatch) -> None:
    """Declare a host without a library unless a test sets ``MEDIA_ROOT`` itself."""
    monkeypatch.setenv("MEDIA_ROOT", "none")
