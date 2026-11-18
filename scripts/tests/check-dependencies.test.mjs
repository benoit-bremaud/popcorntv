/* global process, URL */
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { ADVISORY, classify, packagePaths, verifyPatch } from '../check-dependencies.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const inventory = JSON.parse(
  spawnSync('pnpm', ['-r', 'list', 'picomatch', '--depth', 'Infinity', '--json'], {
    cwd: root,
    encoding: 'utf8',
  }).stdout,
);
const installed = packagePaths(inventory)[0];
const lockfile = join(root, 'pnpm-lock.yaml');

function finding(id = ADVISORY, version = '4.0.7', name = 'picomatch', path = lockfile) {
  return {
    results: [
      {
        source: { path, type: 'lockfile' },
        packages: [
          {
            package: { name, version, ecosystem: 'npm' },
            vulnerabilities: [{ id }],
            groups: [{ ids: [id] }],
          },
        ],
      },
    ],
  };
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'dependency-proof-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'patches'));
  cpSync(
    join(root, 'patches/picomatch@4.0.7.patch'),
    join(directory, 'patches/picomatch@4.0.7.patch'),
  );
  cpSync(join(root, 'package.json'), join(directory, 'package.json'));
  const packagePath = join(directory, 'node_modules/picomatch');
  cpSync(installed, packagePath, { recursive: true });
  const graph = [{ devDependencies: { picomatch: { version: '4.0.7', path: packagePath } } }];
  return { directory, packagePath, graph };
}

test('the installed pnpm patch passes identity, fingerprint and actual matcher regressions', () => {
  assert(verifyPatch(root, inventory, '2026-11-17') >= 1);
});

test('inventory includes nested instances and refuses absent or unexpected versions', () => {
  assert.deepEqual(
    packagePaths([
      {
        dependencies: {
          other: { dependencies: { picomatch: { version: '4.0.7', path: '/fixture' } } },
        },
      },
    ]),
    ['/fixture'],
  );
  for (const graph of [
    [],
    {},
    [{}],
    [{ dependencies: { picomatch: { version: '4.0.8', path: '/fixture' } } }],
  ]) {
    assert.throws(() => packagePaths(graph));
  }
});

test('proof refuses the expiration boundary and later dates', () => {
  for (const date of ['2026-12-01', '2026-12-02', 'invalid'])
    assert.throws(() => verifyPatch(root, inventory, date), /expired/);
  assert(verifyPatch(root, inventory, '2026-11-30') >= 1);
});

for (const [label, mutate, message] of [
  [
    'changed patch',
    (f) => writeFileSync(join(f.directory, 'patches/picomatch@4.0.7.patch'), 'changed'),
    /patch fingerprint/,
  ],
  [
    'missing registration',
    (f) => writeFileSync(join(f.directory, 'package.json'), '{}'),
    /registration/,
  ],
  [
    'wrong package identity',
    (f) => writeFileSync(join(f.packagePath, 'package.json'), '{"name":"other","version":"4.0.7"}'),
    /identity/,
  ],
  [
    'changed parser',
    (f) => writeFileSync(join(f.packagePath, 'lib/parse.js'), 'changed'),
    /parser fingerprint/,
  ],
  [
    'foreign package path',
    (f) => {
      f.graph[0].devDependencies.picomatch.path = installed;
    },
    /outside this installation/,
  ],
])
  test(`proof refuses ${label}`, (t) => {
    const f = fixture(t);
    mutate(f);
    assert.throws(() => verifyPatch(f.directory, f.graph, '2026-11-17'), message);
  });

test('proof refuses a second unpatched installed instance', (t) => {
  const f = fixture(t);
  const other = join(f.directory, 'node_modules/other/picomatch');
  cpSync(f.packagePath, other, { recursive: true });
  writeFileSync(join(other, 'lib/parse.js'), 'unpatched');
  f.graph[0].dependencies = { picomatch: { version: '4.0.7', path: other } };
  assert.throws(() => verifyPatch(f.directory, f.graph, '2026-11-17'), /parser fingerprint/);
});

