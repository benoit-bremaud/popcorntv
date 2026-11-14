"""Verify real scanner/test-tool guarantees on small disposable fixtures."""
import json
import os
import shutil
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class RealToolTest(unittest.TestCase):
    def test_real_frozen_install_rejects_manifest_lock_mismatch_without_network(self):
        with tempfile.TemporaryDirectory(prefix='local-ci-lock-fixture-') as folder:
            root = Path(folder)
            package = root / 'package.json'
            package.write_text('{"private":true,"name":"local-ci-fixture","version":"1.0.0"}')
            initial = subprocess.run(['pnpm', 'install', '--lockfile-only', '--offline', '--ignore-scripts'],
                                     cwd=root, capture_output=True, text=True)
            self.assertEqual(initial.returncode, 0, initial.stderr)
            package.write_text('{"private":true,"dependencies":{"local-ci-nonexistent-fixture":"1.0.0"}}')
            result = subprocess.run(['pnpm', 'install', '--frozen-lockfile', '--offline', '--ignore-scripts'],
                                    cwd=root, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('ERR_PNPM_OUTDATED_LOCKFILE', result.stdout + result.stderr)

    def test_installed_hooks_reject_staged_secret_and_invalid_commit_message(self):
        with tempfile.TemporaryDirectory(prefix='local-ci-hook-fixture-') as folder:
            root = Path(folder)
            (root / 'scripts').mkdir()
            for name in ('local-ci.py', 'check-commit-msg.sh'):
                shutil.copyfile(ROOT / 'scripts' / name, root / 'scripts' / name)
            for name in ('justfile', 'lefthook.yml', '.nvmrc'):
                shutil.copyfile(ROOT / name, root / name)
            # Substitute the mise launcher boundary, retaining real just, lefthook and scanners.
            binary = root / 'bin'
            binary.mkdir()
            log = root / '.git/hook-calls.jsonl'
            launcher = binary / 'mise'
            launcher.write_text('#!/usr/bin/env python3\nimport json,os,sys\n'
                                'with open(os.environ["HOOK_TEST_LOG"],"a") as f: f.write(json.dumps(sys.argv[1:])+"\\n")\n'
                                'assert sys.argv[1:3]==["x","--"]\n'
                                'if sys.argv[3:]==["just","check"]: sys.exit(0)\n'
                                'os.execvp(sys.argv[3],sys.argv[3:])\n')
            launcher.chmod(0o755)
            env = dict(os.environ, GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1',
                       PATH=str(binary) + ':' + os.environ['PATH'], HOOK_TEST_LOG=str(log))
            def git(*args, expected=0):
                result = subprocess.run(['git', *args], cwd=root, env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
                return result
            git('init')
            git('config', 'user.name', 'Fixture')
            git('config', 'user.email', 'fixture@example.test')
            git('add', '.')
            git('commit', '-m', 'ci(test): initialize hook fixture')
            installed = subprocess.run(['lefthook', 'install'], cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(installed.returncode, 0, installed.stderr)
            secret = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'
            (root / 'fixture.txt').write_text('token="' + secret + '"\n')
            git('add', 'fixture.txt')
            rejected = git('commit', '-m', 'ci(test): reject staged fixture', expected=1)
            self.assertNotIn(secret, rejected.stdout + rejected.stderr)
            (root / 'fixture.txt').write_text('safe\n')
            git('add', 'fixture.txt')
            git('commit', '-m', 'invalid subject', expected=1)
            pushed = subprocess.run(['lefthook', 'run', 'pre-push'], cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(pushed.returncode, 0, pushed.stdout + pushed.stderr)
            calls = [json.loads(line) for line in log.read_text().splitlines()]
            self.assertEqual(calls.count(['x', '--', 'just', 'fast']), 2)
            self.assertEqual(calls.count(['x', '--', 'just', 'check']), 1)

    def test_real_unittest_wrapper_rejects_empty_skipped_and_expected_failure_suites(self):
        with tempfile.TemporaryDirectory(prefix='local-ci-python-fixture-') as folder:
            root = Path(folder)
            (root / 'tests').mkdir()
            shutil.copyfile(ROOT / 'scripts/test-local-ci.py', root / 'test-local-ci.py')
            variants = ('', '@unittest.skip("fixture")\n def test_fixture(self): pass',
                        '@unittest.expectedFailure\n def test_fixture(self): self.fail("fixture")',
                        'def test_fixture(self): pass')
            for index, body in enumerate(variants):
                with self.subTest(variant=index):
                    text = 'import unittest\nclass Fixture(unittest.TestCase):\n ' + (body or 'pass') + '\n'
                    (root / 'tests/test_local_ci_fixture.py').write_text(text)
                    result = subprocess.run(['python3', '-B', str(root / 'test-local-ci.py')],
                                            capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0 if index == 3 else 1, result.stderr)

    def test_real_gitleaks_refuses_staged_synthetic_secret_even_if_worktree_repaired(self):
        with tempfile.TemporaryDirectory(prefix='local-ci-secret-') as folder:
            root = Path(folder)
            def git(*args):
                subprocess.run(['git', *args], cwd=root, check=True, capture_output=True)
            git('init')
            fake = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'
            target = root / 'fixture.txt'
            target.write_text('github_token = "' + fake + '"\n')
            git('add', '.')
            target.write_text('repaired working file\n')
            result = subprocess.run(['gitleaks', 'git', '--staged', '--redact', '--no-banner'],
                                    cwd=root, text=True, capture_output=True)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertNotIn(fake, result.stdout + result.stderr)

    def test_real_vitest_exclusivity_rejected_and_skips_reported(self):
        with tempfile.TemporaryDirectory(prefix='local-ci-vitest-fixture-') as folder:
            root = Path(folder)
            (root / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
            config = root / 'vitest.config.mjs'
            config.write_text('export default {test:{include:["fixture.test.mjs"]}};\n')
            for modifier, expected_exit in (('only', 1), ('skip', 0), ('todo', 0)):
                with self.subTest(modifier=modifier):
                    source = 'import {test,expect} from "vitest";\n'
                    source += 'test("executed",()=>expect(2+2).toBe(4));\n'
                    source += 'test.' + modifier + '("incomplete",()=>expect(true).toBe(true));\n'
                    (root / 'fixture.test.mjs').write_text(source)
                    report = root / 'result.json'
                    report.unlink(missing_ok=True)
                    result = subprocess.run(['node', str(ROOT / 'node_modules/vitest/vitest.mjs'), 'run',
                                             '--root', str(root), '--config', str(config), '--maxWorkers=1',
                                             '--allowOnly=false', '--reporter=json', '--outputFile=' + str(report)],
                                            cwd=root, text=True, capture_output=True)
                    self.assertEqual(result.returncode, expected_exit, result.stdout + result.stderr)
                    data = json.loads(report.read_text())
                    self.assertNotEqual(data['numPassedTests'], data['numTotalTests'])


if __name__ == '__main__':
    unittest.main()
