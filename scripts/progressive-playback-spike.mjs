#!/usr/bin/env node
/* global AbortController, Buffer, console, process */
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { open, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { setTimeout, clearTimeout } from 'node:timers';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const CHUNK = 16 * 1024;
const OUTPUT_CAP = 2 * 1024 * 1024;

function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError('Invalid byte layout');
  return value;
}

/** Translate a validated file offset and downloaded pieces into a contiguous prefix, never a percentage. */
export function verifiedPrefix({ states, pieceSize, fileOffset, fileSize }) {
  integer(pieceSize, 1);
  integer(fileOffset);
  integer(fileSize);
  integer(fileOffset + fileSize);
  if (!Array.isArray(states) || states.some((state) => ![0, 1, 2].includes(state))) {
    throw new RangeError('Invalid piece states');
  }
  if (fileSize === 0) return 0;
  if (states.length < Math.ceil((fileOffset + fileSize) / pieceSize)) {
    throw new RangeError('Incomplete piece layout');
  }
  let cursor = fileOffset;
  const end = fileOffset + fileSize;
  while (cursor < end && states[Math.floor(cursor / pieceSize)] === 2) {
    cursor = Math.min(end, (Math.floor(cursor / pieceSize) + 1) * pieceSize);
  }
  return cursor - fileOffset;
}

/** Experimental trace classification only; not the future production readiness policy (#312). */
export function traceMode(recoveryBytesPerSec, consumptionBytesPerSec) {
  if (![recoveryBytesPerSec, consumptionBytesPerSec].every((n) => Number.isFinite(n) && n > 0)) {
    return 'full-file';
  }
  return recoveryBytesPerSec >= consumptionBytesPerSec * 1.5 ? 'progressive' : 'full-file';
}

/** Read only a bounded verified range; lack of future bytes is a timeout, not EOF. */
export async function readVerifiedRange(
  handle,
  { start, length, size, prefix, signal, timeoutMs = 500 },
) {
  integer(start);
  integer(length, 1);
  integer(size, 1);
  if (length > CHUNK || start + length > size || !Number.isSafeInteger(start + length)) {
    throw new RangeError('Invalid read range');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid wait limit');
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    signal?.throwIfAborted();
    const available = integer(prefix());
    if (available > size) throw new RangeError('Invalid verified prefix');
    if (start + length <= available) {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      if (bytesRead !== length) throw new Error('verified_read_short');
      return buffer;
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) throw new Error('range_wait_timeout');
    await delay(Math.min(10, remaining), undefined, { signal });
  }
}

/** Scan top-level ISO BMFF boxes rather than searching arbitrary payload bytes for "moov". */
export function frontIndexedMp4(bytes) {
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = bytes.readUInt32BE(offset);
    const kind = bytes.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) return false;
      const wide = bytes.readBigUInt64BE(offset + 8);
      if (wide > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      size = Number(wide);
      header = 16;
    }
    if (size === 0) size = bytes.length - offset;
    if (size < header || offset + size > bytes.length) return false;
    if (kind === 'mdat') return false;
    if (kind === 'moov') return true;
    offset += size;
  }
  return false;
}

async function command(binary, args) {
  return execute(binary, args, { timeout: 30_000, maxBuffer: OUTPUT_CAP });
}

