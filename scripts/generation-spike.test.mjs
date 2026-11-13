/* global process, console */
import assert from 'node:assert/strict';
import { mkdtemp, open, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  openGeneration,
  runGenerationSpike,
  settleGeneration,
  rejectStaleGeneration,
  generationFailure,
} from './generation-spike.mjs';

test('generation opens accept the exact renamed inode and reject replacement or missing paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'popcorntv-generation-test-'));
  try {
    const path = join(root, 'source');
    const moved = join(root, 'moved');
    await writeFile(path, 'source');
    const source = await open(path, 'r');
    let expected;
    try {
      expected = await source.stat({ bigint: true });
    } finally {
      await source.close();
    }
    for (const key of ['dev', 'ino', 'size', 'mtimeNs'])
      await assert.rejects(
        openGeneration(path, { ...expected, [key]: expected[key] + 1n }),
        /media_generation_changed/,
      );
    const held = new Set();
    await assert.rejects(
      rejectStaleGeneration(path, expected, held),
      /stale_generation_open_accepted/,
    );
    assert.equal(held.size, 1);
    for (const handle of held) await handle.close();
    const same = await openGeneration(path, expected);
    await same.close();
    await rename(path, moved);
    const renamed = await openGeneration(moved, expected);
    await renamed.close();
    await assert.rejects(openGeneration(path, expected), { code: 'ENOENT' });
    await writeFile(path, 'source');
    await rejectStaleGeneration(path, expected, new Set());
    await assert.rejects(openGeneration(path, expected), /media_generation_changed/);
    await writeFile(moved, 'changed contents');
    await assert.rejects(openGeneration(moved, expected), /media_generation_changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('generation mismatch preserves close failure and prevents workspace removal', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const mismatch = { dev: 1n, ino: 2n, size: 3n, mtimeNs: 4n };
  const closeError = new Error('close failed');
  let primary;
  await assert.rejects(
    rejectStaleGeneration('unused', { ...mismatch, dev: 2n }, new Set(), async () => ({
      stat: async () => mismatch,
      close: async () => {
        throw closeError;
      },
    })),
    (error) => {
      primary = error;
      assert(error.cleanupIncomplete);
      assert.match(error.errors[0].message, /^media_generation_changed/);
      assert.equal(error.errors[1], closeError);
      return true;
    },
  );
  const root = await mkdtemp(join(tmpdir(), 'popcorntv-generation-retain-'));
  try {
    const attempts = [];
    const failure = await settleGeneration(
      root,
      [
        {
          close: async () => {
            attempts.push(1);
            throw closeError;
          },
        },
        {
          close: async () => {
            attempts.push(2);
          },
        },
      ],
      primary,
    );
    assert.deepEqual(attempts, [1, 2]);
    assert(failure.cleanupIncomplete);
    assert.equal(failure.errors[0], primary);
    const retained = await open(root, 'r');
    await retained.close();
    assert.equal(await settleGeneration(root, [], primary), primary);
    const stillRetained = await open(root, 'r');
    await stillRetained.close();
    await settleGeneration(root, [], new Error('ordinary failure'));
    await assert.rejects(open(root, 'r'), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('late mutation failure preserves decoder failure and either cleanup marker', () => {
  const decoder = new Error('decoder');
  const mutation = new Error('mutation');
  assert.equal(generationFailure(undefined, undefined), undefined);
  assert.equal(generationFailure(decoder, undefined), decoder);
  assert.equal(generationFailure(undefined, mutation), mutation);
  assert.equal(generationFailure(mutation, mutation), mutation);
  const ordinary = generationFailure(decoder, mutation);
  assert.deepEqual(ordinary.errors, [decoder, mutation]);
  assert.equal(ordinary.cleanupIncomplete, false);
  for (const index of [0, 1]) {
    const failures = [new Error('decoder'), new Error('mutation')];
    failures[index].cleanupIncomplete = true;
    const merged = generationFailure(...failures);
    assert.equal(merged.cleanupIncomplete, true);
    assert.deepEqual(merged.errors, failures);
  }
});

test('generation experiment rejects invalid fault controls before creating resources', async () => {
  await assert.rejects(runGenerationSpike({ failMutation: 'yes' }));
});

if (process.env['RUN_GENERATION_SPIKE'] === '1') {
  test(
    'failed rename preparation aborts blocked decode and settles cleanup',
    { timeout: 30_000 },
    async () => {
      await assert.rejects(
        runGenerationSpike({ failMutation: true }),
        /injected_generation_mutation_failure/,
      );
    },
  );
  test(
    'active decoder survives rename while new opens reject a replacement generation',
    { timeout: 30_000 },
    async () => {
      const result = await runGenerationSpike();
      assert(result.renamedDuringActiveDecode);
      assert(result.bytesFedAtFirstFrame < result.fixtureBytes);
      assert(result.oldDescriptorDecodedReference);
      assert(result.staleGenerationOpenRejected);
      assert(result.renamedGenerationRevalidated);
      console.log(JSON.stringify({ event: 'generation.result', result }));
    },
  );
}
