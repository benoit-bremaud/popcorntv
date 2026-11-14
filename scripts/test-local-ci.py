#!/usr/bin/env python3
"""Run required infrastructure tests, refusing empty, skipped and expected-failure suites."""
from pathlib import Path
import sys
import unittest

directory = Path(__file__).resolve().parent / 'tests'
suite = unittest.defaultTestLoader.discover(str(directory), pattern='test_local_ci*.py')
result = unittest.TextTestRunner(verbosity=1).run(suite)
complete = result.testsRun > 0 and not result.skipped and not result.expectedFailures
if not complete:
    print('local-ci: infrastructure tests must execute without skips or expected failures', file=sys.stderr)
sys.exit(0 if result.wasSuccessful() and complete else 1)
