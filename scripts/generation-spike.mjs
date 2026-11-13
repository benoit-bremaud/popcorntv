/* global Buffer */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, open, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeTransfer } from './qbittorrent-spike.mjs';
import {
  createSyntheticFixture,
  decodeSyntheticMedia,
  readVerifiedRange,
} from './progressive-playback-spike.mjs';

/** Open the expected immutable local generation; a replaced path never silently changes identity.
 * This experiment assumes an immutable inode, not a production lease against in-place writes.
 * Callers own the returned handle and must close it before deleting their workspace.
 */
export async function openGeneration(path, expected, openFile = open) {
  const handle = await openFile(path, 'r');
  try {
    const actual = await handle.stat({ bigint: true });
    for (const key of ['dev', 'ino', 'size', 'mtimeNs']) {
      assert.equal(actual[key], expected[key], 'media_generation_changed');
    }
    return handle;
  } catch (error) {
    throw await closeTransfer(error, [['generation-open', () => handle.close()]]);
  }
}

/** Prove stale-open rejection without swallowing an unsafe-close marker or losing an accepted handle. */
export async function rejectStaleGeneration(path, expected, handles, openFile = open) {
  try {
    const handle = await openGeneration(path, expected, openFile);
    handles.add(handle);
  } catch (error) {
    if (error.cleanupIncomplete) throw error;
    assert.match(error.message, /^media_generation_changed/);
    return;
  }
  throw new Error('stale_generation_open_accepted');
}

/** Preserve a late mutation failure alongside decoder failure, including either unsafe-cleanup marker. */
export function generationFailure(primary, mutationError) {
  if (!mutationError || primary === mutationError) return primary;
  if (!primary) return mutationError;
  const failure = new AggregateError([primary, mutationError], 'generation_and_decoder_failed');
  failure.cleanupIncomplete =
    primary.cleanupIncomplete === true || mutationError.cleanupIncomplete === true;
  return failure;
}

/** Attempt every descriptor close; retain the workspace if any close or prior cleanup is uncertain. */
export async function settleGeneration(root, handles, primary) {
  const failure = await closeTransfer(
    primary,
    [...handles].map((handle, index) => [`generation-reader-${index}`, () => handle.close()]),
  );
  if (!failure?.cleanupIncomplete) await rm(root, { recursive: true, force: true });
  return failure;
}

/** Decode through an open descriptor while its path is renamed and replaced with wrong bytes.
 * Uses a complete synthetic reference and a controlled half-file range gate; no real import occurs.
 * New opens with the stale identity must fail; revalidated renamed opens must match the source.
 */
export async function runGenerationSpike({ failMutation = false } = {}) {
  assert.equal(typeof failMutation, 'boolean');
  const root = await mkdtemp(join(tmpdir(), 'popcorntv-generation-'));
  const handles = new Set();
  let primary;
  let mutation;
  let mutationError;
  let evidence;
  try {
    const fixture = await createSyntheticFixture(root, 30);
    const reference = await decodeSyntheticMedia({ inputPath: fixture.front });
    const initial = await open(fixture.front, 'r');
    handles.add(initial);
    const identity = await initial.stat({ bigint: true });
    const imported = join(root, 'imported.mp4');
    const half = Math.floor(fixture.bytes.length / 32768) * 16384;
    let prefix = half;
    let bytesFed = 0;
    let atFirstFrame;
    const result = await decodeSyntheticMedia({
      timeoutMs: 15_000,
      onVideoFrame: () => {
        atFirstFrame = bytesFed;
        mutation = (async () => {
          assert(bytesFed < fixture.bytes.length, 'Rename must precede decoder input completion');
          await rename(fixture.front, imported);
          if (failMutation) throw new Error('injected_generation_mutation_failure');
          await writeFile(fixture.front, Buffer.alloc(fixture.bytes.length, 0x5a));
          await rejectStaleGeneration(fixture.front, identity, handles);
          const renamed = await openGeneration(imported, identity);
          handles.add(renamed);
          const contents = await renamed.readFile();
          assert(contents.equals(fixture.bytes));
          prefix = fixture.bytes.length;
        })().catch((error) => {
          mutationError = error;
        });
      },
      feed: async (stdin, signal) => {
        for (let offset = 0; offset < fixture.bytes.length; offset += 16384) {
          const bytes = await readVerifiedRange(initial, {
            start: offset,
            length: Math.min(16384, fixture.bytes.length - offset),
            size: fixture.bytes.length,
            prefix: () => {
              if (mutationError) throw mutationError;
              return prefix;
            },
            timeoutMs: 5000,
            signal,
          });
          assert(bytes.equals(fixture.bytes.subarray(offset, offset + bytes.length)));
          bytesFed += bytes.length;
          if (!stdin.write(bytes)) await once(stdin, 'drain', { signal });
        }
      },
    });
    await mutation;
    if (mutationError) throw mutationError;
    assert(mutation, 'No active playback rename occurred');
    assert.equal(result.frames, reference.frames);
    assert.equal(result.subtitles, reference.subtitles);
    evidence = {
      fixtureBytes: fixture.bytes.length,
      bytesFedAtFirstFrame: atFirstFrame,
      renamedDuringActiveDecode: true,
      oldDescriptorDecodedReference: true,
      staleGenerationOpenRejected: true,
      renamedGenerationRevalidated: true,
      scope:
        'POSIX immutable local inode; controlled gate; not an arr import or in-place mutation lease',
    };
  } catch (error) {
    primary = error;
  }
  // Mutation may still own file work when decoding fails; settle it before closing/removal.
  await mutation;
  const failure = await settleGeneration(root, handles, generationFailure(primary, mutationError));
  if (failure) throw failure;
  return evidence;
}
