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
      (error, stdout, stderr) => {
        if (error) {
          // No raw command, response headers, input, configuration or credential-bearing cause.
          reject(new Error(`${binary}_failed:${error.code ?? 'unknown'}:${stderr.slice(-1000)}`));
        } else resolveResult(stdout);
      },
    );
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
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

/** Real local-peer transfer only; all temporary services/configs belong to this single run. */
export async function runBackendSpike() {
  const root = await mkdtemp(join(tmpdir(), 'popcorntv-qbit-'));
  const env = {
    ...process.env,
    SPIKE_ROOT: root,
    SPIKE_UID: String(process.getuid()),
    SPIKE_GID: String(process.getgid()),
  };
  const compose = (...args) => command('docker', ['compose', '-f', COMPOSE, ...args], { env });
  let started = false;
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
    const separator = raw.indexOf('\r\n\r\n');
    assert(separator >= 0, 'Invalid API response');
    const headers = raw.slice(0, separator);
    const status = Number(/^HTTP\/\S+ (\d+)/.exec(headers)?.[1]);
    if (status !== 200) throw new Error(`qbit_api_status:${path}:${status}`);
    const sid = /set-cookie:\s*(SID=[^;\r\n]+)/i.exec(headers)?.[1];
    if (sid) cookies.set(service, sid);
    return raw.slice(separator + 4);
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
    const fixture = await createSyntheticFixture(join(root, 'seed-data'));
    const torrent = fixtureTorrent(fixture.bytes);
    for (const service of ['seed', 'target'])
      await writeFile(join(root, `${service}-config`, 'fixture.torrent'), torrent.bytes);
    const reference = await decodeSyntheticMedia({ inputPath: fixture.front });
    started = true;
    await compose('up', '-d', '--wait', '--wait-timeout', '90');
    for (const service of ['seed', 'target']) {
      assert.equal(
        (
          await api(service, 'auth/login', { username: 'spike', password: passwords.get(service) })
        ).trim(),
        'Ok.',
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
    await api('target', 'torrents/setDownloadLimit', { hashes: torrent.hash, limit: '65536' });
    await api('target', 'torrents/addPeers', { hashes: torrent.hash, peers: `${seedIp}:6881` });
    const began = performance.now();
    let prefix = 0;
    let firstFrame = null;
    let observations = 0;
    let stopped = false;
    let observationFailure = null;
    const poll = (async () => {
      try {
        while (!stopped && prefix < fixture.bytes.length) {
          if (performance.now() - began > 45_000) throw new Error('backend_transfer_timeout');
          const states = await json('target', `torrents/pieceStates?hash=${torrent.hash}`);
          prefix = verifiedPrefix({
            states,
            pieceSize: PIECE,
            fileOffset: 0,
            fileSize: fixture.bytes.length,
          });
          observations++;
          await delay(100);
        }
      } catch (error) {
        observationFailure = error;
      }
    })();
    let handle;
    try {
      while (prefix < PIECE * 4) {
        if (observationFailure) throw observationFailure;
        await delay(20);
      }
      handle = await open(join(root, 'target-data', 'front.mp4'), 'r');
      const result = await decodeSyntheticMedia({
        timeoutMs: 50_000,
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
        },
      });
      assert.equal(result.frames, reference.frames);
      assert.equal(result.subtitles, reference.subtitles);
      assert(
        firstFrame && !firstFrame.complete,
        'Transfer completed before any progressive frame was observed',
      );
    } finally {
      stopped = true;
      await poll;
      await handle?.close();
    }
    assert.deepEqual(await readFile(join(root, 'target-data', 'front.mp4')), fixture.bytes);
    await compose('restart', 'target');
    await compose('up', '-d', '--wait', '--wait-timeout', '90');
    cookies.delete('target');
    assert.equal(
      (
        await api('target', 'auth/login', { username: 'spike', password: passwords.get('target') })
      ).trim(),
      'Ok.',
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
      observations,
      firstFrame,
      byteAndDecodeMatch: true,
      completedTransferRestartRestored: true,
      internetNetworkAbsent: true,
      vpnVerified: false,
      browserVerified: false,
      hlsVerified: false,
      limits: [
        'Single-file v1 synthetic torrent only',
        'Completed-transfer restart, not mid-transfer restart',
        'No Internet, VPN, real-time player, HLS or Pi verification',
      ],
    };
  } catch (error) {
    if (started && cookies.size === 0) {
      const logs = await compose('logs', '--no-color', '--tail', '60').catch(() => '');
      const diagnostic = logs
        .split('\n')
        .filter((line) => /permission|fatal|error|s6|read-only|cannot|failed|non-root/i.test(line))
        .filter((line) => !/password|token|secret|cookie|credential/i.test(line))
        .slice(-12)
        .join('\n');
      throw new Error(`${error.message}\n${diagnostic}`);
    }
    throw error;
  } finally {
    if (started) await compose('down', '--timeout', '20');
    await rm(root, { recursive: true, force: true });
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
        console.error(error.message);
        process.exitCode = 1;
      },
    );
}
