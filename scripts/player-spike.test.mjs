/* global Buffer, process, setImmediate, console */
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import {
  verifiedPipeArgs,
  verifiedTranscoder,
  runPlayerSpike,
  hasDecodedFrame,
  hasFrenchCue,
  hasEnded,
  runPlayerCli,
} from './player-spike.mjs';

test('CLI refuses implicit execution and reports results/errors without leaking exception values', async (t) => {
  const output = [],
    errors = [];
  t.mock.method(console, 'log', (line) => output.push(line));
  t.mock.method(console, 'error', (line) => errors.push(line));
  let calls = 0;
  const execute = async () => {
    calls += 1;
    return { stage: 'fixture' };
  };
  assert.equal(await runPlayerCli([], execute), 2);
  assert.equal(calls, 0);
  assert.equal(await runPlayerCli(['--run'], execute), 0);
  assert.deepEqual(JSON.parse(output[0]), { stage: 'fixture' });
  assert.equal(
    await runPlayerCli(['--run'], async () => {
      throw new Error('fixture-secret-value');
    }),
    1,
  );
  assert.equal(errors.join('').includes('fixture-secret-value'), false);
});

test('browser predicates use the current document when no element was supplied', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { querySelector: () => null },
  });
  try {
    assert.equal(hasDecodedFrame(), false);
    assert.equal(hasFrenchCue(), false);
    assert.equal(hasEnded(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
});

test('browser observations refuse absent/undecoded/failed media and require actual cues', () => {
  assert.equal(hasDecodedFrame(null), false);
  assert.equal(hasDecodedFrame({ currentTime: 0 }), false);
  assert.equal(
    hasDecodedFrame({ currentTime: 1, getVideoPlaybackQuality: () => ({ totalVideoFrames: 0 }) }),
    false,
  );
  assert.equal(
    hasDecodedFrame({ currentTime: 1, getVideoPlaybackQuality: () => ({ totalVideoFrames: 1 }) }),
    true,
  );
  assert.equal(hasFrenchCue(null), false);
  assert.equal(hasFrenchCue({ textTracks: [] }), false);
  assert.equal(hasFrenchCue({ textTracks: [{ cues: null }] }), false);
  assert.equal(hasFrenchCue({ textTracks: [{ cues: [{ text: 'Wrong cue' }] }] }), false);
  const track = { mode: 'disabled', cues: [{ text: 'Sous-titre synthetique de test.' }] };
  assert.equal(hasFrenchCue({ textTracks: [track] }), true);
  assert.equal(track.mode, 'showing');
  assert.equal(hasEnded(null), false);
  assert.equal(hasEnded({ ended: false, error: null }), false);
  assert.equal(hasEnded({ ended: true, error: { code: 3 } }), false);
  assert.equal(hasEnded({ ended: true, error: null, currentTime: 6 }), false);
  assert.equal(hasEnded({ ended: true, error: null, currentTime: 30 }), true);
});

const args = [
  '-protocol_whitelist',
  'file',
  '-format_whitelist',
  'mov',
  '-i',
  '/fixture.mp4',
  '-map',
  '0:a:1',
  '-f',
  'hls',
  '/output/index.m3u8',
];

test('verified pipe adaptation preserves audio/output restrictions without changing its input', () => {
  const adapted = verifiedPipeArgs(args, '/fixture.mp4');
  assert.equal(adapted[1], 'pipe');
  assert.equal(adapted[5], 'pipe:0');
  assert.deepEqual(adapted.slice(6), args.slice(6));
  assert.equal(args[1], 'file');
});

test('pipe adaptation refuses resumes, extra inputs, foreign paths or relaxed protocols', () => {
  for (const unsafe of [
    [...args, '-i', '/another.mp4'],
    ['-ss', '1', ...args],
    args.map((value) => (value === '/fixture.mp4' ? '/another.mp4' : value)),
    args.map((value) => (value === 'file' ? 'file,http' : value)),
    args.filter((value) => value !== '-i'),
    args.filter((value) => value !== '-protocol_whitelist'),
  ])
    assert.throws(() => verifiedPipeArgs(unsafe, '/fixture.mp4'));
});

function boundary({
  bytes,
  prefix = () => bytes.length,
  mismatch = false,
  autoExit = true,
  readTimeoutMs = 1000,
  lifetimeMs = 1000,
}) {
  const output = [];
  const exits = [];
  let child;
  const adapter = verifiedTranscoder({
    path: '/fixture.mp4',
    bytes,
    prefix,
    readTimeoutMs,
    lifetimeMs,
    handle: {
      read: async (buffer, offset, length, position) => {
        buffer.set(bytes.subarray(position, position + length), offset);
        if (mismatch) buffer[0] ^= 255;
        return { bytesRead: length };
      },
    },
    spawnProcess: (_binary, actualArgs) => {
      assert(actualArgs.includes('pipe:0'));
      child = new EventEmitter();
      // Small capacity exercises backpressure through an actual Node stream.
      child.stdin = new PassThrough({ highWaterMark: 1 });
      child.stderr = new PassThrough();
      child.stdin.on('data', (part) => output.push(part));
      let closed = false;
      const finish = (code) => {
        if (closed) return;
        closed = true;
        child.emit('exit', code);
        child.emit('close', code);
      };
      child.kill = () => {
        setImmediate(() => finish(null));
        return true;
      };
      child.stdin.on('finish', () => {
        if (autoExit) setImmediate(() => finish(0));
      });
      return child;
    },
  });
  const handle = adapter.run(args, (code, stderr) => exits.push({ code, stderr }));
  return { adapter, output, exits, handle, child };
}

test('feeder transfers independently checked ranges and awaits child termination', async () => {
  const bytes = Buffer.alloc(40_000, 17);
  const state = boundary({ bytes });
  await once(state.child, 'close');
  await state.adapter.close();
  assert(Buffer.concat(state.output).equals(bytes));
  assert.deepEqual(state.exits, [{ code: 0, stderr: '' }]);
});

test('cache mismatch kills the child before any corrupted byte is delivered', async () => {
  const state = boundary({ bytes: Buffer.from('fixture'), mismatch: true });
  await once(state.child, 'close');
  await state.adapter.close();
  assert.equal(state.output.length, 0);
  assert.equal(state.exits[0].code, null);
});

test('missing verified coverage reaches a bounded failure without serving holes', async () => {
  const state = boundary({ bytes: Buffer.from('fixture'), prefix: () => 0, readTimeoutMs: 15 });
  await once(state.child, 'close');
  await state.adapter.close();
  assert.equal(state.output.length, 0);
  assert.equal(state.exits.length, 1);
});

test('close cancels an in-flight missing range and a stalled child watchdog also terminates', async () => {
  const state = boundary({ bytes: Buffer.from('fixture'), prefix: () => 0 });
  await state.adapter.close();
  assert.equal(state.output.length, 0);
  assert.equal(state.exits.length, 1);
  const stalled = boundary({ bytes: Buffer.from('fixture'), autoExit: false, lifetimeMs: 15 });
  await once(stalled.child, 'close');
  await stalled.adapter.close();
  assert.equal(stalled.exits.length, 1);
});

test('the session handle cancels its own source reader and child', async () => {
  const state = boundary({ bytes: Buffer.from('fixture'), prefix: () => 0 });
  state.handle.kill();
  await state.adapter.close();
  assert.equal(state.output.length, 0);
  assert.equal(state.exits.length, 1);
});

test('spawn error plus exit notifies once and stderr retention is bounded', async () => {
  const state = boundary({ bytes: Buffer.from('fixture'), prefix: () => 0 });
  state.child.stderr.write('x'.repeat(3000));
  // A failed process can emit error and later close/exit: its consumer sees one outcome.
  state.child.emit('error', new Error('synthetic process failure'));
  await state.adapter.close();
  assert.equal(state.exits.length, 1);
  assert.equal(state.exits[0].stderr.length, 2048);
});

// Explicit opt-in: the default file has only fast tests, with no browser or real FFmpeg.
if (process.argv.includes('--browser')) {
  test(
    'production player decodes a verified incomplete source and releases its session',
    { timeout: 90_000 },
    async (t) => {
      let result;
      t.mock.method(console, 'log', (line) => {
        result = JSON.parse(line);
      });
      assert.equal(await runPlayerCli(['--run']), 0);
      assert.equal(result.firstBrowserFrame.complete, false);
      assert.equal(result.firstBrowserFrame.allReferenceBytesPresent, false);
      assert.equal(result.frenchAudioMapped, true);
      assert.equal(result.frenchSubtitleCueLoaded, true);
      assert.equal(result.normalPlaybackEndObserved, true);
      assert.equal(result.transportEscapeDenied, true);
      assert.deepEqual(result.pageErrors, []);
      process.stderr.write(JSON.stringify({ event: 'player.measured_result', result }) + '\n');
    },
  );
  test(
    'closing the actual player during recovery cancels its session and cleans up',
    { timeout: 60_000 },
    async () => {
      const result = await runPlayerSpike({ cancelAfterFirstFrame: true });
      assert.equal(result.cancelledWhileIncomplete, true);
      assert.equal(result.sessionDeleteConfirmed, true);
      process.stderr.write(JSON.stringify({ event: 'player.cancel_result', result }) + '\n');
    },
  );
}