/** Decode real video/audio and extract subtitles. A stalled feeder is killed within the bounded deadline. */
async function decode({ inputPath, feed, onVideoFrame = () => undefined, timeoutMs = 20_000 }) {
  const controller = new AbortController();
  const child = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-protocol_whitelist',
      inputPath ? 'file' : 'pipe',
      '-probesize',
      '32768',
      '-analyzeduration',
      '100000',
      '-i',
      inputPath ?? 'pipe:0',
      '-map',
      '0:v:0',
      '-map',
      '0:a:0',
      '-map',
      '0:a:1',
      '-flush_packets',
      '1',
      '-f',
      'framemd5',
      'pipe:1',
      '-map',
      '0:s:0',
      '-f',
      'webvtt',
      'pipe:3',
    ],
    { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] },
  );
  const buffers = ['', '', ''];
  let firstVideo = false;
  const collect = (stream, slot) =>
    stream.on('data', (chunk) => {
      buffers[slot] += chunk.toString();
      if (buffers[slot].length > OUTPUT_CAP) controller.abort(new Error('decoder_output_limit'));
      if (slot === 0 && !firstVideo && /^0,\s/m.test(buffers[slot])) {
        firstVideo = true;
        onVideoFrame();
      }
    });
  collect(child.stdout, 0);
  collect(child.stderr, 1);
  collect(child.stdio[3], 2);
  // A decoder that rejects input can close stdin while the bounded feeder is still writing.
  child.stdin.on('error', () => undefined);
  const terminate = () => {
    child.kill('SIGKILL');
  };
  controller.signal.addEventListener('abort', terminate, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('decoder_timeout')), timeoutMs);
  const closed = once(child, 'close');
  const pumping = (async () => {
    try {
      if (feed) await feed(child.stdin, controller.signal);
      child.stdin.end();
    } catch (error) {
      controller.abort(error);
      throw error;
    }
  })();
  try {
    const results = await Promise.allSettled([closed, pumping]);
    if (controller.signal.aborted) throw controller.signal.reason;
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    const [code] = results[0].value;
    if (code !== 0) throw new Error(`decoder_failed:${code}: ${buffers[1].slice(0, 500)}`);
    assert(firstVideo, 'No video frame decoded');
    return {
      frames: buffers[0]
        .split('\n')
        .filter((line) => line !== '' && !line.startsWith('#'))
        .join('\n'),
      subtitles: buffers[2],
    };
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', terminate);
    child.stdin.destroy();
  }
}

async function fixture(directory) {
  const subtitle = join(directory, 'captions.srt');
  await writeFile(subtitle, '1\n00:00:00,000 --> 00:00:02,000\nSous-titre synthetique de test.\n');
  const front = join(directory, 'front.mp4');
  await command('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=10',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=660:sample_rate=48000',
    '-i',
    subtitle,
    '-t',
    '6',
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-map',
    '2:a',
    '-map',
    '3:s',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-g',
    '10',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '32k',
    '-c:s',
    'mov_text',
    '-metadata:s:a:0',
    'language=eng',
    '-metadata:s:a:1',
    'language=fra',
    '-metadata:s:s:0',
    'language=fra',
    '-movflags',
    '+faststart',
    front,
  ]);
  const tail = join(directory, 'tail.mp4');
  await command('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-i',
    front,
    '-map',
    '0',
    '-c',
    'copy',
    tail,
  ]);
  const { stdout } = await command('ffprobe', [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    front,
  ]);
  const probe = JSON.parse(stdout);
  assert.deepEqual(
    probe.streams.filter((s) => s.codec_type === 'audio').map((s) => s.tags.language),
    ['eng', 'fra'],
  );
  assert(probe.streams.some((s) => s.codec_type === 'subtitle' && s.tags.language === 'fra'));
  return { front, tail, bytes: await readFile(front), durationSec: Number(probe.format.duration) };
}

async function writeAll(handle, bytes, start) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await handle.write(
      bytes,
      offset,
      bytes.length - offset,
      start + offset,
    );
    if (bytesWritten === 0) throw new Error('cache_write_stalled');
    offset += bytesWritten;
  }
}

