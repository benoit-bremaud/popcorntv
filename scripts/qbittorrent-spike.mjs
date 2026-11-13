#!/usr/bin/env node
/* global Buffer, console, process */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL, URLSearchParams, URL } from 'node:url';
import {
  createSyntheticFixture,
  decodeSyntheticMedia,
  verifiedPrefix,
} from './progressive-playback-spike.mjs';

const COMPOSE = fileURLToPath(new URL('../deploy/recovery-spike/compose.yml', import.meta.url));
const PIECE = 16 * 1024;

/** Bencode the bounded synthetic v1 torrent; not a parser for untrusted torrent files. */
export function bencode(value) {
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`${value.length}:`), value]);
  if (typeof value === 'string') return bencode(Buffer.from(value));
  if (Number.isSafeInteger(value)) return Buffer.from(`i${value}e`);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Buffer.concat([
      Buffer.from('d'),
      ...Object.keys(value)
        .sort()
        .flatMap((key) => [bencode(key), bencode(value[key])]),
      Buffer.from('e'),
    ]);
  }
  throw new TypeError('Unsupported synthetic torrent value');
}

/** SHA-1 is required for v1 torrent identity/pieces, not used for authentication or password storage. */
export function fixtureTorrent(bytes) {
  const hashes = [];
  for (let offset = 0; offset < bytes.length; offset += PIECE) {
    hashes.push(
      createHash('sha1')
        .update(bytes.subarray(offset, offset + PIECE))
        .digest(),
    );
  }
  const info = {
    length: bytes.length,
    name: 'front.mp4',
    'piece length': PIECE,
    pieces: Buffer.concat(hashes),
    private: 1,
  };
  return { bytes: bencode({ info }), hash: createHash('sha1').update(bencode(info)).digest('hex') };
}

/** qBittorrent 5.3 can confirm actions with 204, while older versions use 200 with a body. */
export function parseApiResponse(raw) {
  const separator = raw.indexOf('\r\n\r\n');
  assert(separator >= 0, 'Invalid API response');
  const headers = raw.slice(0, separator);
  const status = Number(/^HTTP\/\S+ (\d+)/.exec(headers)?.[1]);
  if (![200, 204].includes(status)) throw new Error(`qbit_api_status:${status}`);
  return {
    status,
    body: raw.slice(separator + 4),
    sessionCookie: /set-cookie:\s*((?:SID|QBT_SID_\d+)=[^;\r\n]+)/i.exec(headers)?.[1],
  };
}

/** Refuse a weaker Compose topology before any container is started. */
export function validateTopology(config) {
  assert.equal(Object.keys(config.services).sort().join(','), 'seed,target');
  for (const service of Object.values(config.services)) {
    assert.match(service.image, /^lscr\.io\/linuxserver\/qbittorrent:[^@]+@sha256:[a-f0-9]{64}$/);
    assert.match(service.user, /^[1-9]\d*:[1-9]\d*$/);
    assert.equal(service.read_only, true);
    assert(service.cap_drop.includes('ALL'));
    assert(service.security_opt.includes('no-new-privileges:true'));
    assert.equal((service.ports ?? []).length, 0);
    assert.equal(service.network_mode, undefined);
    assert.equal(Object.keys(service.networks).join(','), 'peers');
    assert.deepEqual(service.dns, ['127.0.0.1']);
    assert(service.pids_limit > 0 && service.mem_limit > 0 && Number(service.cpus) > 0);
    for (const volume of service.volumes) {
      assert.equal(volume.type, 'bind');
      assert(['/config', '/data'].includes(volume.target));
      assert.equal(volume.bind.create_host_path, false);
    }
  }
  assert.equal(Object.keys(config.networks).join(','), 'peers');
  assert.equal(config.networks.peers.internal, true);
  assert.equal(config.networks.peers.enable_ipv6, false);
}

function command(binary, args, { env = process.env, input = '', timeout = 120_000 } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = execFile(
      binary,
      args,
      { env, timeout, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          // No raw command, response headers, input, configuration or credential-bearing cause.
          reject(new Error(`${binary}_failed:${error.code ?? 'unknown'}`));
        } else resolveResult(stdout);
      },
    );
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

/**
 * Advance only independently readable reference-matching coverage; regression invalidates the run.
 * The expected bytes are a known synthetic experiment oracle, not a production download guarantee.
 * Return the new prefix only after all new bytes match; reject short/corrupt/invalid ranges.
 */
