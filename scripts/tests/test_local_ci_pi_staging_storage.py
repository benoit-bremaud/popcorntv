"""Exercise the Pi storage guard with disposable files and stubbed host observations."""

import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest


GUARD = Path(__file__).resolve().parents[2] / 'deploy/pi-staging/check-storage.sh'


class PiStagingStorageTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name).resolve()
        appdata = root / 'appdata'
        self.stage = appdata / 'popcorntv-staging'
        self.stage.mkdir(mode=0o700, parents=True)
        for name in ('data', 'cache', 'media', 'web', 'caddy-data', 'caddy-config'):
            (self.stage / name).mkdir(mode=0o700)
        for name in ('Caddyfile', 'app.env'):
            (self.stage / name).touch(mode=0o600)
        for name in ('docker', 'containerd'):
            (appdata / name).mkdir()

        self.script = root / 'check-storage.sh'
        source = GUARD.read_text().replace('appdata=/mnt/appdata', 'appdata=' + shlex.quote(str(appdata)), 1)
        self.script.write_text(source)
        binaries = root / 'bin'
        binaries.mkdir()
        commands = {
            'mountpoint': 'exit "${FIXTURE_MOUNT_CODE:-0}"',
            'findmnt': '''case "$*" in
  *SOURCE*) printf '%s\\n' /dev/fixture ;;
  *FSROOT*) printf '%s\\n' "${FIXTURE_FSROOT:-/}" ;;
  *TARGET*)
    [ "${FIXTURE_MOUNTS_FAIL:-0}" = 0 ] || exit 2
    printf '%s\\n' / "$FIXTURE_APPDATA" "${FIXTURE_NESTED:-}"
    ;;
  *) exit 2 ;;
esac''',
            'lsblk': '''printf '%s\\n' "${FIXTURE_TRANSPORT:-usb}"''',
            'stat': '''case "$2:$3" in
  %d:/) printf '%s\\n' os ;;
  %d:*) printf '%s\\n' "${FIXTURE_DEVICE:-usb}" ;;
  %u:%a:*) printf '1000:'; exec /usr/bin/stat -c %a "$3" ;;
  %u:%h:*) printf '1000:'; exec /usr/bin/stat -c %h "$3" ;;
  *) exec /usr/bin/stat "$@" ;;
esac''',
            'docker': '''[ "$*" = '--host unix:///var/run/docker.sock info --format {{.DockerRootDir}}' ] || exit 2
printf '%s\\n' "${FIXTURE_DOCKER_ROOT:-$FIXTURE_APPDATA/docker}"''',
            'python3': '''printf '%s\\n' "${FIXTURE_CONTAINERD_ROOT:-$FIXTURE_APPDATA/containerd}"''',
        }
        for name, body in commands.items():
            command = binaries / name
            command.write_text('#!/bin/sh\n' + body + '\n')
            command.chmod(0o700)
        self.env = dict(os.environ, PATH=f'{binaries}:{os.defpath}', FIXTURE_APPDATA=str(appdata))

    def check_storage(self, **observations):
        return subprocess.run(
            ['sh', str(self.script)], env=dict(self.env, **observations),
            capture_output=True, text=True, check=False,
        )

    def test_accepts_private_layout_and_ignores_mounts_outside_staging(self):
        result = self.check_storage(FIXTURE_NESTED=f'{self.stage}-other/data')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'pi-staging.storage_verified\n')

    def test_refuses_a_missing_mount_os_disk_or_non_usb_device(self):
        for field, value, reason in (
            ('FIXTURE_MOUNT_CODE', '1', 'appdata_not_mounted'),
            ('FIXTURE_DEVICE', 'os', 'appdata_uses_os_device'),
            ('FIXTURE_TRANSPORT', 'sata', 'appdata_usb_unconfirmed'),
        ):
            with self.subTest(field=field):
                result = self.check_storage(**{field: value})
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stderr.strip(), f'pi-staging.storage_refused:{reason}')

    def test_refuses_daemon_roots_outside_the_usb_mount(self):
        for field in ('FIXTURE_DOCKER_ROOT', 'FIXTURE_CONTAINERD_ROOT'):
            with self.subTest(field=field):
                result = self.check_storage(**{field: '/var/lib/outside-usb'})
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stderr.strip(), 'pi-staging.storage_refused:path_outside_appdata')

    def test_refuses_same_device_mount_at_or_below_staging_root(self):
        for path in (self.stage, self.stage / 'data', self.stage / 'media' / r'fixture\x20folder'):
            with self.subTest(path=path):
                result = self.check_storage(FIXTURE_NESTED=str(path))
                self.assertEqual(result.returncode, 1)
                self.assertIn('pi-staging.storage_refused:stage_nested_mount', result.stderr)

    def test_refuses_unavailable_mount_inventory(self):
        result = self.check_storage(FIXTURE_MOUNTS_FAIL='1')
        self.assertEqual(result.returncode, 1)
        self.assertIn('pi-staging.storage_refused:mount_inventory_unconfirmed', result.stderr)

    def test_refuses_usb_mount_rooted_at_another_projects_directory(self):
        result = self.check_storage(FIXTURE_FSROOT='/another-project')
        self.assertEqual(result.returncode, 1)
        self.assertIn('pi-staging.storage_refused:appdata_mount_root_changed', result.stderr)

    def test_refuses_a_staging_file_linked_to_another_project(self):
        for filename in ('Caddyfile', 'app.env'):
            with self.subTest(filename=filename):
                alias = self.stage.parent / 'other-project-file'
                os.link(self.stage / filename, alias)
                try:
                    result = self.check_storage()
                    self.assertEqual(result.returncode, 1)
                    self.assertIn('pi-staging.storage_refused:stage_file_not_private', result.stderr)
                finally:
                    alias.unlink()

    def test_refuses_a_staging_directory_with_shared_permissions(self):
        (self.stage / 'data').chmod(0o750)
        result = self.check_storage()
        self.assertEqual(result.returncode, 1)
        self.assertIn('pi-staging.storage_refused:stage_directory_not_private', result.stderr)
