/* global Buffer, process, structuredClone */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'node:test';
import { bencode, fixtureTorrent, validateTopology } from './qbittorrent-spike.mjs';

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
