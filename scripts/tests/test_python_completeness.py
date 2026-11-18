"""Prove the CI completeness guard with real pytest subprocesses and tiny suites."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

RUNNER = Path(__file__).resolve().parents[1] / "check_python_tests.py"


@pytest.mark.parametrize(
    ("source", "extra", "expected"),
    [
        ("def test_ok(): assert 2 + 2 == 4\n", [], 0),
        ("def test_bad(): assert False\n", [], 1),
        ("", [], 5),
        ("import pytest\n@pytest.mark.skip\ndef test_skip(): pass\n", [], 1),
        ("import pytest\n@pytest.mark.xfail\ndef test_xfail(): assert False\n", [], 1),
        ("import pytest\n@pytest.mark.xfail\ndef test_xpass(): pass\n", [], 1),
        (
            "def test_ok(): pass\ndef test_other(): pass\n",
            ["-k", "test_ok"],
            1,
        ),
        ("def test_syntax(:\n", [], 2),
    ],
    ids=[
        "pass",
        "fail",
        "empty",
        "skip",
        "xfail",
        "xpass",
        "filtered",
        "collection-error",
    ],
)
def test_completeness_process(
    tmp_path: Path, source: str, extra: list[str], expected: int
) -> None:
    case = tmp_path / "test_fixture.py"
    case.write_text(source)
    result = subprocess.run(
        [sys.executable, str(RUNNER), "-q", "-c", "/dev/null", str(case), *extra],
        env=dict(os.environ, PYTEST_ADDOPTS="", PYTEST_DISABLE_PLUGIN_AUTOLOAD="1"),
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    assert result.returncode == expected, result.stdout + result.stderr
