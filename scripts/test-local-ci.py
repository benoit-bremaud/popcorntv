#!/usr/bin/env python3
"""Run required infrastructure tests, refusing empty, skipped and expected-failure suites."""
import os
from pathlib import Path
import subprocess
import sys
import unittest

# Git hooks export repository-local variables. The suites initialize and
# configure their own repositories, so Git must discover each from its cwd.
local_git_variables = subprocess.check_output(
    ['git', 'rev-parse', '--local-env-vars'], text=True,
).splitlines()
for variable in local_git_variables:
    os.environ.pop(variable, None)

directory = Path(__file__).resolve().parent / 'tests'
suite = unittest.defaultTestLoader.discover(str(directory), pattern='test_local_ci*.py')
result = unittest.TextTestRunner(verbosity=1).run(suite)
complete = result.testsRun > 0 and not result.skipped and not result.expectedFailures
if not complete:
    print('local-ci: infrastructure tests must execute without skips or expected failures', file=sys.stderr)
sys.exit(0 if result.wasSuccessful() and complete else 1)
