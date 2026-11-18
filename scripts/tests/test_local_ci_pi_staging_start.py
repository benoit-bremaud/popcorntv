"""Run the guarded staging entry point with synthetic host observations."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[2] / 'deploy/pi-staging/start.sh'
TAILNET_IP = '100.100.10.20'
APP_IMAGE = 'sha256:' + 'a' * 64
CADDY_IMAGE = 'popcorntv-caddy@sha256:' + 'b' * 64


class PiStagingStartTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.stage = self.root / 'pi staging'
        self.stage.mkdir()
        self.script = self.stage / SOURCE.name
        shutil.copyfile(SOURCE, self.script)
        (self.stage / 'compose.yml').touch()
        (self.stage / 'check-storage.sh').write_text('''
printf '%s\\n' storage >> "$FIXTURE_LOG"
exit "${FIXTURE_STORAGE_CODE:-0}"
''')
        self.log = self.root / 'calls.log'
        binaries = self.root / 'bin'
        binaries.mkdir()
        commands = {
            'tailscale': '''[ "$*" = 'ip -4' ] || exit 2
printf '%s\\n' tailscale >> "$FIXTURE_LOG"
[ "${FIXTURE_TAILSCALE_CODE:-0}" = 0 ] || exit 2
printf '%s\\n' "$FIXTURE_TAILSCALE_IP"''',
            'ip': '''[ "$*" = '-j -4 addr show dev tailscale0' ] || exit 2
printf '%s\\n' interface >> "$FIXTURE_LOG"
printf '%s\\n' "$FIXTURE_INTERFACE"''',
            'docker': '''[ -z "${DOCKER_CONTEXT+x}${DOCKER_HOST+x}" ] || exit 2
if [ "$3" = image ] && [ "$4" = inspect ]; then
    printf 'inspect:%s\\n' "$7" >> "$FIXTURE_LOG"
    case "$7" in
        "$PCTV_STAGE_IMAGE") printf '%s\\n' "$FIXTURE_APP_IMAGE" ;;
        "$PCTV_STAGE_CADDY_IMAGE") printf '%s\\n' "$FIXTURE_CADDY_IMAGE" ;;
        *) exit 2 ;;
    esac
else
    printf '%s\\n' docker "$@" >> "$FIXTURE_LOG"
fi''',
        }
        for name, body in commands.items():
            binary = binaries / name
            binary.write_text('#!/bin/sh\n' + body + '\n')
            binary.chmod(0o700)
        self.env = dict(
            os.environ, PATH=f'{binaries}:{os.defpath}', FIXTURE_LOG=str(self.log),
            PCTV_STAGE_TAILNET_IP=TAILNET_IP, FIXTURE_TAILSCALE_IP=TAILNET_IP,
            FIXTURE_INTERFACE=json.dumps([{'addr_info': [{'local': TAILNET_IP}]}]),
            PCTV_STAGE_IMAGE=APP_IMAGE, PCTV_STAGE_CADDY_IMAGE=CADDY_IMAGE,
            FIXTURE_APP_IMAGE=json.dumps({
                'id': APP_IMAGE, 'os': 'linux', 'architecture': 'arm64', 'digests': [],
            }),
            FIXTURE_CADDY_IMAGE=json.dumps({
                'id': 'sha256:' + 'c' * 64, 'os': 'linux', 'architecture': 'arm64',
                'digests': [CADDY_IMAGE],
            }),
            DOCKER_CONTEXT='unrelated-context', DOCKER_HOST='tcp://unrelated.invalid:2375',
        )

    def launch(self, **observations):
        self.log.write_text('')
        return subprocess.run(
            ['sh', str(self.script)], cwd=self.root, env=dict(self.env, **observations),
            capture_output=True, text=True, timeout=5, check=False,
        )

    def test_matching_address_launches_only_staging_on_local_daemon(self):
        result = self.launch()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.log.read_text().splitlines(), [
            'storage', 'tailscale', 'interface', f'inspect:{APP_IMAGE}', f'inspect:{CADDY_IMAGE}',
            'docker', '--host', 'unix:///var/run/docker.sock',
            'compose', '--project-name', 'popcorntv-pi-staging', '--env-file', '/dev/null',
            '-f', str(self.stage / 'compose.yml'), 'up', '-d', '--wait',
        ])

    def test_refuses_empty_wildcard_lan_ipv6_and_other_tailnet_addresses(self):
        for address in ('', '0.0.0.0', '192.168.1.20', '::', '100.100.10.21'):
            with self.subTest(address=address):
                self.assert_ingress_refused(self.launch(PCTV_STAGE_TAILNET_IP=address))

    def test_reported_address_must_also_be_assigned_to_tailscale0(self):
        self.assert_ingress_refused(self.launch(FIXTURE_INTERFACE='[{"addr_info": []}]'))

    def test_refuses_unavailable_or_malformed_host_observations(self):
        for observation in (dict(FIXTURE_TAILSCALE_CODE='2'), dict(FIXTURE_INTERFACE='invalid')):
            with self.subTest(observation=observation):
                self.assert_ingress_refused(self.launch(**observation))

    def test_storage_failure_prevents_network_checks_and_compose(self):
        result = self.launch(FIXTURE_STORAGE_CODE='1')
        self.assertEqual(result.returncode, 1)
        self.assertEqual(self.log.read_text().splitlines(), ['storage'])

    def test_refuses_a_mutable_tag_before_compose(self):
        result = self.launch(PCTV_STAGE_CADDY_IMAGE='popcorntv-caddy:latest')
        self.assertEqual(result.returncode, 1)
        self.assertIn('caddy_immutable_reference_required', result.stderr)
        self.assertNotIn('compose', self.log.read_text().splitlines())

    def test_refuses_wrong_platform_or_an_unbound_manifest_before_compose(self):
        for architecture, digests in (
            ('amd64', [CADDY_IMAGE]), ('arm64', []), ('arm64', CADDY_IMAGE),
        ):
            with self.subTest(architecture=architecture, digests=digests):
                result = self.launch(FIXTURE_CADDY_IMAGE=json.dumps({
                    'id': 'sha256:' + 'b' * 64, 'os': 'linux',
                    'architecture': architecture, 'digests': digests,
                }))
                self.assertEqual(result.returncode, 1)
                self.assertIn('caddy_identity_unconfirmed', result.stderr)
                self.assertNotIn('compose', self.log.read_text().splitlines())

    def assert_ingress_refused(self, result):
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stderr.strip(), 'pi-staging.ingress_refused:tailnet_ipv4_unconfirmed')
        self.assertNotIn('docker', self.log.read_text().splitlines())
