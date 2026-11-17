#!/usr/bin/env node
/* global console, process, URL */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ADVISORY = 'GHSA-fc5q-39xc-vjpf';
export const EXPIRES = '2026-12-01';
const PATCH = 'patches/picomatch@4.0.7.patch';
const PATCH_SHA256 = 'c62a3705edbfd45ca1afe8f0cb08ca938e3a85d390b25a90ac7f1f9d0610fb98';
const PARSER_SHA256 = '04ca187b94355ab9c4a781cc8ee1a481a7e89337de436f4e7fa9314ce1110020';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Collect every resolved picomatch instance reported by the workspace dependency graph. */
export function packagePaths(inventory) {
  assert(Array.isArray(inventory) && inventory.length > 0, 'empty dependency inventory');
  const paths = new Set();
  function visit(value) {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [name, child] of Object.entries(value)) {
      if (name === 'picomatch' || child?.from === 'picomatch') {
        assert(
          child?.version === '4.0.7' && typeof child.path === 'string',
          'unexpected picomatch identity',
        );
        paths.add(child.path);
      }
      visit(child);
    }
  }
  visit(inventory);
  assert(paths.size > 0, 'picomatch is absent from the dependency inventory');
  return [...paths];
}

/** Refuse drift or expiry before allowing the one locally corrected advisory. */
export function verifyPatch(root, inventory, today = new Date().toISOString().slice(0, 10)) {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(today) && today < EXPIRES, 'picomatch classification expired');
  assert.equal(sha256(readFileSync(join(root, PATCH))), PATCH_SHA256, 'patch fingerprint mismatch');
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(
    manifest.pnpm?.patchedDependencies?.['picomatch@4.0.7'],
    PATCH,
    'patch registration mismatch',
  );
  const nodeModules = realpathSync(join(root, 'node_modules'));
  const checked = new Set();
  for (const path of packagePaths(inventory)) {
    const actual = realpathSync(path);
    const local = relative(nodeModules, actual);
    assert(
      local && !local.startsWith('..') && !isAbsolute(local),
      'picomatch outside this installation',
    );
    if (checked.has(actual)) continue;
    checked.add(actual);
    const identity = JSON.parse(readFileSync(join(actual, 'package.json'), 'utf8'));
    assert(
      identity.name === 'picomatch' && identity.version === '4.0.7',
      'installed package identity mismatch',
    );
    assert.equal(
      sha256(readFileSync(join(actual, 'lib/parse.js'))),
      PARSER_SHA256,
      'installed parser fingerprint mismatch',
    );
    const matcher = createRequire(join(actual, 'package.json'))('./index.js');
    for (const pattern of [
      '+(*)',
      '+(*a)',
      '*(*a)',
      '+(a*)b',
      '+(a**b)c',
      '+(*a!)b',
      '+(*(ab)c)',
      String.raw`+(a\/*b)`,
      '+([/]a*b)',
      '@(+(*a))',
    ]) {
      for (const options of [{}, { capture: true }, { maxExtglobRecursion: false }]) {
        assert.throws(() => matcher.makeRe(pattern, options), SyntaxError, pattern);
      }
    }
    for (const [subject, pattern, expected] of [
      ['src/a.ts', '**/*.ts', true],
      ['src/a.js', '**/*.ts', false],
      ['foo.ts', '@(foo|bar).ts', true],
      ['other.ts', '@(foo|bar).ts', false],
      ['bar.ts', '!(foo).ts', true],
      ['foo.ts', '!(foo).ts', false],
      ['foo.ts', '?(foo).ts', true],
      ['bar.ts', '?(foo).ts', false],
    ])
      assert.equal(matcher.isMatch(subject, pattern), expected, pattern);
  }
  return checked.size;
}

/** Classify only the exact advisory on the corrected package; unknown findings fail closed. */
export function classify(report, scannerExit, lockfile) {
  assert(scannerExit === 0 || scannerExit === 1, 'dependency scanner execution failed');
  assert(report && Array.isArray(report.results), 'invalid scanner report');
  let corrected = 0;
  for (const result of report.results) {
    assert(result.source && Array.isArray(result.packages), 'invalid scanner result');
    for (const entry of result.packages) {
      assert(entry.package && Array.isArray(entry.vulnerabilities), 'invalid scanner package');
      const allowed =
        entry.package.name === 'picomatch' &&
        entry.package.version === '4.0.7' &&
        entry.package.ecosystem === 'npm' &&
        result.source.type === 'lockfile' &&
        resolve(result.source.path) === resolve(lockfile);
      for (const vulnerability of entry.vulnerabilities) {
        assert(allowed && vulnerability.id === ADVISORY, 'unmitigated dependency vulnerability');
        corrected++;
      }
      for (const group of entry.groups ?? []) {
        assert(
          Array.isArray(group.ids) && group.ids.every((id) => id === ADVISORY),
          'unknown vulnerability group',
        );
      }
    }
  }
  assert(scannerExit === 0 || corrected > 0, 'scanner failed without a classified finding');
  return corrected;
}

/** Keep the original scanner report and explicit mitigation evidence without global ignores. */
export function main(root, today = new Date().toISOString().slice(0, 10)) {
  const parent = process.env.PCTV_DEPENDENCY_REPORT_DIR ?? tmpdir();
  mkdirSync(parent, { recursive: true });
  // A new directory makes a failed scanner unable to reuse a previous successful report.
  const directory = mkdtempSync(join(parent, 'popcorntv-dependencies-'));
  const inventory = spawnSync(
    'pnpm',
    ['-r', 'list', 'picomatch', '--depth', 'Infinity', '--json'],
    { cwd: root, encoding: 'utf8' },
  );
  assert(!inventory.error && inventory.signal === null, 'dependency inventory process failed');
  assert.equal(inventory.status, 0, 'cannot inventory installed dependencies');
  const instances = verifyPatch(root, JSON.parse(inventory.stdout), today);
  // An explicit empty config prevents an unrelated ignore file from hiding other findings.
  const config = join(directory, 'osv-empty.toml');
  writeFileSync(config, '');
  const raw = join(directory, 'osv-raw.json');
  const scan = spawnSync(
    'osv-scanner',
    [
      'scan',
      'source',
      '--config=' + config,
      '--lockfile=pnpm-lock.yaml',
      '--lockfile=uv.lock',
      '--all-vulns',
      '--format=json',
      '--output-file=' + raw,
    ],
    { cwd: root, stdio: 'inherit' },
  );
  assert(!scan.error && scan.signal === null, 'dependency scanner process failed');
  const corrected = classify(
    JSON.parse(readFileSync(raw, 'utf8')),
    scan.status,
    join(root, 'pnpm-lock.yaml'),
  );
  const evidence = {
    advisory: ADVISORY,
    expiresExclusive: EXPIRES,
    instances,
    corrected,
    patchSha256: PATCH_SHA256,
    parserSha256: PARSER_SHA256,
    scannerExit: scan.status,
    raw,
  };
  writeFileSync(
    join(directory, 'dependency-mitigation.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(
    `dependencies: passed; locally corrected findings=${corrected}; expires=${EXPIRES}; evidence=${directory}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(fileURLToPath(new URL('../', import.meta.url)));
  } catch (error) {
    console.error('dependencies: refused:', error.message);
    process.exitCode = 1;
  }
}