export async function verifyCachePrefix(handle, bytes, previous, reported) {
  assert(Number.isSafeInteger(previous) && Number.isSafeInteger(reported));
  assert(previous >= 0 && reported >= previous && reported <= bytes.length);
  for (let start = previous; start < reported; start += PIECE) {
    const length = Math.min(PIECE, reported - start);
    const part = Buffer.alloc(length);
    const { bytesRead } = await handle.read(part, 0, length, start);
    assert.equal(bytesRead, length, 'Reported range is not readable');
    assert(
      part.equals(bytes.subarray(start, start + length)),
      'Reported range differs from reference',
    );
  }
  return reported;
}

/** Preserve the consumer failure while attempting every backend close; unsafe cleanup retains the cache. */
export async function closeTransfer(primaryFailure, resources) {
  const failures = [];
  for (const [resource, close] of resources) {
    try {
      await close();
    } catch (error) {
      failures.push(error);
      console.error(
        JSON.stringify({ event: 'qbit.cleanup_failed', resource, code: error.code ?? error.name }),
      );
    }
  }
  if (!failures.length) return primaryFailure;
  const combined = new AggregateError(
    primaryFailure ? [primaryFailure, ...failures] : failures,
    'backend_cleanup_incomplete',
  );
  combined.cleanupIncomplete = true;
  return combined;
}

/** Refuse accidental consumer success without the measured incomplete HLS/caption/read-only proof. */
export function validateBrowserEvidence(result, fileSize) {
  const frame = result?.firstBrowserFrame;
  assert(
    frame &&
      Number.isSafeInteger(frame.verifiedBytes) &&
      frame.verifiedBytes > 0 &&
      frame.verifiedBytes < fileSize,
  );
  assert.equal(frame.complete, false);
  assert.equal(frame.allReferenceBytesPresent, false);
  for (const field of [
    'externalCacheReadOnly',
    'subtitleReadyBeforeVideo',
    'hlsSessionStarted',
    'frenchAudioMapped',
  ])
    assert.equal(result[field], true);
  assert.equal(result.activeCueAtFirstFrame?.activeFrenchCue, true);
  assert(
    result.activeCueAtFirstFrame.currentTime > 0.2 && result.activeCueAtFirstFrame.currentTime < 2,
  );
  assert(
    result.normalPlaybackEndObserved === true ||
      (result.cancelledWhileIncomplete === true && result.sessionDeleteConfirmed === true),
  );
}

