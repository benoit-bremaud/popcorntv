#!/bin/sh
# Self-contained: the trusted-main merge guard extracts this file without sibling modules.
# Public commands: repo, head, pending SHA, failure SHA, write gate SHA, verify gate SHA.
exec python3 - "$@" <<'PY'
"""Bind local-gate evidence to canonical origin, trusted main signers and one commit."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def run(*args, data=None, allowed=(0,)):
    result = subprocess.run(args, input=data, text=True, capture_output=True)
    if result.returncode not in allowed:
        # Do not echo remote diagnostics: credential-bearing remote URLs can occur in them.
        raise RuntimeError(f'{args[0]} {args[1]} failed (exit {result.returncode})')
    return result


def git(*args):
    return run('git', *args).stdout.strip()


def repository():
    url = git('remote', 'get-url', 'origin')
    match = re.fullmatch(r'(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)([A-Za-z0-9_-]+/[A-Za-z0-9_.-]+?)(?:\.git)?/?', url)
    if not match or any(part in ('.', '..') for part in match[1].split('/')):
        raise RuntimeError('origin must be a canonical GitHub repository URL without credentials')
    return match[1]


def sha(value):
    if not re.fullmatch(r'[0-9a-f]{40}', value):
        raise RuntimeError('expected a full commit SHA')
    git('cat-file', '-e', value + '^{commit}')
    return value


def trusted():
    git('fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main')
    return git('show', 'refs/remotes/origin/main:.github/allowed_signers') + '\n'


def clean_head(expected):
    if git('status', '--porcelain') or git('rev-parse', 'HEAD') != expected:
        raise RuntimeError('checks require an unchanged clean head')
    git('fetch', '--quiet', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*')
    if not git('for-each-ref', '--format=%(refname)', '--contains=' + expected, 'refs/remotes/origin/'):
        raise RuntimeError('head is not published on origin')


def status(repo, commit, state):
    run('gh', 'api', '--hostname', 'github.com', '--silent', '-X', 'POST', f'repos/{repo}/statuses/{commit}',
        '-f', 'context=gate', '-f', 'state=' + state, '-f', 'description=Local gate ' + state)


def verify_signature(note, payload, signers, tmp):
    if not note.startswith(payload):
        raise RuntimeError('note payload does not match repository and commit')
    signature = note[len(payload):]
    if not signature.startswith('-----BEGIN SSH SIGNATURE-----\n'):
        raise RuntimeError('missing SSH signature')
    (tmp / 'signature').write_text(signature)
    (tmp / 'signers').write_text(signers)
    principals = run('ssh-keygen', '-Y', 'find-principals', '-f', str(tmp / 'signers'),
                     '-s', str(tmp / 'signature')).stdout.splitlines()
    for principal in principals:
        result = run('ssh-keygen', '-Y', 'verify', '-f', str(tmp / 'signers'), '-I', principal,
                     '-n', 'local-ci', '-s', str(tmp / 'signature'), data=payload, allowed=(0, 255, 1))
        if result.returncode == 0:
            return
    raise RuntimeError('signature not trusted by origin/main')


def note_ref(ref):
    result = run('git', 'ls-remote', '--exit-code', 'origin', 'refs/notes/gate', allowed=(0, 2))
    if result.returncode == 2:
        return False
    git('fetch', '--quiet', 'origin', '+refs/notes/gate:' + ref)
    return True


def main():
    args = sys.argv[1:]
    repo = repository()
    if args == ['repo']:
        print(repo)
        return
    if args == ['head']:
        commit = sha(git('rev-parse', 'HEAD'))
        clean_head(commit)
        print(commit)
        return
    if len(args) == 2 and args[0] in ('pending', 'failure'):
        commit = sha(args[1])
        if args[0] == 'pending':
            clean_head(commit)
        status(repo, commit, args[0])
        return
    if len(args) != 3 or args[0] not in ('write', 'verify') or args[1] != 'gate':
        raise RuntimeError('usage: attest.sh {repo|head|pending SHA|failure SHA|write gate SHA|verify gate SHA}')
    mode, _, commit = args
    sha(commit)
    if mode == 'write':
        clean_head(commit)
    signers = trusted()
    payload = f'gate {repo} {commit}\n'
    ref = 'refs/notes/local-ci-' + str(os.getpid())
    with tempfile.TemporaryDirectory(prefix='local-ci-attest-') as folder:
        tmp = Path(folder)
        try:
            if mode == 'verify':
                if not note_ref(ref):
                    raise RuntimeError('no gate note on origin')
                note = git('notes', '--ref=' + ref, 'show', commit) + '\n'
                verify_signature(note, payload, signers, tmp)
                response = json.loads(run('gh', 'api', '--hostname', 'github.com', f'repos/{repo}/commits/{commit}/status').stdout)
                matches = [s for s in response.get('statuses', []) if s.get('context') == 'gate']
                if not matches or max(matches, key=lambda s: s['id']).get('state') != 'success':
                    raise RuntimeError('latest gate status is not success')
                print('attest: verified gate ' + commit)
                return
            # Signing alone is never allowed to resurrect a previous failed/pending-less run.
            response = json.loads(run('gh', 'api', '--hostname', 'github.com', f'repos/{repo}/commits/{commit}/status').stdout)
            matches = [s for s in response.get('statuses', []) if s.get('context') == 'gate']
            if not matches or max(matches, key=lambda s: s['id']).get('state') != 'pending':
                raise RuntimeError('confirmed pending status required before attestation')
            if git('config', 'gpg.format') != 'ssh':
                raise RuntimeError('gpg.format must be ssh')
            key = git('config', 'user.signingkey')
            (tmp / 'payload').write_text(payload)
            run('ssh-keygen', '-q', '-Y', 'sign', '-n', 'local-ci', '-f', key, str(tmp / 'payload'))
            note = payload + (tmp / 'payload.sig').read_text()
            verify_signature(note, payload, signers, tmp)
            for attempt in range(5):
                note_ref(ref)
                run('git', 'notes', '--ref=' + ref, 'add', '-f', '-F', '-', commit, data=note)
                pushed = run('git', 'push', '--porcelain', 'origin', ref + ':refs/notes/gate', allowed=(0, 1))
                if pushed.returncode == 0:
                    break
                if not any(reason in pushed.stdout for reason in ('(non-fast-forward)', '(fetch first)')):
                    raise RuntimeError('note publication failed')
                if attempt == 4:
                    raise RuntimeError('note publication exceeded five ref-race attempts')
            clean_head(commit)
            status(repo, commit, 'success')
            print('attest: published gate ' + commit)
        finally:
            run('git', 'update-ref', '-d', ref)


try:
    main()
except (RuntimeError, OSError, ValueError, KeyError) as error:
    print('attest: ' + str(error), file=sys.stderr)
    sys.exit(1)
PY
