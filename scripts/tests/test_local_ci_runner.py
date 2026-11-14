"""Check orchestration with real processes/locks and substituted external CLI boundaries."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import unittest

import test_local_ci_attest as attest_fixtures

SOURCE = Path(__file__).resolve().parents[1] / 'local-ci.py'


class RunnerTest(unittest.TestCase):
    def setUp(self):
        fixture = attest_fixtures.AttestationTest()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.fixture = fixture
        self.repo, self.env = fixture.repo, fixture.env
        self.scripts = self.repo / 'scripts'
        self.scripts.mkdir()
        (self.scripts / 'tests').mkdir()
        (self.scripts / 'tests/test_local_ci_fixture.py').write_text(
            'import unittest\nclass Fixture(unittest.TestCase):\n def test_boundary(self): self.assertTrue(True)\n')
        self.runner = self.scripts / 'local-ci.py'
        self.runner.write_text(SOURCE.read_text())
        (self.scripts / 'test-local-ci.py').write_text((SOURCE.parent / 'test-local-ci.py').read_text())
        (self.scripts / 'attest.sh').write_text((SOURCE.parent / 'attest.sh').read_text())
        (self.repo / '.nvmrc').write_text('22.23.4\n')
        self.log = fixture.root / 'commands.jsonl'
        self.env['CI_TEST_COMMAND_LOG'] = str(self.log)
        for name in ('node', 'pnpm', 'lefthook', 'shellcheck', 'gitleaks', 'osv-scanner', 'docker', 'make', 'sonar-scanner', 'ffmpeg'):
            path = fixture.bin / name
            path.write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
name=Path(sys.argv[0]).name
with Path(os.environ['CI_TEST_COMMAND_LOG']).open('a') as log:
 log.write(json.dumps([name,*sys.argv[1:]])+'\\n')
if '--version' in sys.argv or '-version' in sys.argv:
 print(os.environ.get('CI_TEST_NODE','v22.23.4') if name=='node' else '10.30.3')
if name=='pnpm' and '--reporter=json' in sys.argv:
 target=next(v.split('=',1)[1] for v in sys.argv if v.startswith('--outputFile='))
 skipped=int(os.environ.get('CI_TEST_SKIPPED','0'))
 Path(target).write_text(json.dumps({'success':True,'numTotalTests':1,'numPassedTests':1-skipped,'numPendingTests':skipped}))
if name=='pnpm' and 'playwright' in sys.argv:
 skipped=int(os.environ.get('CI_TEST_BROWSER_SKIP','0'))
 status='failed' if os.environ.get('CI_TEST_BROWSER_EXPECTED_FAIL') else 'passed'
 Path(os.environ['PLAYWRIGHT_JSON_OUTPUT_NAME']).write_text(json.dumps({'stats':{'expected':1,'skipped':skipped},'errors':[],
 'suites':[{'specs':[{'tests':[{'expectedStatus':status,'results':[{'status':status}]}]}]}]}))
sys.exit(1 if os.environ.get('CI_TEST_FAIL_TOOL')==name else 0)
''')
            path.chmod(0o755)
        for folder, package in (('packages/shared', '@popcorntv/shared'), ('apps/server', '@popcorntv/server'),
                                ('apps/web', '@popcorntv/web')):
            path = self.repo / folder
            path.mkdir(parents=True)
            (path / 'package.json').write_text(json.dumps({'name':package,'scripts':{'test':'vitest run'}}))
        fixture.git('add', '.')
        fixture.git('commit', '-m', 'ci(test): add runner fixture')
        fixture.git('push', 'origin', 'main')
        self.env['SONAR_TOKEN'] = 'fixture-only-not-a-real-secret'

    def run_recipe(self, *args, good=True, **env):
        result = self.fixture.command('python3', str(self.runner), *args, good=good, env=dict(self.env, **env))
        if not good:
            self.assertNotEqual(result.returncode, 0)
        return result

    def test_full_gate_runs_checks_then_publishes_real_signed_note(self):
        self.run_recipe('gate')
        head = self.fixture.git('rev-parse', 'HEAD').stdout.strip()
        self.fixture.attest('verify', 'gate', head)
        commands = [json.loads(line) for line in self.log.read_text().splitlines()]
        tests = next(c for c in commands if '--coverage' in c)
        self.assertIn('--maxWorkers=4', tests)
        self.assertIn('--allowOnly=false', tests)
        self.assertEqual(len([c for c in commands if '--coverage' in c]), 3)
        reports = list((self.repo / '.git/local-ci-runs').glob('*/result'))
        self.assertEqual(len(reports), 1)
        self.assertEqual(reports[0].read_text(), 'success\n')
        versions = json.loads((reports[0].parent / 'versions.json').read_text())
        self.assertEqual(set(versions), {'node', 'pnpm', 'python', 'git', 'ffmpeg', 'docker', 'sonar-scanner'})
        self.assertTrue(all(versions.values()))

    def test_failed_check_keeps_other_check_results_but_never_attests(self):
        self.run_recipe('gate', good=False, CI_TEST_FAIL_TOOL='osv-scanner')
        self.assertEqual(self.fixture.latest(), 'failure')
        self.assertIn('docker', self.log.read_text())
        self.assertNotIn('sonar.qualitygate.wait', self.log.read_text())

    def test_failed_pending_starts_no_checks(self):
        self.run_recipe('gate', good=False, CI_TEST_FAIL_STATE='pending')
        self.assertFalse(self.log.exists())
        self.assertEqual(json.loads(self.fixture.state.read_text()), [])

    def test_wrong_node_fails_before_checks(self):
        self.run_recipe('check', good=False, CI_TEST_NODE='v24.22.2')
        self.assertNotIn('typecheck', self.log.read_text())

    def test_successful_process_with_skipped_tests_refused(self):
        self.run_recipe('gate', good=False, CI_TEST_SKIPPED='1')
        self.assertEqual(self.fixture.latest(), 'failure')

    def test_successful_browser_process_with_skips_refused(self):
        self.run_recipe('gate', good=False, CI_TEST_BROWSER_SKIP='1')
        self.assertEqual(self.fixture.latest(), 'failure')

    def test_browser_expected_failure_cannot_count_as_passing(self):
        self.run_recipe('gate', good=False, CI_TEST_BROWSER_EXPECTED_FAIL='1')
        self.assertEqual(self.fixture.latest(), 'failure')

    def test_missing_expected_test_script_refused(self):
        path = self.repo / 'apps/server/package.json'
        path.write_text('{"name":"@popcorntv/server","scripts":{}}')
        self.run_recipe('check', good=False)

    def test_unsupported_base_and_invalid_pr_refused(self):
        for args in (('gate', 'HEAD'), ('merge', '0'), ('merge', '--admin')):
            with self.subTest(args=args):
                self.run_recipe(*args, good=False)
        self.assertFalse(self.log.exists())

    def test_gate_and_merge_share_real_repository_lock(self):
        spec = importlib.util.spec_from_file_location('fixture_local_ci', self.runner)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        previous = os.environ.copy()
        os.environ.update(self.env)
        try:
            with module.lock():
                for args in (('gate',), ('merge', '1')):
                    with self.subTest(args=args):
                        result = self.run_recipe(*args, good=False)
                        self.assertIn('holds the repository lock', result.stderr)
        finally:
            os.environ.clear()
            os.environ.update(previous)

    def test_partially_staged_file_refused(self):
        file = self.repo / 'space name.md'
        file.write_text('staged\n')
        self.fixture.git('add', str(file))
        file.write_text('different\n')
        self.run_recipe('fast', good=False)
        self.assertNotIn('prettier', self.log.read_text())

    def test_merge_uses_verified_head_and_canonical_host(self):
        self.run_recipe('gate')
        head = self.fixture.git('rev-parse', 'HEAD').stdout.strip()
        marker = self.fixture.root / 'merged'
        self.run_recipe('merge', '1', CI_TEST_PR_HEAD=head, CI_TEST_MERGED=str(marker))
        self.assertEqual(marker.read_text(), head)

    def test_move_after_verification_causes_sha_pinned_merge_failure(self):
        self.run_recipe('gate')
        head = self.fixture.git('rev-parse', 'HEAD').stdout.strip()
        marker = self.fixture.root / 'merged'
        self.run_recipe('merge', '1', good=False, CI_TEST_PR_HEAD=head,
                        CI_TEST_MERGED=str(marker), CI_TEST_MOVE_PR='1')
        self.assertFalse(marker.exists())

    def test_draft_pr_and_missing_gate_refuse_merge(self):
        head = self.fixture.git('rev-parse', 'HEAD').stdout.strip()
        marker = self.fixture.root / 'merged'
        self.run_recipe('merge', '1', good=False, CI_TEST_PR_HEAD=head,
                        CI_TEST_MERGED=str(marker), CI_TEST_DRAFT='1')
        self.run_recipe('merge', '1', good=False, CI_TEST_PR_HEAD=head,
                        CI_TEST_MERGED=str(marker))
        self.assertFalse(marker.exists())


if __name__ == '__main__':
    unittest.main()