async function initialize(root, service) {
  const folder = join(root, `${service}-config`, 'qBittorrent');
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await mkdir(join(root, `${service}-data`), { mode: 0o700 });
  const password = randomBytes(24).toString('hex');
  const salt = randomBytes(16);
  const key = pbkdf2Sync(password, salt, 100000, 64, 'sha512');
  const hash = `${salt.toString('base64')}:${key.toString('base64')}`;
  await writeFile(
    join(folder, 'qBittorrent.conf'),
    [
      '[LegalNotice]',
      'Accepted=true',
      '[BitTorrent]',
      'Session\\DHTEnabled=false',
      'Session\\PeXEnabled=false',
      'Session\\LSDEnabled=false',
      'Session\\Port=6881',
      'Session\\DefaultSavePath=/data/',
      '[Preferences]',
      'Connection\\UPnP=false',
      'General\\CheckForUpdates=false',
      'WebUI\\Username=spike',
      `WebUI\\Password_PBKDF2="@ByteArray(${hash})"`,
      'WebUI\\LocalHostAuth=true',
      'WebUI\\CSRFProtection=true',
      'WebUI\\HostHeaderValidation=true',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  return password;
}

/** Confirm backend shutdown, preserving the primary failure and unsafe-workspace marker. */
export async function stopBackend(stop, primaryFailure) {
  try {
    await stop();
  } catch (error) {
    const failure = new AggregateError(
      primaryFailure ? [primaryFailure, error] : [error],
      'Backend shutdown unconfirmed; workspace retained',
    );
    failure.cleanupIncomplete = true;
    throw failure;
  }
}

/**
 * Real local-peer transfer only; all temporary services/configs belong to this single run.
 * Optional `consume` runs outside the poll loop with the borrowed read-only source, immutable
 * caption prefix, known control metadata/reference and bounded resume operation, never credentials.
 * It must close its readers before settling, or reject with cleanupIncomplete to retain the cache.
 * Results distinguish standalone reference decode from browser evidence (null means not compared).
 * Original and cleanup failures are preserved; no workspace is removed after unsafe consumer cleanup.
 */
export async function runBackendSpike({ consume = null } = {}) {
  assert(consume === null || typeof consume === 'function');
  const root = await mkdtemp(join(tmpdir(), 'popcorntv-qbit-'));
  const env = {
    ...process.env,
    SPIKE_ROOT: root,
    SPIKE_UID: String(process.getuid()),
    SPIKE_GID: String(process.getgid()),
    COMPOSE_PROJECT_NAME: `popcorntv-recovery-spike-${randomBytes(6).toString('hex')}`,
  };
  const compose = (...args) => command('docker', ['compose', '-f', COMPOSE, ...args], { env });
  let started = false;
  let retainWorkspace = false;
  let primaryFailure;
  const cookies = new Map();
  const passwords = new Map();
  const api = async (service, path, data, form = false) => {
    assert.match(path, /^[a-zA-Z0-9/]+(?:\?[a-zA-Z0-9=&]+)?$/);
    const lines = [
      `url = "http://127.0.0.1:8080/api/v2/${path}"`,
      'silent',
      'show-error',
      'max-time = 10',
      'dump-header = "-"',
      'header = "Referer: http://127.0.0.1:8080/"',
      'header = "Expect:"',
    ];
    if (cookies.has(service)) lines.push(`cookie = "${cookies.get(service)}"`);
    if (form) {
      lines.push(
        'form = "torrents=@/config/fixture.torrent"',
        'form = "savepath=/data"',
        'form = "sequentialDownload=true"',
        'form = "firstLastPiecePrio=true"',
      );
    } else if (data) lines.push(`data = "${new URLSearchParams(data).toString()}"`);
    const raw = await command(
      'docker',
      ['compose', '-f', COMPOSE, 'exec', '-T', service, 'curl', '--config', '-'],
      { env, input: lines.join('\n') + '\n' },
    );
    const response = parseApiResponse(raw);
    if (response.sessionCookie) cookies.set(service, response.sessionCookie);
    return response.body;
  };
  const json = async (...args) => JSON.parse(await api(...args));
  try {
    assert.equal(
      (await compose('ps', '--all', '--quiet')).trim(),
      '',
      'An existing spike project must not be overwritten',
    );
    for (const service of ['seed', 'target'])
      passwords.set(service, await initialize(root, service));
    validateTopology(JSON.parse(await compose('config', '--format', 'json')));
    const fixture = await createSyntheticFixture(join(root, 'seed-data'), 30);
    const torrent = fixtureTorrent(fixture.bytes);
    for (const service of ['seed', 'target'])
      await writeFile(join(root, `${service}-config`, 'fixture.torrent'), torrent.bytes);
    const reference = await decodeSyntheticMedia({ inputPath: fixture.front });
    started = true;
    await compose('up', '-d', '--wait', '--wait-timeout', '90');
    for (const service of ['seed', 'target']) {
      await assert.rejects(api(service, 'app/preferences'), /qbit_api_status:(401|403)/);
      const login = await api(service, 'auth/login', {
        username: 'spike',
        password: passwords.get(service),
      });
      assert(
        ['', 'Ok.'].includes(login.trim()) && cookies.has(service),
        'Login did not establish an authenticated session',
      );
      const prefs = await json(service, 'app/preferences');
      assert.equal(prefs.dht, false);
      assert.equal(prefs.pex, false);
      assert.equal(prefs.lsd, false);
      assert.equal(prefs.upnp, false);
    }
    const versions = {
      app: await api('target', 'app/version'),
      api: await api('target', 'app/webapiVersion'),
      build: await json('target', 'app/buildInfo'),
    };
    const seedId = (await compose('ps', '--quiet', 'seed')).trim();
    const targetId = (await compose('ps', '--quiet', 'target')).trim();
    for (const id of [seedId, targetId]) {
      const [info] = JSON.parse(await command('docker', ['inspect', id]));
      assert.notEqual(info.Config.User.split(':')[0], '0');
      assert.equal(info.HostConfig.ReadonlyRootfs, true);
      assert(info.HostConfig.CapDrop.includes('ALL'));
      const networks = Object.values(info.NetworkSettings.Networks);
      assert.equal(networks.length, 1);
      const [network] = JSON.parse(
        await command('docker', ['network', 'inspect', networks[0].NetworkID]),
      );
      assert.equal(network.Internal, true);
    }
    const [seedInspect] = JSON.parse(await command('docker', ['inspect', seedId]));
    const seedIp = Object.values(seedInspect.NetworkSettings.Networks)[0].IPAddress;
    assert.match(seedIp, /^\d+\.\d+\.\d+\.\d+$/);
    await api('seed', 'torrents/add', null, true);
    await api('target', 'torrents/add', null, true);
    await api('target', 'torrents/setDownloadLimit', { hashes: torrent.hash, limit: '131072' });
    await api('target', 'torrents/addPeers', { hashes: torrent.hash, peers: `${seedIp}:6881` });
    const began = performance.now();
    let prefix = 0;
    let firstFrame = null;
    let firstFrameCacheEvidence;
    let observations = 0;
    let stopped = false;
    let observationFailure = null;
    let cacheHandle;
    let browserResult = null;
    const targetPath = join(root, 'target-data', 'front.mp4');
    const poll = (async () => {
      try {
        while (!stopped && prefix < fixture.bytes.length) {
          if (performance.now() - began > 90_000) throw new Error('backend_transfer_timeout');
          const states = await json('target', `torrents/pieceStates?hash=${torrent.hash}`);
          const reported = verifiedPrefix({
            states,
            pieceSize: PIECE,
            fileOffset: 0,
            fileSize: fixture.bytes.length,
          });
          if (reported > 0) cacheHandle ??= await open(targetPath, 'r');
          prefix = await verifyCachePrefix(cacheHandle, fixture.bytes, prefix, reported);
          observations++;
          await delay(100);
        }
      } catch (error) {
        observationFailure = error;
        console.error(
          JSON.stringify({
            event: 'qbit.coverage_failed',
            code: error.code ?? error.name,
            verifiedBytes: prefix,
          }),
        );
      }
    })();
    let handle;
    let transferFailure;
    try {
      while (prefix < PIECE * (consume ? 24 : 4)) {
        if (observationFailure) throw observationFailure;
        await delay(20);
      }
      if (consume) {
        await api('target', 'torrents/stop', { hashes: torrent.hash });
        const deadline = performance.now() + 10_000;
        while (true) {
          if (observationFailure) throw observationFailure;
          const [info] = await json('target', `torrents/info?hashes=${torrent.hash}`);
          if (['stoppedDL', 'stoppedUP'].includes(info?.state)) break;
          assert(performance.now() < deadline, 'Client stop did not settle');
          await delay(100);
        }
        const snapshot = Buffer.alloc(PIECE * 4);
        const { bytesRead } = await cacheHandle.read(snapshot, 0, snapshot.length, 0);
        assert.equal(bytesRead, snapshot.length);
        assert(snapshot.equals(fixture.bytes.subarray(0, snapshot.length)));
        assert(prefix < fixture.bytes.length, 'Preparation already completed the movie');
        console.error(
          JSON.stringify({
            event: 'qbit.subtitle_snapshot_ready',
            snapshotBytes: snapshot.length,
            verifiedBytes: prefix,
          }),
        );
        // The consumer runs outside the poll loop and never receives API credentials/environment.
        browserResult = await consume({
          fixture,
          path: targetPath,
          subtitleSnapshot: snapshot,
          subtitleReference: reference.subtitles,
          prefix: () => {
            if (observationFailure) throw observationFailure;
            return prefix;
          },
          resume: async () => {
            await api('target', 'torrents/start', { hashes: torrent.hash });
            await api('target', 'torrents/addPeers', {
              hashes: torrent.hash,
              peers: `${seedIp}:6881`,
            });
            console.error(JSON.stringify({ event: 'qbit.resumed' }));
          },
        });
        validateBrowserEvidence(browserResult, fixture.bytes.length);
        firstFrame = browserResult.firstBrowserFrame;
        while (prefix < fixture.bytes.length) {
          if (observationFailure) throw observationFailure;
          await delay(20);
        }
      } else {
        handle = await open(targetPath, 'r');
        const result = await decodeSyntheticMedia({
          timeoutMs: 90_000,
          feed: async (stdin, signal) => {
            for (let offset = 0; offset < fixture.bytes.length; offset += PIECE) {
              const end = Math.min(fixture.bytes.length, offset + PIECE);
              while (prefix < end) {
                signal.throwIfAborted();
                if (observationFailure) throw observationFailure;
                await delay(20, undefined, { signal });
              }
              const bytes = Buffer.alloc(end - offset);
              const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
              assert.equal(bytesRead, bytes.length, 'Reported pieces are not readable');
              assert.deepEqual(
                bytes,
                fixture.bytes.subarray(offset, end),
                'Reported piece bytes differ from reference',
              );
              if (!stdin.write(bytes)) await once(stdin, 'drain', { signal });
            }
          },
          onVideoFrame: () => {
            firstFrame = {
              afterMs: Math.round(performance.now() - began),
              verifiedBytes: prefix,
              complete: prefix === fixture.bytes.length,
            };
            // Independent byte evidence: a stale API observation alone cannot prove incompleteness.
            firstFrameCacheEvidence = readFile(join(root, 'target-data', 'front.mp4')).then(
              (bytes) => ({
                allReferenceBytesPresent: bytes.equals(fixture.bytes),
                observedAfterMs: Math.round(performance.now() - began),
              }),
            );
            // Observe errors immediately, even while FFmpeg continues decoding.
            firstFrameCacheEvidence.catch(() => undefined);
          },
        });
        assert.equal(result.frames, reference.frames);
        assert.equal(result.subtitles, reference.subtitles);
        assert(
          firstFrame && !firstFrame.complete,
          'Transfer completed before any progressive frame was observed',
        );
        const cacheEvidence = await firstFrameCacheEvidence;
        assert.equal(
          cacheEvidence.allReferenceBytesPresent,
          false,
          'Stale API state cannot prove progressive decode',
        );
        firstFrame.cacheEvidence = cacheEvidence;
      }
    } catch (error) {
      transferFailure = error;
    } finally {
      stopped = true;
      transferFailure = await closeTransfer(transferFailure, [
        ['poll', () => poll],
        ['decoder-file', () => handle?.close()],
        ['verified-cache', () => cacheHandle?.close()],
      ]);
    }
    if (transferFailure) throw transferFailure;
    assert.deepEqual(await readFile(join(root, 'target-data', 'front.mp4')), fixture.bytes);
    await compose('restart', 'target');
    await compose('up', '-d', '--wait', '--wait-timeout', '90');
    cookies.delete('target');
    const login = await api('target', 'auth/login', {
      username: 'spike',
      password: passwords.get('target'),
    });
    assert(
      ['', 'Ok.'].includes(login.trim()) && cookies.has('target'),
      'Restart login did not establish a session',
    );
    const restored = await json('target', `torrents/pieceStates?hash=${torrent.hash}`);
    assert.equal(
      verifiedPrefix({
        states: restored,
        pieceSize: PIECE,
        fileOffset: 0,
        fileSize: fixture.bytes.length,
      }),
      fixture.bytes.length,
    );
    return {
      verdict: 'PARTIAL',
      stage: 'real isolated qBittorrent transfer',
      versions,
      fixtureBytes: fixture.bytes.length,
      fixtureDurationSec: fixture.durationSec,
      observations,
      firstFrame,
      byteAndDecodeMatch: consume === null ? true : null,
      firstFrameTimingOrigin: consume ? 'player_resume' : 'backend_transfer_start',
      completeFileBytesMatch: true,
      browserResult,
      completedTransferRestartRestored: true,
      internetNetworkAbsent: true,
      vpnVerified: false,
      browserVerified: browserResult !== null,
      hlsVerified: browserResult !== null,
      limits: [
        'Single-file v1 synthetic torrent only',
        'Completed-transfer restart, not mid-transfer restart',
        consume
          ? 'Private peer experiment; VPN tested separately; no Pi verification'
          : 'No Internet, VPN, real-time player, HLS or Pi verification',
      ],
    };
  } catch (error) {
    primaryFailure = error;
    retainWorkspace = error.cleanupIncomplete === true;
    if (started && cookies.size === 0) {
      const logs = await compose('logs', '--no-color', '--tail', '60').catch(() => '');
      console.error(
        JSON.stringify({
          event: 'qbit.bootstrap_failed',
          permission: /permission/i.test(logs),
          readOnly: /read-only/i.test(logs),
          init: /s6/i.test(logs),
        }),
      );
    }
    throw error;
  } finally {
    if (started) await stopBackend(() => compose('down', '--timeout', '20'), primaryFailure);
    if (!retainWorkspace) await rm(root, { recursive: true, force: true });
    else
      console.error(
        JSON.stringify({ event: 'qbit.workspace_retained', reason: 'consumer_cleanup_incomplete' }),
      );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3 || process.argv[2] !== '--run') {
    console.error('Usage: node scripts/qbittorrent-spike.mjs --run');
    process.exitCode = 2;
  } else
    runBackendSpike().then(
      (result) => console.log(JSON.stringify(result, null, 2)),
      (error) => {
        console.error(
          JSON.stringify({ event: 'qbit.experiment_failed', code: error.code ?? error.name }),
        );
        process.exitCode = 1;
      },
    );
}
