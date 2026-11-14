"""Exercise real Git notes/SSH signatures, replacing only remote GitHub transport."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'attest.sh'
REAL_GIT = shutil.which('git')


class AttestationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='test-local-ci-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / 'checkout'
        self.repo.mkdir()
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.state = self.root / 'status.json'
        self.state.write_text('[]')
        self.env = dict(os.environ, HOME=str(self.root), GIT_CONFIG_GLOBAL='/dev/null',
                        GIT_CONFIG_NOSYSTEM='1', PATH=str(self.bin) + ':' + os.environ['PATH'],
                        CI_TEST_STATE=str(self.state), CI_TEST_REAL_GIT=REAL_GIT,
                        GH_REPO='misleading/other', GH_HOST='foreign.example.test')
        (self.bin / 'git').write_text('''#!/usr/bin/env python3
import os,subprocess,sys
from pathlib import Path
if sys.argv[1:]==['remote','get-url','origin']:
 print(os.environ.get('CI_TEST_ORIGIN','https://github.com/owner/project.git'))
 sys.exit(0)
if sys.argv[1]=='push' and os.environ.get('CI_TEST_PUSH_COUNT'):
 path=Path(os.environ['CI_TEST_PUSH_COUNT'])
 count=int(path.read_text())+1 if path.exists() else 1
 path.write_text(str(count))
 if count<=int(os.environ.get('CI_TEST_REJECT_PUSHES','0')):
  print('! rejected [rejected] (fetch first)')
  sys.exit(1)
sys.exit(subprocess.call([os.environ['CI_TEST_REAL_GIT'],*sys.argv[1:]]))
''')
        (self.bin / 'gh').write_text('''#!/usr/bin/env python3
import json,os,sys
from pathlib import Path
a=sys.argv[1:]
if a[:2]==['pr','merge']:
 if '--repo' not in a or a[a.index('--repo')+1]!='github.com/owner/project':
  sys.exit(11)
 if '--match-head-commit' not in a or a[a.index('--match-head-commit')+1]!=os.environ['CI_TEST_PR_HEAD']:
  sys.exit(12)
 if os.environ.get('CI_TEST_MOVE_PR'):
  sys.exit(13)
 Path(os.environ['CI_TEST_MERGED']).write_text(a[a.index('--match-head-commit')+1])
 sys.exit(0)
if '--hostname' not in a or a[a.index('--hostname')+1]!='github.com':
 sys.exit(10)
endpoint=next((v for v in a if v.startswith('repos/')), '')
if not endpoint.startswith('repos/owner/project/'):
 sys.exit(7)
if '/pulls/' in endpoint:
 print(json.dumps({'state':'open','draft':bool(os.environ.get('CI_TEST_DRAFT')),
                   'base':{'ref':'main'},'head':{'sha':os.environ['CI_TEST_PR_HEAD']}}))
 sys.exit(0)
p=Path(os.environ['CI_TEST_STATE'])
items=json.loads(p.read_text())
if 'POST' in a:
 state=next(v.split('=',1)[1] for v in a if v.startswith('state='))
 if os.environ.get('CI_TEST_FAIL_STATE')==state:
  sys.exit(8)
 items.insert(0,{'context':'gate','state':state,'id':len(items)+1})
 p.write_text(json.dumps(items))
else:
 if os.environ.get('CI_TEST_FAIL_READ'):
  sys.exit(9)
 print(json.dumps({'statuses':items}))
''')
        for path in self.bin.iterdir():
            path.chmod(0o755)
        self.command(REAL_GIT, 'init', '--bare', str(self.root / 'origin'))
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Fixture signer')
        self.git('config', 'user.email', 'signer@example.test')
        self.git('config', 'core.hooksPath', '/dev/null')
        self.key = self.root / 'key'
        self.command('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(self.key))
        self.git('config', 'gpg.format', 'ssh')
        self.git('config', 'user.signingkey', str(self.key))
        (self.repo / '.github').mkdir()
        public = self.key.with_suffix('.pub').read_text().split()
        (self.repo / '.github/allowed_signers').write_text('signer@example.test ' + ' '.join(public[:2]) + '\n')
        self.git('add', '.')
        self.git('commit', '-m', 'ci(test): initialize trusted main')
        self.git('remote', 'add', 'origin', str(self.root / 'origin'))
        self.git('push', '-u', 'origin', 'main')
        self.head = self.git('rev-parse', 'HEAD').stdout.strip()

    def command(self, *args, good=True, env=None):
        result = subprocess.run(args, cwd=self.repo, env=env or self.env, text=True, capture_output=True)
        if good:
            self.assertEqual(result.returncode, 0, result.stderr)
        return result

    def git(self, *args, **kwargs):
        return self.command(REAL_GIT, *args, **kwargs)

    def attest(self, *args, good=True, **env):
        result = self.command('sh', str(SCRIPT), *args, good=good, env=dict(self.env, **env))
        if not good:
            self.assertNotEqual(result.returncode, 0, result.stdout)
        return result

    def publish(self):
        self.attest('pending', self.head)
        self.attest('write', 'gate', self.head)

    def latest(self):
        return json.loads(self.state.read_text())[0]['state']

    def test_valid_gate_ignores_misleading_gh_repo_and_verifies(self):
        self.publish()
        self.attest('verify', 'gate', self.head)
        self.assertEqual(self.latest(), 'success')
        self.assertIn('refs/notes/gate', self.git('ls-remote', 'origin', 'refs/notes/gate').stdout)
        self.assertEqual(self.git('for-each-ref', '--format=%(refname)', 'refs/notes/local-ci-*').stdout, '')

    def test_no_note_refuses_even_with_success_status(self):
        self.state.write_text('[{"id":1,"state":"success","context":"gate"}]')
        self.attest('verify', 'gate', self.head, good=False)

    def test_no_pending_refuses_new_attestation(self):
        self.attest('write', 'gate', self.head, good=False)
        self.assertEqual(json.loads(self.state.read_text()), [])

    def test_failed_rerun_invalidates_previous_success(self):
        self.publish()
        self.attest('pending', self.head)
        self.attest('failure', self.head)
        self.attest('verify', 'gate', self.head, good=False)
        self.assertEqual(self.latest(), 'failure')

    def test_unconfirmed_pending_does_not_claim_prior_evidence_revoked(self):
        self.publish()
        self.attest('pending', self.head, good=False, CI_TEST_FAIL_STATE='pending')
        self.assertEqual(self.latest(), 'success')
        self.attest('verify', 'gate', self.head)

    def test_signature_written_but_failed_success_publication_remains_pending(self):
        self.attest('pending', self.head)
        self.attest('write', 'gate', self.head, good=False, CI_TEST_FAIL_STATE='success')
        self.assertEqual(self.latest(), 'pending')
        self.attest('verify', 'gate', self.head, good=False)

    def test_status_transport_failure_refuses_merge_evidence(self):
        self.publish()
        self.attest('verify', 'gate', self.head, good=False, CI_TEST_FAIL_READ='1')

    def test_foreign_key_and_branch_trust_substitution_refused(self):
        other = self.root / 'foreign'
        self.command('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(other))
        public = other.with_suffix('.pub').read_text().split()
        self.git('switch', '-c', 'feature')
        (self.repo / '.github/allowed_signers').write_text('signer@example.test ' + ' '.join(public[:2]) + '\n')
        self.git('add', '.')
        self.git('commit', '-m', 'ci(test): replace branch signer')
        self.git('push', '-u', 'origin', 'feature')
        self.head = self.git('rev-parse', 'HEAD').stdout.strip()
        self.git('config', 'user.signingkey', str(other))
        self.attest('pending', self.head)
        self.attest('write', 'gate', self.head, good=False)
        self.assertEqual(self.latest(), 'pending')

    def test_dirty_and_unpublished_heads_refused(self):
        (self.repo / 'new').write_text('fixture')
        self.attest('head', good=False)
        self.git('add', '.')
        self.git('commit', '-m', 'ci(test): local only')
        self.attest('head', good=False)

    def test_changed_head_refuses_attestation(self):
        self.attest('pending', self.head)
        self.git('commit', '--allow-empty', '-m', 'ci(test): move head')
        self.attest('write', 'gate', self.head, good=False)

    def test_head_on_other_remote_only_is_not_origin_published(self):
        other = self.root / 'other'
        self.command(REAL_GIT, 'init', '--bare', str(other))
        self.git('remote', 'add', 'other', str(other))
        self.git('push', 'other', 'main')
        self.git('fetch', 'other')
        self.command(REAL_GIT, '--git-dir=' + str(self.root / 'origin'), 'update-ref', '-d', 'refs/heads/main')
        self.attest('head', good=False)

    def test_malformed_sha_and_remote_rejected(self):
        for value in ('', 'HEAD', '--help', 'a' * 39):
            with self.subTest(value=value):
                self.attest('verify', 'gate', value, good=False)
        for url in ('https://user:secret@github.com/owner/project.git', 'https://example.test/owner/project', 'file:///tmp/x'):
            with self.subTest(url=url):
                self.attest('repo', good=False, CI_TEST_ORIGIN=url)

    def test_missing_main_trust_refused(self):
        self.git('rm', '.github/allowed_signers')
        self.git('commit', '-m', 'ci(test): revoke trust store')
        self.git('push', 'origin', 'main')
        self.head = self.git('rev-parse', 'HEAD').stdout.strip()
        self.attest('pending', self.head)
        self.attest('write', 'gate', self.head, good=False)

    def test_forged_note_and_wrong_namespace_refused(self):
        self.publish()
        self.git('fetch', 'origin', 'refs/notes/gate:refs/notes/gate')
        self.git('notes', '--ref=gate', 'add', '-f', '-m', 'forged', self.head)
        self.git('push', 'origin', 'refs/notes/gate')
        self.attest('verify', 'gate', self.head, good=False)
        payload = self.root / 'payload'
        payload.write_text('gate owner/project ' + self.head + '\n')
        self.command('ssh-keygen', '-q', '-Y', 'sign', '-n', 'wrong-namespace', '-f', str(self.key), str(payload))
        note = self.root / 'note'
        note.write_text(payload.read_text() + (self.root / 'payload.sig').read_text())
        self.git('notes', '--ref=gate', 'add', '-f', '-F', str(note), self.head)
        self.git('push', 'origin', 'refs/notes/gate')
        self.attest('verify', 'gate', self.head, good=False)

    def test_bounded_ref_race_failure_never_publishes_success(self):
        self.attest('pending', self.head)
        count = self.root / 'push-count'
        self.attest('write', 'gate', self.head, good=False,
                    CI_TEST_PUSH_COUNT=str(count), CI_TEST_REJECT_PUSHES='5')
        self.assertEqual(count.read_text(), '5')
        self.assertEqual(self.latest(), 'pending')

    def test_fifth_push_succeeds_and_preserves_unrelated_note(self):
        old = self.head
        self.git('notes', '--ref=gate', 'add', '-m', 'unrelated note', old)
        self.git('push', 'origin', 'refs/notes/gate')
        self.git('commit', '--allow-empty', '-m', 'ci(test): second target')
        self.git('push', 'origin', 'main')
        self.head = self.git('rev-parse', 'HEAD').stdout.strip()
        count = self.root / 'push-count'
        self.attest('pending', self.head)
        self.attest('write', 'gate', self.head,
                    CI_TEST_PUSH_COUNT=str(count), CI_TEST_REJECT_PUSHES='4')
        self.assertEqual(count.read_text(), '5')
        self.attest('verify', 'gate', self.head)
        self.git('fetch', 'origin', '+refs/notes/gate:refs/notes/gate')
        self.assertEqual(self.git('notes', '--ref=gate', 'show', old).stdout.strip(), 'unrelated note')

    def test_trusted_signatures_with_transplanted_payloads_refused(self):
        self.publish()
        self.git('fetch', 'origin', 'refs/notes/gate:refs/notes/gate')
        for repo, commit in (('owner/other', self.head), ('owner/project', '0' * 40)):
            with self.subTest(repo=repo, commit=commit):
                payload = self.root / 'transplant'
                payload.write_text(f'gate {repo} {commit}\n')
                payload.with_suffix('.sig').unlink(missing_ok=True)
                self.command('ssh-keygen', '-q', '-Y', 'sign', '-n', 'local-ci', '-f', str(self.key), str(payload))
                note = self.root / 'note'
                note.write_text(payload.read_text() + payload.with_suffix('.sig').read_text())
                self.git('notes', '--ref=gate', 'add', '-f', '-F', str(note), self.head)
                self.git('push', 'origin', 'refs/notes/gate')
                self.attest('verify', 'gate', self.head, good=False)

    def test_existing_attestation_rejected_after_main_revokes_signer(self):
        self.publish()
        other = self.root / 'replacement'
        self.command('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', str(other))
        public = other.with_suffix('.pub').read_text().split()
        (self.repo / '.github/allowed_signers').write_text('replacement@example.test ' + ' '.join(public[:2]) + '\n')
        self.git('add', '.')
        self.git('commit', '-m', 'ci(test): revoke old signer')
        self.git('push', 'origin', 'main')
        self.attest('verify', 'gate', self.head, good=False)


if __name__ == '__main__':
    unittest.main()
