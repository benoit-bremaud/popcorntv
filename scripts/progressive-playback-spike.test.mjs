/* global AbortController, Buffer */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import {
  frontIndexedMp4,
  readVerifiedRange,
  traceMode,
  verifiedPrefix,
} from './progressive-playback-spike.mjs';

const layout = { states: [2, 2, 0, 2], pieceSize: 10, fileOffset: 0, fileSize: 40 };

test('scattered completion cannot fill a missing piece in the playable prefix', () => {
  assert.equal(verifiedPrefix(layout), 20);
  assert.equal(verifiedPrefix({ ...layout, states: [0, 2, 2, 2] }), 0);
  assert.equal(verifiedPrefix({ ...layout, states: [2, 1, 2, 2] }), 10);
});

test('validated file offsets and partial final pieces are clamped to file boundaries', () => {
  assert.equal(verifiedPrefix({ ...layout, fileOffset: 5, fileSize: 12 }), 12);
  assert.equal(verifiedPrefix({ ...layout, fileOffset: 15, fileSize: 12 }), 5);
  assert.equal(verifiedPrefix({ ...layout, states: [2, 2, 2, 2], fileSize: 35 }), 35);
  assert.equal(verifiedPrefix({ ...layout, states: [], fileSize: 0 }), 0);
});

test('malformed, incomplete and overflowing layouts are rejected rather than guessing coverage', () => {
  for (const override of [
    { pieceSize: 0 },
    { pieceSize: 1.5 },
    { fileOffset: -1 },
    { fileSize: -1 },
    { states: [] },
    { states: [2, 2, 3, 2] },
    { states: null },
    { fileOffset: Number.MAX_SAFE_INTEGER, fileSize: 1 },
  ])
    assert.throws(() => verifiedPrefix({ ...layout, ...override }), RangeError);
});

test('trace mode waits for the full file for slow, equal, marginal or unknown speeds', () => {
  for (const rate of [0, -1, NaN, Infinity, 50, 100, 149])
    assert.equal(traceMode(rate, 100), 'full-file');
  assert.equal(traceMode(150, 100), 'progressive');
  assert.equal(traceMode(300, 100), 'progressive');
  assert.equal(traceMode(300, 0), 'full-file');
});

function reader(bytes) {
  let reads = 0;
  return {
    get reads() {
      return reads;
    },
    async read(buffer, offset, length, start) {
      reads++;
      const count = Math.min(length, Math.max(0, bytes.length - start));
      bytes.copy(buffer, offset, start, start + count);
      return { bytesRead: count };
    },
  };
}

test('a preallocated file is never read while its range is not verified', async () => {
  const handle = reader(Buffer.alloc(100));
  await assert.rejects(
    readVerifiedRange(handle, {
      start: 0,
      length: 20,
      size: 100,
      prefix: () => 0,
      timeoutMs: 25,
    }),
    /range_wait_timeout/,
  );
  assert.equal(handle.reads, 0);
});

test('a range becomes readable only once its entire coverage is verified', async () => {
  const bytes = Buffer.from('0123456789');
  const handle = reader(bytes);
  let available = 3;
  const pending = readVerifiedRange(handle, {
    start: 2,
    length: 4,
    size: 10,
    prefix: () => available,
    timeoutMs: 500,
  });
  await delay(15);
  assert.equal(handle.reads, 0);
  available = 6;
  assert.equal((await pending).toString(), '2345');
  assert.equal(handle.reads, 1);
});

test('bounded waits support cancellation without reading unverified content', async () => {
  const controller = new AbortController();
  const handle = reader(Buffer.alloc(100));
  const pending = readVerifiedRange(handle, {
    start: 0,
    length: 10,
    size: 100,
    prefix: () => 0,
    signal: controller.signal,
  });
  const rejected = assert.rejects(pending, { name: 'AbortError', code: 'ABORT_ERR' });
  controller.abort(new Error('cancelled'));
  await rejected;
  assert.equal(handle.reads, 0);
});

test('invalid ranges, oversized allocation and corrupt coverage fail before disk reads', async () => {
  const handle = reader(Buffer.alloc(100));
  for (const override of [
    { start: -1 },
    { length: 0 },
    { start: 90, length: 11 },
    { length: 16385, size: 20000 },
    { prefix: () => 101 },
    { prefix: () => NaN },
    { timeoutMs: 0 },
  ]) {
    await assert.rejects(
      readVerifiedRange(handle, {
        start: 0,
        length: 10,
        size: 100,
        prefix: () => 100,
        ...override,
      }),
      RangeError,
    );
  }
  assert.equal(handle.reads, 0);
});

test('a short read after coverage validation is an error, not final EOF', async () => {
  await assert.rejects(
    readVerifiedRange(reader(Buffer.alloc(3)), {
      start: 0,
      length: 10,
      size: 100,
      prefix: () => 100,
    }),
    /verified_read_short/,
  );
});

function box(kind, body = Buffer.alloc(0)) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length);
  header.write(kind, 4, 4, 'ascii');
  return Buffer.concat([header, body]);
}

test('front metadata is identified by box structure, not a moov string in the media payload', () => {
  const media = box('mdat', Buffer.from('moov'));
  assert.equal(frontIndexedMp4(Buffer.concat([box('ftyp'), box('moov'), media])), true);
  assert.equal(frontIndexedMp4(Buffer.concat([box('ftyp'), media, box('moov')])), false);
  assert.equal(frontIndexedMp4(Buffer.from('not an mp4 moov')), false);
});

test('truncated and invalid extended box sizes do not establish metadata readiness', () => {
  const extended = Buffer.alloc(16);
  extended.writeUInt32BE(1);
  extended.write('moov', 4);
  extended.writeBigUInt64BE(16n, 8);
  assert.equal(frontIndexedMp4(extended), true);
  assert.equal(frontIndexedMp4(extended.subarray(0, 12)), false);
  extended.writeBigUInt64BE(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 8);
  assert.equal(frontIndexedMp4(extended), false);
  const invalid = box('moov');
  invalid.writeUInt32BE(4);
  assert.equal(frontIndexedMp4(invalid), false);
});

test('a seek beyond verified coverage waits instead of serving a preallocated hole', async () => {
  const handle = reader(Buffer.alloc(100));
  await assert.rejects(
    readVerifiedRange(handle, {
      start: 80,
      length: 10,
      size: 100,
      prefix: () => 64,
      timeoutMs: 25,
    }),
    /range_wait_timeout/,
  );
  assert.equal(handle.reads, 0);
});
