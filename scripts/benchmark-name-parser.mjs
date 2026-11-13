#!/usr/bin/env node
/* global console, process, URL */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Fixed historical code, not a browser-controlled revision or an arbitrary module to execute.
const BASELINE = '5bfeffb187dff309a56b37487748396627feaddf';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = 'apps/server/src/library/name-parser.ts';
const flags = process.argv.slice(2);
if (flags.length > 1 || (flags.length === 1 && flags[0] !== '--verify-only')) {
  throw new Error('Usage: node scripts/benchmark-name-parser.mjs [--verify-only]');
}
const verifyOnly = flags.length === 1;

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 10_000 });
}

function digest(source) {
  return createHash('sha256').update(source).digest('hex');
}

async function loadParser(folder, name, source) {
  // This standalone module has type-only imports; transpilation matches the real public parser.
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length ?? 0, 0, 'Parser transpilation must succeed');
  const file = join(folder, `${name}.mjs`);
  await writeFile(file, result.outputText);
  return import(pathToFileURL(file).href);
}

function verify(baseline, current) {
  let cases = 0;
  const compare = (path, kind) => {
    assert.deepEqual(current.parseMediaName(path, kind), baseline.parseMediaName(path, kind));
    assert.equal(current.isExtra(path), baseline.isExtra(path));
    cases += 1;
  };
  const alphabet = ['A', '-', ' ', '.', '_', '\u00a0', '\t', '\n', '🎬', '\u200b'];
  let words = [''];
  // Exhaustive short punctuation/Unicode combinations; no random seed or timing threshold.
  for (let depth = 0; depth <= 4; depth += 1) {
    for (const word of words) {
      compare(`Z${word}.mkv`, 'films');
      compare(`Z${word}/Season 01/S01E01.mkv`, 'series');
    }
    if (depth < 4) words = words.flatMap((word) => alphabet.map((letter) => word + letter));
  }
  for (const path of [
    '---___ .mkv',
    'Film (2020) {edition-Cut --}.mkv',
    'Film (2020) - Cut --.mkv',
    'Film (2020) [tmdbid-1]/Film.mkv',
    'Show/Specials/Clip.mkv',
  ]) {
    compare(path, 'films');
    compare(path, 'series');
  }
  return cases;
}

function medianMs(run, path) {
  run(path, 'films');
  const samples = [];
  for (let sample = 0; sample < 5; sample += 1) {
    const start = performance.now();
    run(path, 'films');
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[2];
}

assert.equal(
  git('status', '--porcelain', '--untracked-files=no').trim(),
  '',
  'Use a clean committed checkout',
);
const baselineSource = git('show', `${BASELINE}:${SOURCE}`);
const currentSource = await readFile(join(ROOT, SOURCE), 'utf8');
assert.equal(currentSource, git('show', `HEAD:${SOURCE}`), 'Current source must match HEAD');
const folder = await mkdtemp(join(tmpdir(), 'popcorntv-parser-benchmark-'));
try {
  const baseline = await loadParser(folder, 'baseline', baselineSource);
  const current = await loadParser(folder, 'current', currentSource);
  const report = {
    baselineCommit: BASELINE,
    sourceCommit: git('rev-parse', 'HEAD').trim(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    baselineSourceSha256: digest(baselineSource),
    currentSourceSha256: digest(currentSource),
    benchmarkSourceSha256: digest(await readFile(fileURLToPath(import.meta.url), 'utf8')),
    equivalenceCases: verify(baseline, current),
    verifyOnly,
    samplesPerMeasurement: verifyOnly ? 0 : 5,
    measurements: [],
  };
  if (!verifyOnly) {
    for (const length of [128, 224, 1024, 4096, 16384]) {
      for (const workload of ['matching_suffix', 'nonmatching_suffix']) {
        const path = `Film${'-'.repeat(length)}${workload === 'nonmatching_suffix' ? 'X' : ''} (2020).mkv`;
        assert.deepEqual(
          current.parseMediaName(path, 'films'),
          baseline.parseMediaName(path, 'films'),
        );
        const baselineMs = medianMs(baseline.parseMediaName, path);
        const currentMs = medianMs(current.parseMediaName, path);
        report.measurements.push({
          workload,
          hyphens: length,
          filenameBytes: Buffer.byteLength(path),
          baselineMedianMs: baselineMs,
          currentMedianMs: currentMs,
        });
      }
    }
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  // Only the private directory created above is owned by this process.
  await rm(folder, { recursive: true, force: true });
}
