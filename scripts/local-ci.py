#!/usr/bin/env python3
"""Run local checks and serialize exact-head gate/merge operations for one clone."""
import contextlib
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
ATTEST = ['sh', str(ROOT / 'scripts/attest.sh')]
SEMGREP = 'semgrep/semgrep:1.181.0@sha256:81474464c1f07483ba0682a44787fd93c91397419762a04abe2bafaae396304b'
REPORT = None


def output(*cmd):
    """Capture machine-readable output; leave stderr visible for ordinary local checks."""
    return subprocess.check_output(cmd, text=True, cwd=ROOT).strip()


def invoke(cmd, env=None):
    started = time.monotonic()
    print('local-ci: start ' + cmd[0] + ' ' + (cmd[1] if len(cmd) > 1 else ''), flush=True)
    if REPORT is None:
        code = subprocess.run(cmd, cwd=ROOT, env=env).returncode
    else:
        number = len(list(REPORT.glob('step-*.log'))) + 1
        with (REPORT / f'step-{number:02d}.log').open('w') as log:
            with subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE,
                                  stderr=subprocess.STDOUT, text=True) as process:
                for line in process.stdout:
                    print(line, end='', flush=True)
                    log.write(line)
                code = process.wait()
        with (REPORT / 'steps.jsonl').open('a') as stream:
            stream.write(json.dumps({'command': cmd, 'exit': code,
                                     'seconds': round(time.monotonic()-started, 3)}) + '\n')
    print(f'local-ci: exit={code} seconds={time.monotonic()-started:.2f}', flush=True)
    return code == 0


def runtime():
    expected = (ROOT / '.nvmrc').read_text().strip()
    if output('node', '--version') != 'v' + expected or output('pnpm', '--version') != '10.30.3':
        raise RuntimeError('wrong runtime; use mise x -- just <recipe>')


