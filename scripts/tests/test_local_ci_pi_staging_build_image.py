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
        self.version = self.git('describe', '--tags', '--always', self.revision)
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
import sys

arguments = sys.argv[1:]
if 'DOCKER_CONTEXT' in os.environ or 'DOCKER_HOST' in os.environ:
    sys.exit('unexpected Docker context')
invocation = {'args': arguments}
if arguments[2] == 'build':
    invocation['archive'] = hashlib.sha256(sys.stdin.buffer.read()).hexdigest()
with open(os.environ['FIXTURE_LOG'], 'a') as log:
    print(json.dumps(invocation), file=log)
if arguments[2:4] == ['image', 'inspect']:
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
            DOCKER_CONTEXT='unrelated', DOCKER_HOST='tcp://unrelated.invalid:2375',
        )

    def git(self, *args):
        return subprocess.check_output(
            ['git', *args], cwd=self.root, text=True, timeout=5,
        ).strip()

    def build(self, archive=None, version=None):
        self.log.write_text('')
        return subprocess.run(
            ['sh', str(SOURCE), str(archive or self.archive),
             self.version if version is None else version],
            cwd=self.root, env=dict(self.env, FIXTURE_IMAGE=json.dumps(self.image)),
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
                    'args': [*daemon, 'build', '--platform', 'linux/arm64',
                             '--label', f'org.opencontainers.image.revision={self.revision}',
                             '--build-arg', f'APP_VERSION={self.version}', '--tag', tag, '-'],
                    'archive': hashlib.sha256(self.archive.read_bytes()).hexdigest(),
                },
                {'args': [*daemon, 'image', 'inspect', '--format', '{{json .}}', tag]},
            ],
        )

    def test_accepts_a_release_tag_as_the_baked_version(self):
        version = 'v0.1.0-rc.1'
        self.image['Config']['Env'] = [f'APP_VERSION={version}']
        result = self.build(version=version)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f'APP_VERSION={version}', self.log.read_text())

    def test_refuses_missing_default_and_malformed_versions_before_build(self):
        for version in ('', 'dev', 'v1.0.0 injected', '.invalid', 'a' * 65):
            with self.subTest(version=version):
                result = self.build(version=version)
                self.assertIn('invalid_version', result.stderr)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(self.log.read_text(), '')

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
