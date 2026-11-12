/* global process, console */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCombinedSpike, runCombinedCli } from './combined-player-spike.mjs';
import { runBackendSpike } from './qbittorrent-spike.mjs';
import { runPlayerSpike } from './player-spike.mjs';

test('backend consumer shape is validated before any temporary resource is allocated', async () => {
  await assert.rejects(runBackendSpike({ consume: 'not-a-function' }));
});

test('combined CLI requires opt-in and never serializes raw exception payloads', async (t) => {
  const output = [],
    errors = [];
  t.mock.method(console, 'log', (line) => output.push(line));
  t.mock.method(console, 'error', (line) => errors.push(line));
  let calls = 0;
  const execute = async () => {
    calls++;
    return { stage: 'fixture' };
  };
  assert.equal(await runCombinedCli([], execute), 2);
  assert.equal(calls, 0);
  assert.equal(await runCombinedCli(['--run'], execute), 0);
  assert.deepEqual(JSON.parse(output[0]), { stage: 'fixture' });
  assert.equal(
    await runCombinedCli(['--run'], async () => {
      throw new Error('fixture-secret-value');
    }),
    1,
  );
  assert.equal(errors.join('').includes('fixture-secret-value'), false);
});

// Real Docker/browser scenarios are explicit and sequential; no public peer or VPN is contacted.
if (process.argv.includes('--combined') || process.env['RUN_COMBINED_SPIKE'] === '1') {
  test(
    'real backend and player start with an active French cue and finish the video',
    { timeout: 180_000 },
    async (t) => {
      let result;
      t.mock.method(console, 'log', (line) => {
        result = JSON.parse(line);
      });
      assert.equal(await runCombinedCli(['--run']), 0);
      assert.equal(result.browserVerified, true);
      assert.equal(result.hlsVerified, true);
      assert.equal(result.completeFileBytesMatch, true);
      assert.equal(result.browserResult.normalPlaybackEndObserved, true);
      assert.equal(result.browserResult.subtitleReadyBeforeVideo, true);
      assert.equal(result.browserResult.activeCueAtFirstFrame.activeFrenchCue, true);
      process.stderr.write(JSON.stringify({ event: 'combined.measured_result', result }) + '\n');
    },
  );

  test(
    'real combined cancellation closes the player while the backend can finish safely',
    { timeout: 180_000 },
    async () => {
      const result = await runCombinedSpike({ cancelAfterFirstFrame: true });
      assert.equal(result.browserResult.cancelledWhileIncomplete, true);
      assert.equal(result.browserResult.sessionDeleteConfirmed, true);
      assert.equal(result.browserResult.subtitleReadyBeforeVideo, true);
      assert.equal(result.completeFileBytesMatch, true);
      process.stderr.write(JSON.stringify({ event: 'combined.cancel_result', result }) + '\n');
    },
  );

  test(
    'a rejected resume never releases segments or reports a video frame',
    { timeout: 120_000 },
    async (t) => {
      const events = [];
      t.mock.method(console, 'error', (line) => events.push(line));
      await assert.rejects(
        runBackendSpike({
          consume: (source) =>
            runPlayerSpike({
              source: {
                ...source,
                resume: async () => {
                  throw new Error('synthetic_resume_failure');
                },
              },
            }),
        }),
        /synthetic_resume_failure/,
      );
      assert.equal(
        events.some((line) => line.includes('player.caption_gate_released')),
        false,
      );
      assert.equal(
        events.some((line) => line.includes('player.first_browser_frame')),
        false,
      );
      assert.equal(
        events.some((line) => line.includes('player.cleanup_completed')),
        true,
      );
    },
  );
}
