"""Run pytest with a completeness guard; ignored or filtered cases are not success."""

from __future__ import annotations

import sys
from dataclasses import dataclass

import pytest


@dataclass(eq=False)
class CompleteSuite:
    """Require every collected case to pass once without deselection or xfail."""

    passed: int = 0
    incomplete: bool = False

    def pytest_deselected(self, items: list[pytest.Item]) -> None:
        """Filtering is inappropriate for the required complete CI suite."""
        self.incomplete = self.incomplete or bool(items)

    def pytest_runtest_logreport(self, report: pytest.TestReport) -> None:
        """Account for skipped setup and expected failures as well as call results."""
        if report.skipped or hasattr(report, "wasxfail"):
            self.incomplete = True
        if report.when == "call" and report.passed:
            self.passed += 1

    def pytest_sessionfinish(self, session: pytest.Session, exitstatus: int) -> None:
        """Preserve pytest failures and refuse successful but incomplete runs."""
        if exitstatus == 0 and (
            self.incomplete
            or session.testscollected < 1
            or self.passed != session.testscollected
        ):
            session.exitstatus = pytest.ExitCode.TESTS_FAILED
            sys.stderr.write("local-ci: Python suite empty, skipped or filtered\n")


def main(arguments: list[str]) -> int:
    """Run the explicit required suite with normal pytest exit semantics."""
    return int(pytest.main(arguments, plugins=[CompleteSuite()]))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
