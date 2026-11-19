"""Exercise the Pi build command with a real Git archive and a Docker boundary fixture."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[2] / 'deploy/pi-staging/build-image.sh'
IMAGE_ID = 'sha256:' + 'a' * 64


class PiStagingBuildImageTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.git('init', '--quiet')
        (self.root / 'Dockerfile').write_text('FROM scratch\n')
        self.git('add', 'Dockerfile')
        self.git('-c', 'user.name=Build fixture', '-c',
                 'user.email=build@example.test', 'commit', '--quiet', '-m', 'fixture')
        self.revision = self.git('rev-parse', 'HEAD')
        self.version = self.revision[:12]
        self.archive = self.root / 'reviewed release.tar'
        self.git('archive', '--format=tar', f'--output={self.archive}', self.revision)
        self.log = self.root / 'docker.jsonl'
        binaries = self.root / 'bin'
        binaries.mkdir()
        docker = binaries / 'docker'
        docker.write_text('''#!/usr/bin/env python3
import hashlib
import json
import os
from pathlib import Path
import sys

arguments = sys.argv[1:]
if any(key in os.environ for key in ('BUILDX_BUILDER', 'DOCKER_CONTEXT', 'DOCKER_HOST')):
    sys.exit('unexpected Docker context')
invocation = {'args': arguments}
if arguments[2] == 'build':
    invocation['archive'] = hashlib.sha256(sys.stdin.buffer.read()).hexdigest()
    iidfile = arguments.index('--iidfile') + 1
    Path(arguments[iidfile]).write_text(os.environ['FIXTURE_BUILT_ID'])
    arguments[iidfile] = '<build-id-file>'
with open(os.environ['FIXTURE_LOG'], 'a') as log:
    print(json.dumps(invocation), file=log)
if arguments[2:4] == ['image', 'inspect']:
    if os.environ.get('FIXTURE_INSPECT_FAIL') == '1':
        sys.exit(1)
    print(os.environ['FIXTURE_IMAGE'])
''')
        docker.chmod(0o700)
        self.image = {
            'Id': IMAGE_ID,
            'Os': 'linux',
            'Architecture': 'arm64',
            'Config': {
                'Labels': {'org.opencontainers.image.revision': self.revision},
                'Env': ['NODE_ENV=production', f'APP_VERSION={self.version}'],
            },
        }
        self.env = dict(
            os.environ, PATH=f'{binaries}:{os.defpath}', FIXTURE_LOG=str(self.log),
            FIXTURE_BUILT_ID=IMAGE_ID, BUILDX_BUILDER='unrelated', DOCKER_CONTEXT='unrelated', DOCKER_HOST='tcp://unrelated.invalid:2375',
        )

    def git(self, *args):
        return subprocess.check_output(
            ['git', *args], cwd=self.root, text=True, timeout=5,
        ).strip()

    def build(self, archive=None, extra=(), **observations):
        self.log.write_text('')
        return subprocess.run(
            ['sh', str(SOURCE), str(archive or self.archive), *extra],
            cwd=self.root, env=dict(self.env, FIXTURE_IMAGE=json.dumps(self.image), **observations),
            capture_output=True, text=True, timeout=5, check=False,
        )

    def test_builds_the_archived_commit_with_the_app_version_on_arm64(self):
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), IMAGE_ID)
        tag = f'popcorntv:git-{self.revision}-arm64'
        daemon = ['--host', 'unix:///var/run/docker.sock']
        self.assertEqual(
            [json.loads(line) for line in self.log.read_text().splitlines()],
            [
                {
                    'args': [*daemon, 'build', '--iidfile', '<build-id-file>', '--platform', 'linux/arm64',
                             '--label', f'org.opencontainers.image.revision={self.revision}',
                             '--build-arg', f'APP_VERSION={self.version}', '--tag', tag, '-'],
                    'archive': hashlib.sha256(self.archive.read_bytes()).hexdigest(),
                },
                {'args': [*daemon, 'image', 'inspect', '--format', '{{json .}}', IMAGE_ID]},
            ],
        )

    def test_uses_the_archive_commit_after_the_checkout_advances(self):
        self.git('-c', 'user.name=Build fixture', '-c',
                 'user.email=build@example.test', 'commit', '--quiet', '--allow-empty',
                 '-m', 'later fixture commit')
        self.assertNotEqual(self.git('rev-parse', 'HEAD')[:12], self.version)
        result = self.build()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'APP_VERSION={self.version}', self.log.read_text())

    def test_refuses_a_caller_supplied_version_before_build(self):
        result = self.build(extra=('deadbeef1234',))
        self.assertEqual(result.returncode, 2)
        self.assertIn('Usage:', result.stderr)
        self.assertEqual(self.log.read_text(), '')

    def test_refuses_failed_image_inspection_without_printing_an_id(self):
        result = self.build(FIXTURE_INSPECT_FAIL='1')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, '')
        self.assertIn('artifact_version_unconfirmed', result.stderr)

    def test_refuses_an_archive_without_a_git_commit_before_build(self):
        invalid = self.root / 'invalid.tar'
        invalid.write_bytes(b'not a Git archive')
        result = self.build(archive=invalid)
        self.assertEqual(result.returncode, 2)
        self.assertIn('archive_revision_unconfirmed', result.stderr)
        self.assertEqual(self.log.read_text(), '')

    def test_refuses_a_built_image_that_falls_back_to_dev(self):
        self.image['Config']['Env'] = ['APP_VERSION=dev']
        result = self.build()
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, '')
        self.assertIn('artifact_version_unconfirmed', result.stderr)

    def test_refuses_a_built_image_that_claims_another_archived_revision(self):
        self.image['Config']['Labels']['org.opencontainers.image.revision'] = 'b' * 40
        result = self.build()
        self.assertEqual(result.returncode, 1)
        self.assertIn('artifact_version_unconfirmed', result.stderr)

    def test_refuses_an_amd64_image(self):
        self.image['Architecture'] = 'amd64'
        result = self.build()
        self.assertEqual(result.returncode, 1)
        self.assertIn('artifact_version_unconfirmed', result.stderr)
