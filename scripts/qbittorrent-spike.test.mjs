/* global Buffer, process, structuredClone, console */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'node:test';
import {
  bencode,
  fixtureTorrent,
  validateTopology,
  parseApiResponse,
  verifyCachePrefix,
  closeTransfer,
  stopBackend,
  commandBudget,
  parseResourceSample,
  validateBrowserEvidence,
  runBackendSpike,
} from './qbittorrent-spike.mjs';

if (process.env['RUN_BACKEND_SPIKE'] === '1') {
  test(
    'standalone backend still decodes matching frames and restores completed restart',
    { timeout: 150_000 },
    async () => {
      const result = await runBackendSpike();
      assert.equal(result.byteAndDecodeMatch, true);
      assert.equal(result.completedTransferRestartRestored, true);
      assert.equal(result.browserVerified, false);
    },
  );
}

if (process.env['RUN_BACKEND_RECOVERY_SPIKE'] === '1') {
  for (const scenario of ['slow', 'interrupted']) {
    test(
      `real backend ${scenario} recovery preserves verified playback`,
      { timeout: 600_000 },
      async () => {
        const result = await runBackendSpike({ scenario });
        assert.equal(result.byteAndDecodeMatch, true);
        assert.equal(result.completeFileBytesMatch, true);
        assert.equal(result.completedTransferRestartRestored, true);
        if (scenario === 'slow') {
          assert.equal(result.playbackWaitedForComplete, true);
          assert.equal(result.firstFrame.complete, true);
          assert(result.completionAfterMs > result.fixtureDurationSec * 1000);
          assert(
            result.measuredAverageBytesPerSec < result.fixtureBytes / result.fixtureDurationSec,
          );
          assert(result.firstFrame.afterMs >= result.completionAfterMs);
        } else {
          assert(result.interruptedRecovery.incomplete);
          assert(
            result.interruptedRecovery.restoredPrefix >= result.interruptedRecovery.beforeRestart,
          );
          assert.equal(result.firstFrame.complete, false);
        }
        console.log(JSON.stringify({ event: 'qbit.recovery_result', result }));
      },
    );
  }
}

test('resource snapshots accept actual Docker units and reject nonnumeric output', () => {
  const sample = { CPUPerc: '0.50%', MemUsage: '12.4MiB / 384MiB', PIDs: '12' };
  assert.deepEqual(parseResourceSample(sample), {
    cpuPercent: 0.5,
    memory: sample.MemUsage,
    pids: 12,
  });
  assert.equal(parseResourceSample({ ...sample, MemUsage: '12.4 MiB / 384 MiB' }).pids, 12);
  for (const field of ['CPUPerc', 'MemUsage', 'PIDs'])
    assert.throws(() => parseResourceSample({ ...sample, [field]: 'untrusted-output' }));
});

test('command budget caps commands and refuses launch at or after deadline', () => {
  assert.equal(commandBudget(500_000, 0), 120_000);
  assert.equal(commandBudget(10, 9), 1);
  for (const now of [10, 11]) assert.throws(() => commandBudget(10, now), /backend_run_deadline/);
  assert.throws(() => commandBudget(Infinity, 0));
  assert.throws(() => commandBudget(10, NaN));
});

test('scenario validation refuses unknown modes and incompatible consumers before resource creation', async () => {
  await assert.rejects(runBackendSpike({ scenario: 'unknown' }));
  await assert.rejects(runBackendSpike({ scenario: 'slow', consume: async () => ({}) }));
});

test('backend shutdown preserves failures and marks uncertain cleanup', async () => {
  let stopped = false;
  await stopBackend(async () => {
    stopped = true;
  });
  assert.equal(stopped, true);
  const primary = Object.assign(new Error('consumer failed'), { cleanupIncomplete: true });
  const shutdown = new Error('shutdown failed');
  for (const original of [undefined, primary]) {
    await assert.rejects(
      stopBackend(async () => {
        throw shutdown;
      }, original),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.equal(error.cleanupIncomplete, true);
        assert.deepEqual(error.errors, original ? [original, shutdown] : [shutdown]);
        return true;
      },
    );
  }
});

test('browser evidence rejects absent, complete, captionless or unverified callback results', () => {
  const valid = {
    firstBrowserFrame: { verifiedBytes: 10, complete: false, allReferenceBytesPresent: false },
    externalCacheReadOnly: true,
    subtitleReadyBeforeVideo: true,
    hlsSessionStarted: true,
    frenchAudioMapped: true,
    activeCueAtFirstFrame: { currentTime: 0.5, activeFrenchCue: true },
    normalPlaybackEndObserved: true,
  };
  validateBrowserEvidence(valid, 100);
  validateBrowserEvidence(
    {
      ...valid,
      normalPlaybackEndObserved: false,
      cancelledWhileIncomplete: true,
      sessionDeleteConfirmed: true,
    },
    100,
  );
  for (const value of [
    null,
    {},
    { ...valid, subtitleReadyBeforeVideo: false },
    { ...valid, firstBrowserFrame: { ...valid.firstBrowserFrame, allReferenceBytesPresent: true } },
    { ...valid, normalPlaybackEndObserved: false },
    { ...valid, activeCueAtFirstFrame: { currentTime: 4, activeFrenchCue: true } },
  ])
    assert.throws(() => validateBrowserEvidence(value, 100));
});