test('classification accepts only the exact advisory and lockfile, retaining scanner exit evidence', () => {
  assert.equal(classify(finding(), 1, lockfile), 1);
  assert.equal(classify({ results: [] }, 0, lockfile), 0);
  for (const [report, exit] of [
    [finding('GHSA-other-advisory'), 1],
    [finding(ADVISORY, '4.0.6'), 1],
    [finding(ADVISORY, '4.0.7', 'other'), 1],
    [finding(ADVISORY, '4.0.7', 'picomatch', '/other/pnpm-lock.yaml'), 1],
    [finding(), 2],
    [{ results: [] }, 1],
    [{}, 0],
    [{ results: [{ source: {}, packages: [{}] }] }, 1],
  ])
    assert.throws(() => classify(report, exit, lockfile));
  const wrongEcosystem = finding();
  wrongEcosystem.results[0].packages[0].package.ecosystem = 'PyPI';
  assert.throws(() => classify(wrongEcosystem, 1, lockfile));
  const wrongSource = finding();
  wrongSource.results[0].source.type = 'sbom';
  assert.throws(() => classify(wrongSource, 1, lockfile));
  const mixed = finding();
  mixed.results[0].packages[0].vulnerabilities.push({ id: 'GHSA-another' });
  assert.throws(() => classify(mixed, 1, lockfile));
  const unknownGroup = finding();
  unknownGroup.results[0].packages[0].groups.push({ ids: ['GHSA-another'] });
  assert.throws(() => classify(unknownGroup, 1, lockfile));
});

test('real CLI boundaries retain raw findings, enforce proofs and refuse scanner errors', (t) => {
  const f = fixture(t);
  const bin = join(f.directory, 'bin');
  mkdirSync(bin);
  const out = join(f.directory, 'evidence');
  const stub = `#!${process.execPath}\nimport fs from 'node:fs';\nimport path from 'node:path';\nconst name=path.basename(process.argv[1]);\nif(name==='pnpm') { console.log(process.env.FIXTURE_INVENTORY); }\nelse {\n const target=process.argv.find(a=>a.startsWith('--output-file='));\n const required=['--lockfile=pnpm-lock.yaml','--lockfile=uv.lock','--all-vulns','--format=json'];\n const config=process.argv.find(a=>a.startsWith('--config='));\n if(!required.every(a=>process.argv.includes(a)) || !config || fs.readFileSync(config.slice('--config='.length),'utf8')!=='') process.exit(8);\n if(process.env.FIXTURE_NO_REPORT) process.exit(1);\n fs.writeFileSync(target.slice('--output-file='.length),process.env.FIXTURE_REPORT);\n process.exit(Number(process.env.FIXTURE_SCANNER_EXIT));\n}\n`;
  // .mjs avoids ambient package type affecting the external CLI fixtures.
  writeFileSync(join(bin, 'package.json'), '{"type":"module"}');
  for (const name of ['pnpm', 'osv-scanner']) writeFileSync(join(bin, name), stub, { mode: 0o755 });
  const script = fileURLToPath(new URL('../check-dependencies.mjs', import.meta.url));
  const code = `import { main } from ${JSON.stringify(script)}; main(process.argv[1], '2026-11-17');`;
  const run = (extra = {}) =>
    spawnSync(process.execPath, ['--input-type=module', '-e', code, f.directory], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: bin + ':' + process.env.PATH,
        PCTV_DEPENDENCY_REPORT_DIR: out,
        FIXTURE_INVENTORY: JSON.stringify(f.graph),
        FIXTURE_REPORT: JSON.stringify(
          finding(ADVISORY, '4.0.7', 'picomatch', join(f.directory, 'pnpm-lock.yaml')),
        ),
        FIXTURE_SCANNER_EXIT: '1',
        ...extra,
      },
    });
  const accepted = run();
  assert.equal(accepted.status, 0, accepted.stderr);
  const acceptedDirectory = accepted.stdout.trim().split('evidence=')[1];
  assert.equal(
    JSON.parse(readFileSync(join(acceptedDirectory, 'dependency-mitigation.json'))).scannerExit,
    1,
  );
  assert.notEqual(run({ FIXTURE_NO_REPORT: '1' }).status, 0);
  assert.equal(
    JSON.parse(readFileSync(join(acceptedDirectory, 'osv-raw.json'))).results[0].packages[0]
      .vulnerabilities[0].id,
    ADVISORY,
  );
  assert.notEqual(run({ FIXTURE_SCANNER_EXIT: '2' }).status, 0);
  assert.notEqual(run({ FIXTURE_REPORT: 'malformed' }).status, 0);
  assert.notEqual(run({ FIXTURE_REPORT: JSON.stringify(finding('GHSA-another')) }).status, 0);
  writeFileSync(join(f.packagePath, 'lib/parse.js'), 'unpatched');
  assert.notEqual(run().status, 0);
});