def fast():
    runtime()
    # Index scanning covers staged bytes, not an unstaged repair masking a staged secret.
    if not invoke(['gitleaks', 'git', '--staged', '--redact', '--no-banner']):
        return False
    files = subprocess.check_output(['git', 'diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
                                    cwd=ROOT).decode().split('\0')
    files = [name for name in files if name]
    if not files:
        return True
    # Avoid validating a working file different from what is about to be committed.
    for name in files:
        if subprocess.run(['git', 'diff', '--quiet', '--', name], cwd=ROOT).returncode:
            raise RuntimeError('partially staged file: stage its complete reviewed contents')
    good = invoke(['pnpm', 'exec', 'prettier', '--check', '--ignore-unknown', '--', *files])
    source = [f for f in files if Path(f).suffix in ('.ts', '.tsx', '.js', '.mjs', '.cjs')]
    if source:
        good = invoke(['pnpm', 'exec', 'eslint', '--', *source]) and good
    return good


def check():
    runtime()
    env = dict(os.environ, FFMPEG_IT='1', PYTHONDONTWRITEBYTECODE='1')
    commands = [
        ['pnpm', 'install', '--frozen-lockfile'],
        ['pnpm', 'typecheck'], ['pnpm', 'lint'], ['pnpm', 'format:check'],
        ['python3', 'scripts/test-local-ci.py'],
        ['lefthook', 'validate'], ['shellcheck', 'scripts/attest.sh', 'scripts/check-commit-msg.sh'],
        ['gitleaks', 'git', '--redact', '--no-banner'],
        ['osv-scanner', 'scan', 'source', '--lockfile=pnpm-lock.yaml'],
        ['docker', 'run', '--rm', '--user', str(os.getuid()) + ':' + str(os.getgid()),
         '-e', 'SEMGREP_SEND_METRICS=off', '-e', 'SEMGREP_ENABLE_VERSION_CHECK=0',
         '-e', 'EIO_BACKEND=posix', '-v', str(ROOT) + ':/src:ro', '-w', '/src', SEMGREP,
         'semgrep', 'scan', '--config', 'p/javascript', '--config', 'p/typescript', '--config', 'p/nodejs',
         '--config', 'p/python',
         '--error', '--metrics', 'off', '--disable-version-check',
         '--exclude', '**/node_modules', '--exclude', '**/dist', '--exclude', '**/coverage',
         '--exclude', '.env*', '--exclude', '**/.env*'],
    ]
    good = True
    for command in commands:
        try:
            good = invoke(command, env) and good
        except OSError:
            print('local-ci: required tool unavailable: ' + command[0], file=sys.stderr)
            good = False
    for folder, package in (('packages/shared', '@popcorntv/shared'),
                            ('apps/server', '@popcorntv/server'), ('apps/web', '@popcorntv/web')):
        try:
            manifest = json.loads((ROOT / folder / 'package.json').read_text())
            if manifest.get('name') != package or not manifest.get('scripts', {}).get('test'):
                raise RuntimeError('missing required test package ' + package)
            # Fresh reports outside coverage are unaffected by Vitest's coverage cleanup.
            with tempfile.TemporaryDirectory(prefix='local-ci-vitest-') as temporary:
                report = Path(temporary) / 'tests.json'
                passed = invoke(['pnpm', '--filter', package, 'test', '--coverage', '--maxWorkers=4',
                                 '--allowOnly=false', '--reporter=default', '--reporter=json',
                                 '--outputFile=' + str(report)], env)
                data = json.loads(report.read_text())
                complete = data.get('success') is True and data.get('numTotalTests', 0) > 0
                complete = complete and data.get('numPassedTests') == data.get('numTotalTests')
                complete = complete and all(data.get(key, 0) == 0 for key in
                    ('numFailedTests', 'numPendingTests', 'numTodoTests', 'numFailedTestSuites'))
                if REPORT is not None:
                    (REPORT / (package.rsplit('/', 1)[1] + '-tests.json')).write_text(json.dumps(data))
                if not passed or not complete:
                    raise RuntimeError('failed, empty or incomplete test report for ' + package)
        except (OSError, ValueError, RuntimeError) as error:
            print('local-ci: ' + str(error), file=sys.stderr)
            good = False
    return good


@contextlib.contextmanager
def lock():
    """Share the lock across gate, merge and linked worktrees; never remove its inode."""
    common = Path(output('git', 'rev-parse', '--git-common-dir'))
    if not common.is_absolute():
        common = ROOT / common
    with (common / 'local-ci.lock').open('a') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError('another local gate/merge operation holds the repository lock') from error
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def gate(base):
    global REPORT
    if base != 'origin/main':
        raise RuntimeError('only the trusted origin/main comparison base is supported')
    with lock():
        head = output(*ATTEST, 'head')
        report_root = Path(output('git', 'rev-parse', '--git-path', 'local-ci-runs'))
        if not report_root.is_absolute():
            report_root = ROOT / report_root
        report_root.mkdir(mode=0o700, exist_ok=True)
        REPORT = report_root / (time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + head + '-' + str(os.getpid()))
        REPORT.mkdir(mode=0o700)
        (REPORT / 'head').write_text(head + '\n')
        print('local-ci: retained evidence directory ' + str(REPORT), flush=True)
        # Abort before checks if pending cannot be confirmed. Do not claim to revoke older evidence.
        try:
            subprocess.run([*ATTEST, 'pending', head], cwd=ROOT, check=True)
        except BaseException:
            (REPORT / 'result').write_text('pending-unconfirmed\n')
            raise
        try:
            versions = {}
            for name, command in (
                ('node', ['node', '--version']), ('pnpm', ['pnpm', '--version']),
                ('python', ['python3', '--version']), ('git', ['git', '--version']),
                ('ffmpeg', ['ffmpeg', '-version']), ('docker', ['docker', '--version']),
                ('sonar-scanner', ['sonar-scanner', '--version']),
            ):
                versions[name] = output(*command)
                if not versions[name]:
                    raise RuntimeError('empty prerequisite version: ' + name)
            (REPORT / 'versions.json').write_text(json.dumps(versions, indent=2) + '\n')
            if not check():
                raise RuntimeError('required check failed')
            for command in (
                ['pnpm', 'build'],
                ['sonar-scanner', '-Dsonar.qualitygate.wait=true', '-Dsonar.qualitygate.timeout=180'],
                ['pnpm', '--filter', '@popcorntv/web', 'exec', 'playwright', 'test', '--config=playwright.local-ci.config.ts'],
                ['make', 'lint-docker'], ['make', 'scan-docker-config'],
                ['make', 'scan-source-security'],
                ['docker', 'build', '--pull', '-t', 'popcorntv:gate-' + head, '.'],
                ['make', 'scan-docker-image', 'IMAGE=popcorntv:gate-' + head],
                ['make', 'gate-sbom', 'IMAGE=popcorntv:gate-' + head],
            ):
                env = None
                if command[0] == 'sonar-scanner':
                    env = dict(os.environ)
                    if not env.get('SONAR_TOKEN'):
                        config = Path(os.environ.get('XDG_CONFIG_HOME', str(Path.home() / '.config')))
                        token = Path(os.environ.get('SONAR_TOKEN_FILE', str(config / 'sonarqube/analysis-token')))
                        if token.stat().st_mode & 0o077:
                            raise RuntimeError('Sonar token file must be private (mode 600)')
                        env['SONAR_TOKEN'] = token.read_text().strip()
                    env.setdefault('SONAR_HOST_URL', 'http://localhost:9000')
                if 'playwright' in command:
                    env = dict(os.environ, PLAYWRIGHT_JSON_OUTPUT_NAME=str(REPORT / 'browser-tests.json'))
                if not invoke(command, env):
                    raise RuntimeError('required gate step failed')
                if 'playwright' in command:
                    report = json.loads((REPORT / 'browser-tests.json').read_text())
                    stats = report.get('stats', {})
                    if (stats.get('expected', 0) < 1 or report.get('errors') or
                            any(stats.get(key, 0) != 0 for key in ('skipped', 'unexpected', 'flaky'))):
                        raise RuntimeError('failed, empty or incomplete browser test report')
                    def tests(suites):
                        for suite in suites:
                            for spec in suite.get('specs', []):
                                yield from spec.get('tests', [])
                            yield from tests(suite.get('suites', []))
                    cases = list(tests(report.get('suites', [])))
                    if not cases or any(case.get('expectedStatus') != 'passed' or
                            len(case.get('results', [])) != 1 or case['results'][0].get('status') != 'passed'
                            for case in cases):
                        raise RuntimeError('browser test did not pass exactly once')
            # Always run container checks for this initial migration. No path exemption can hide a failure.
            subprocess.run([*ATTEST, 'write', 'gate', head], cwd=ROOT, check=True)
            (REPORT / 'result').write_text('success\n')
        except BaseException:
            (REPORT / 'result').write_text('failure\n')
            try:
                subprocess.run([*ATTEST, 'failure', head], cwd=ROOT, timeout=30, check=False)
            except (OSError, subprocess.TimeoutExpired):
                print('local-ci: failure status unavailable; no success issued', file=sys.stderr)
            raise


def merge(pr):
    if not pr.isdecimal() or int(pr) < 1:
        raise RuntimeError('expected a positive PR number')
    with lock():
        repo = output(*ATTEST, 'repo')
        info = json.loads(output('gh', 'api', '--hostname', 'github.com', f'repos/{repo}/pulls/{pr}'))
        if info.get('state') != 'open' or info.get('draft') or info['base']['ref'] != 'main':
            raise RuntimeError('expected an open non-draft PR targeting main')
        head = info['head']['sha']
        subprocess.run(['git', 'fetch', '--quiet', 'origin', head], cwd=ROOT, check=True)
        subprocess.run([*ATTEST, 'verify', 'gate', head], cwd=ROOT, check=True)
        subprocess.run(['gh', 'pr', 'merge', pr, '--repo', 'github.com/' + repo, '--squash', '--match-head-commit', head],
                       cwd=ROOT, check=True)


def main():
    os.chdir(ROOT)
    args = sys.argv[1:]
    if args == ['fast']:
        return 0 if fast() else 1
    if args == ['check']:
        return 0 if check() else 1
    if args in (['gate'], ['gate', 'origin/main']):
        gate('origin/main')
        return 0
    if len(args) == 2 and args[0] == 'merge':
        merge(args[1])
        return 0
    raise RuntimeError('usage: local-ci.py fast|check|gate [origin/main]|merge PR')


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (RuntimeError, OSError, subprocess.SubprocessError, ValueError, KeyError) as error:
        print('local-ci: ' + str(error), file=sys.stderr)
        sys.exit(1)