test('consumer cleanup failure survives an additional backend FD failure and later closes still run', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const primary = Object.assign(new Error('consumer failure'), { cleanupIncomplete: true });
  const fdFailure = new Error('FD failure');
  const closed = [];
  const combined = await closeTransfer(primary, [
    [
      'first',
      async () => {
        closed.push('first');
        throw fdFailure;
      },
    ],
    ['second', async () => closed.push('second')],
  ]);
  assert.equal(combined.cleanupIncomplete, true);
  assert.deepEqual(combined.errors, [primary, fdFailure]);
  assert.deepEqual(closed, ['first', 'second']);
  assert.equal(await closeTransfer(primary, []), primary);
  const isolated = await closeTransfer(undefined, [
    [
      'fd',
      async () => {
        throw fdFailure;
      },
    ],
  ]);
  assert.equal(isolated.cleanupIncomplete, true);
});

test('coverage advances only after independently matching every readable cache range', async () => {
  const bytes = Buffer.alloc(40_000, 17);
  const handle = {
    read: async (target, offset, length, position) => {
      target.set(bytes.subarray(position, position + length), offset);
      return { bytesRead: length };
    },
  };
  assert.equal(await verifyCachePrefix(undefined, bytes, 0, 0), 0);
  assert.equal(await verifyCachePrefix(handle, bytes, 0, bytes.length), bytes.length);
  for (const [previous, reported] of [
    [1, 0],
    [-1, 0],
    [0, bytes.length + 1],
    [0.5, 1],
  ])
    await assert.rejects(verifyCachePrefix(handle, bytes, previous, reported));
  await assert.rejects(
    verifyCachePrefix({ read: async () => ({ bytesRead: 0 }) }, bytes, 0, 1),
    /not readable/,
  );
  await assert.rejects(
    verifyCachePrefix({ read: async () => ({ bytesRead: 1 }) }, bytes, 0, 1),
    /differs from reference/,
  );
});

const composeFile = fileURLToPath(new URL('../deploy/recovery-spike/compose.yml', import.meta.url));
function topology() {
  return JSON.parse(
    execFileSync('docker', ['compose', '-f', composeFile, 'config', '--format', 'json'], {
      env: {
        ...process.env,
        SPIKE_ROOT: '/tmp/spike-validation-only',
        SPIKE_UID: '1000',
        SPIKE_GID: '1000',
      },
      encoding: 'utf8',
    }),
  );
}

test('synthetic torrent serialization preserves binary lengths and sorted dictionary keys', () => {
  assert.equal(bencode({ b: 0, a: 'é' }).toString(), 'd1:a2:é1:bi0ee');
  assert.equal(bencode(Buffer.from([0, 255])).toString('hex'), '323a00ff');
  assert.throws(() => bencode([1, 2]), TypeError);
  assert.throws(() => bencode(null), TypeError);
});

test('single-file torrent is private, trackerless and identifies changed content differently', () => {
  const first = fixtureTorrent(Buffer.from('abc'));
  assert.match(first.bytes.toString('latin1'), /7:privatei1e/);
  assert.equal(first.bytes.includes(Buffer.from('announce')), false);
  // Known SHA-1 of abc: this is torrent compatibility, never an authentication primitive.
  assert(first.bytes.includes(Buffer.from('a9993e364706816aba3e25717850c26c9cd0d89d', 'hex')));
  assert.notEqual(first.hash, fixtureTorrent(Buffer.from('abd')).hash);
});

test('rendered experiment has exactly two non-root clients and an internal-only network', () => {
  validateTopology(topology());
});

test('topology gate refuses public/host networking, root, missing pin or widened mounts', () => {
  const base = topology();
  for (const mutate of [
    (config) => {
      config.services.target.ports = [{ target: 8080, published: '8080' }];
    },
    (config) => {
      config.networks.peers.internal = false;
    },
    (config) => {
      config.services.target.network_mode = 'host';
    },
    (config) => {
      config.services.target.user = '0:0';
    },
    (config) => {
      config.services.target.image = 'lscr.io/linuxserver/qbittorrent:latest';
    },
    (config) => {
      config.services.target.volumes[0].target = '/var/run/docker.sock';
    },
    (config) => {
      config.services.target.dns = ['1.1.1.1'];
    },
    (config) => {
      config.services.target.read_only = false;
    },
  ]) {
    const changed = structuredClone(base);
    mutate(changed);
    assert.throws(() => validateTopology(changed));
  }
});

test('API confirmation accepts 200 or 204 and extracts a session without accepting auth failures', () => {
  const legacy = parseApiResponse(
    'HTTP/1.1 200 OK\r\nSet-Cookie: SID=synthetic-session; path=/\r\n\r\nOk.',
  );
  assert.equal(legacy.body, 'Ok.');
  assert.equal(legacy.sessionCookie, 'SID=synthetic-session');
  const modern = parseApiResponse(
    'HTTP/1.1 204 No Content\r\nSet-Cookie: QBT_SID_8080=synthetic-session; HttpOnly; path=/\r\n\r\n',
  );
  assert.equal(modern.sessionCookie, 'QBT_SID_8080=synthetic-session');
  assert.equal(parseApiResponse('HTTP/1.1 204 No Content\r\n\r\n').body, '');
  for (const status of [401, 403, 500])
    assert.throws(() => parseApiResponse(`HTTP/1.1 ${status} Failure\r\n\r\n`), /qbit_api_status/);
  assert.throws(() => parseApiResponse('not HTTP'), /Invalid API response/);
});