async function transfer(directory, name, source, bytesPerSecond, reference, durationSec) {
  const cache = await open(join(directory, `${name}.partial`), 'wx+');
  const controller = new AbortController();
  const state = { verified: 0, complete: false };
  const began = performance.now();
  const mode = traceMode(bytesPerSecond, source.length / durationSec);
  let firstFrame = null;
  // Deliberate preallocation: stat size is full even when no verified bytes exist.
  await cache.truncate(source.length);
  const producer = (async () => {
    for (let offset = 0; offset < source.length; offset += CHUNK) {
      await delay((CHUNK / bytesPerSecond) * 1000, undefined, { signal: controller.signal });
      const bytes = source.subarray(offset, Math.min(source.length, offset + CHUNK));
      await writeAll(cache, bytes, offset);
      const observed = Buffer.alloc(bytes.length);
      const result = await cache.read(observed, 0, observed.length, offset);
      assert.equal(result.bytesRead, observed.length);
      assert.deepEqual(observed, bytes, 'Writer verification mismatch');
      state.verified += bytes.length;
    }
    state.complete = true;
  })();
  // Observe failures immediately, even while waiting for an initial buffer or full-file mode.
  const producerOutcome = producer.then(
    () => null,
    (error) => error,
  );
  try {
    if (mode === 'full-file') {
      const failure = await producerOutcome;
      if (failure) throw failure;
    } else {
      while (state.verified < Math.min(source.length, CHUNK * 4)) {
        const failure = await Promise.race([producerOutcome, delay(10).then(() => null)]);
        if (failure) throw failure;
      }
    }
    const result = await decode({
      feed: async (stdin, signal) => {
        for (let offset = 0; offset < source.length; offset += CHUNK) {
          const bytes = await readVerifiedRange(cache, {
            start: offset,
            length: Math.min(CHUNK, source.length - offset),
            size: source.length,
            prefix: () => state.verified,
            signal,
            timeoutMs: 1000,
          });
          if (!stdin.write(bytes)) await once(stdin, 'drain', { signal });
        }
      },
      onVideoFrame: () => {
        firstFrame = {
          afterMs: Math.round(performance.now() - began),
          verifiedBytes: state.verified,
          complete: state.complete,
        };
      },
    });
    const failure = await producerOutcome;
    if (failure) throw failure;
    assert.equal(result.frames, reference.frames, 'Decoded video/audio differs from complete file');
    assert.equal(
      result.subtitles,
      reference.subtitles,
      'Decoded subtitles differ from complete file',
    );
    assert.equal(firstFrame.complete, mode === 'full-file', 'Unexpected readiness timing');
    return {
      mode,
      inputBytesPerSec: Math.round(bytesPerSecond),
      elapsedMs: Math.round(performance.now() - began),
      firstFrame,
      decodedMatchesReference: true,
    };
  } finally {
    controller.abort();
    await producerOutcome;
    await cache.close();
  }
}

/** Opt-in experiment only; no network, backend connection, installation or permanent media access. */
export async function runSpike() {
  const directory = await mkdtemp(join(tmpdir(), 'popcorntv-progressive-'));
  try {
    const { front, tail, bytes, durationSec } = await fixture(directory);
    assert(frontIndexedMp4(bytes));
    assert.equal(
      frontIndexedMp4(await readFile(tail)),
      false,
      'End-metadata control unexpectedly front indexed',
    );
    const reference = await decode({ inputPath: front });
    assert(reference.subtitles.includes('Sous-titre synthetique de test.'));
    const average = bytes.length / durationSec;
    const fast = await transfer(directory, 'fast', bytes, average * 3, reference, durationSec);
    const slow = await transfer(directory, 'slow', bytes, average / 2, reference, durationSec);
    const stalled = await open(join(directory, 'stalled.partial'), 'wx+');
    try {
      await stalled.truncate(bytes.length);
      await assert.rejects(
        readVerifiedRange(stalled, {
          start: 0,
          length: CHUNK,
          size: bytes.length,
          prefix: () => 0,
          timeoutMs: 100,
        }),
        /range_wait_timeout/,
      );
    } finally {
      await stalled.close();
    }
    await assert.rejects(
      decode({
        feed: async (_stdin, signal) => {
          await delay(5000, undefined, { signal });
        },
        timeoutMs: 100,
      }),
      /decoder_timeout/,
    );
    const ffmpegVersion = await command('ffmpeg', ['-version']);
    const ffprobeVersion = await command('ffprobe', ['-version']);
    return {
      verdict: 'PARTIAL',
      stage: 'deterministic local media mechanics',
      tools: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        ffmpeg: ffmpegVersion.stdout.split('\n')[0],
        ffprobe: ffprobeVersion.stdout.split('\n')[0],
      },
      backendVerified: false,
      browserVerified: false,
      hlsVerified: false,
      piVerified: false,
      fixture: {
        bytes: bytes.length,
        durationSec,
        audioTags: ['eng', 'fra'],
        subtitleTag: 'fra',
        synthetic: true,
      },
      fast,
      slow,
      missingRangeTimesOut: true,
      stalledDecoderTerminated: true,
      endMetadataRequiresFallback: true,
      limits: [
        'Illustrative trace thresholds, not production readiness policy',
        'No real qBittorrent or other backend',
        'No player/HLS/seek/import/restart integration proof',
        'Audio language labels are synthetic, not linguistic validation',
      ],
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--run') {
    console.error('Usage: node scripts/progressive-playback-spike.mjs --run');
    process.exitCode = 2;
  } else {
    runSpike().then(
      (result) => console.log(JSON.stringify(result, null, 2)),
      (error) => {
        console.error(error);
        process.exitCode = 1;
      },
    );
  }
}
