#!/usr/bin/env node
/* global Buffer, console, process, AbortController, performance, document, setTimeout, clearTimeout */
/** Opt-in real-player experiment; no progressive input capability is installed into production. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { buildApp } from '../apps/server/dist/app.js';
import { openDatabase } from '../apps/server/dist/db/index.js';
import { createFfprobe } from '../apps/server/dist/library/ffprobe.js';
import { UserRepository } from '../apps/server/dist/auth/user-repository.js';
import { SessionRepository } from '../apps/server/dist/auth/session-repository.js';
import { ProfileRepository } from '../apps/server/dist/profiles/repository.js';
import { Argon2Hasher } from '../apps/server/dist/auth/hasher.js';
import { loggerOptions } from '../apps/server/dist/logging.js';
import { createSyntheticFixture, readVerifiedRange } from './progressive-playback-spike.mjs';

const WEB = resolve(fileURLToPath(new URL('../apps/web/dist/', import.meta.url)));
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const CHUNK = 16 * 1024;

function log(event, fields = {}) {
  console.error(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}

/** Browser predicate: require advancing media time and a decoded frame, not just a loaded URL. */
export function hasDecodedFrame(video = document.querySelector('video')) {
  return (
    video !== null &&
    video.currentTime > 0.2 &&
    video.getVideoPlaybackQuality().totalVideoFrames > 0
  );
}

/** Enable the actual text track and require the expected synthetic cue, not merely its tag. */
export function hasFrenchCue(video = document.querySelector('video')) {
  if (video === null || video.textTracks.length !== 1) return false;
  video.textTracks[0].mode = 'showing';
  return [...(video.textTracks[0].cues ?? [])].some((cue) =>
    cue.text.includes('Sous-titre synthetique'),
  );
}

/** Require the 30-second fixture's normal end; a truncated early EOF must not count as complete. */
export function hasEnded(video = document.querySelector('video')) {
  return video !== null && video.ended === true && video.error === null && video.currentTime >= 29;
}

/** Observe a decoded early frame with the expected cue currently active, not merely loaded. */
export function activeFrenchFrame(video = document.querySelector('video')) {
  if (
    !video ||
    video.currentTime <= 0.2 ||
    video.currentTime >= 2 ||
    video.getVideoPlaybackQuality().totalVideoFrames < 1
  )
    return false;
  const cues = video.textTracks[0]?.activeCues ?? [];
  if (![...cues].some((cue) => cue.text.includes('Sous-titre synthetique'))) return false;
  return { currentTime: video.currentTime, activeFrenchCue: true };
}

/** Hold experimental segment delivery until caption readiness; timeout/abort never opens the gate. */
export function readinessGate(timeoutMs = 15_000) {
  let state = 'pending';
  let release, reject;
  const ready = new Promise((resolve, fail) => {
    release = resolve;
    reject = fail;
  });
  void ready.catch(() => undefined);
  return {
    release: () => {
      assert.equal(state, 'pending');
      state = 'released';
      release();
    },
    abort: () => {
      if (state === 'pending') {
        state = 'aborted';
        reject(new Error('readiness_cancelled'));
      }
    },
    wait: async () => {
      if (state === 'released') return;
      const timer = new AbortController();
      try {
        await Promise.race([
          ready,
          delay(timeoutMs, undefined, { signal: timer.signal }).then(() => {
            const error = new Error('readiness_timeout');
            if (state === 'pending') {
              state = 'aborted';
              reject(error);
            }
            throw error;
          }),
        ]);
      } finally {
        timer.abort();
      }
    },
  };
}

/** Attempt all independent cleanup steps and return failures without echoing exception payloads. */
export async function cleanupAll(steps) {
  const failures = [];
  for (const [resource, close] of steps) {
    try {
      await close();
    } catch (error) {
      failures.push(error);
      log('player.cleanup_failed', { resource, code: error.code ?? error.name });
    }
  }
  return failures;
}

/**
 * Experiment-only adaptation of one synthetic local input to verified stdin. Preserve output,
 * audio and container restrictions; reject resumes/other paths rather than relaxing production
 * file confinement. This is not an input mode enabled in the application.
 */
export function verifiedPipeArgs(args, expectedPath) {
  assert.equal(args.filter((value) => value === '-i').length, 1);
  assert(!args.includes('-ss'), 'Experimental pipe input cannot resume');
  const input = args.indexOf('-i');
  const protocol = args.indexOf('-protocol_whitelist');
  assert(input > 0 && protocol >= 0);
  assert.equal(args[input + 1], expectedPath);
  assert.equal(args[protocol + 1], 'file');
  const adapted = [...args];
  adapted[input + 1] = 'pipe:0';
  adapted[protocol + 1] = 'pipe';
  return adapted;
}

/**
 * Run real FFmpeg at the application's existing injected process boundary. Feed only bounded
 * ranges whose disk bytes independently match the fixture; kill/abort/await all child work on
 * close. The adapter intentionally has no direct-file or resume fallback.
 * Optional `subtitleSource` is an immutable verified prefix with its own read-only handle/reference;
 * its extraction shares the same tracked child lifecycle and never borrows the complete control.
 */
export function verifiedTranscoder({
  path,
  handle,
  bytes,
  prefix,
  spawnProcess = spawn,
  readTimeoutMs = 10_000,
  lifetimeMs = 45_000,
  subtitleSource = null,
}) {
  const pending = new Set();
  const controllers = new Set();
  const selected = [];
  const run = (args, onExit) => {
    const input =
      subtitleSource && args.includes('webvtt') ? subtitleSource : { handle, bytes, prefix };
    const adapted = verifiedPipeArgs(args, path);
    const initialPrefix = input.prefix();
    const controller = new AbortController();
    const child = spawnProcess('ffmpeg', adapted, { stdio: ['pipe', 'ignore', 'pipe'] });
    selected.push([...args]);
    controllers.add(controller);
    let stderr = '';
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      onExit(code, stderr);
    };
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-2048);
    });
    child.stdin.on('error', (error) => {
      if (!controller.signal.aborted)
        log('player.input_pipe_failed', { code: error.code ?? error.name });
      controller.abort();
    });
    child.on('error', () => {
      controller.abort();
      finish(null);
    });
    child.on('exit', (code) => {
      controller.abort();
      finish(code);
    });
    const abort = () => child.kill('SIGKILL');
    controller.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('player_spike_timeout')), lifetimeMs);
    const closed = once(child, 'close');
    const feeding = (async () => {
      for (let start = 0; start < input.bytes.length; start += CHUNK) {
        const length = Math.min(CHUNK, input.bytes.length - start);
        const part = await readVerifiedRange(input.handle, {
          start,
          length,
          size: input.bytes.length,
          prefix: input.prefix,
          signal: controller.signal,
          timeoutMs: readTimeoutMs,
        });
        assert(
          part.equals(input.bytes.subarray(start, start + length)),
          'Cache reference mismatch',
        );
        if (!child.stdin.write(part))
          await once(child.stdin, 'drain', { signal: controller.signal });
      }
      child.stdin.end();
    })();
    const work = Promise.allSettled([closed, feeding]).then(() => {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', abort);
      controllers.delete(controller);
      pending.delete(work);
      log('player.ffmpeg_closed');
    });
    // Observe a failed feeder immediately, rather than waiting for a child blocked on stdin.
    void feeding.catch((error) => {
      if (!controller.signal.aborted) log('player.input_failed', { code: error.name });
      controller.abort();
    });
    pending.add(work);
    log('player.ffmpeg_started', {
      subtitle: args.includes('webvtt'),
      verifiedBytes: initialPrefix,
    });
    return { kill: () => controller.abort() };
  };
  return {
    run,
    selected,
    close: async () => {
      for (const controller of controllers) controller.abort();
      await Promise.all(pending);
      assert.equal(pending.size, 0);
    },
  };
}

/**
 * Opt-in browser experiment against the production bundle and real application routes/database.
 * Only the recovery writer and FFmpeg source boundary are experimental. Return measured,
 * synthetic-only observations; remove the private workspace and all owned processes in finally.
 * `cancelAfterFirstFrame` exercises actual session cancellation while recovery is incomplete;
 * otherwise watch the full synthetic clip, then check subtitles and close normally.
 * Optional `source` borrows the backend's existing cache without writing/truncation. Known control
 * metadata is explicit, while caption bytes come only from the verified target snapshot. Resume
 * and real caption readiness must succeed before segment release. All cleanup steps are attempted;
 * an AggregateError marked cleanupIncomplete tells the owner not to delete the borrowed workspace.
 */
export async function runPlayerSpike({ cancelAfterFirstFrame = false, source = null } = {}) {
  const base = await mkdtemp(join(tmpdir(), 'popcorntv-player-spike-'));
  let app, browser, cache, adapter, db, server, captionHandle;
  let producer;
  let outcome, primaryError;
  let failures = [];
  const producerAbort = new AbortController();
  const gate = source ? readinessGate() : null;
  let prefix = 0;
  const coverage = source ? source.prefix : () => prefix;
  let appFailure = null;
  let hlsSessionStarted = false;
  const began = performance.now();
  const cpuStart = process.cpuUsage();
  try {
    let fixture, mediaRoot, root, path, pausedIdentity;
    if (source) {
      fixture = source.fixture;
      path = source.path;
      root = dirname(path);
      mediaRoot = root;
      pausedIdentity = await stat(path);
      assert(source.subtitleSnapshot.length > 0 && source.subtitleSnapshot.length <= coverage());
      assert(
        source.subtitleSnapshot.equals(fixture.bytes.subarray(0, source.subtitleSnapshot.length)),
      );
      const snapshotPath = join(base, 'verified-caption-prefix.mp4');
      await writeFile(snapshotPath, source.subtitleSnapshot, { mode: 0o600, flag: 'wx' });
      captionHandle = await open(snapshotPath, 'r');
    } else {
      await mkdir(join(base, 'source'));
      fixture = await createSyntheticFixture(join(base, 'source'), 30);
      mediaRoot = join(base, 'media');
      root = join(mediaRoot, 'films');
      await mkdir(root, { recursive: true });
      path = join(root, 'Progressive Spike (2026).mp4');
      await copyFile(fixture.front, path);
    }
    db = openDatabase(':memory:');
    const now = new Date();
    const user = new UserRepository(db).create(
      'spike',
      await new Argon2Hasher().hash(randomBytes(32).toString('hex')),
      'owner',
      now,
    );
    const profiles = new ProfileRepository(db);
    profiles.adoptOrphans(user.id);
    profiles.createFirst(user.id, 'spike', now);
    const profile = profiles.list(user.id)[0];
    const session = new SessionRepository(db).create(user.id, 'progressive-player-experiment', now);
    const headers = { cookie: `pctv_session=${session.token}` };
    // A loopback-only transport serves the built files and forwards /api to real app.inject.
    // No API response is mocked; sessions, HLS files, authentication and progress use real code.
    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname.startsWith('/api/')) {
          if (gate && /\/segment-\d{5}\.ts$/.test(url.pathname)) await gate.wait();
          const chunks = [];
          let length = 0;
          for await (const part of request) {
            length += part.length;
            assert(length <= 16 * 1024);
            chunks.push(part);
          }
          const answer = await app.inject({
            method: request.method,
            url: request.url.slice(4),
            headers: request.headers,
            ...(length ? { payload: Buffer.concat(chunks) } : {}),
          });
          if (
            request.method === 'POST' &&
            url.pathname === '/api/playback/sessions' &&
            answer.statusCode === 201
          )
            hlsSessionStarted = answer.json().mode === 'hls';
          response.writeHead(answer.statusCode, answer.headers);
          response.end(answer.rawPayload);
          return;
        }
        const file = resolve(
          WEB,
          `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`,
        );
        assert(file.startsWith(WEB + sep));
        const types = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2',
        };
        const content = await readFile(file);
        response.writeHead(200, {
          'content-type': types[extname(file)] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        response.end(content);
      } catch (error) {
        appFailure = error;
        log('player.transport_failed', { code: error.code ?? error.name });
        response.writeHead(500);
        response.end();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const origin = `http://127.0.0.1:${server.address().port}`;
    adapter = verifiedTranscoder({
      path,
      handle: { read: (...args) => cache.read(...args) },
      bytes: fixture.bytes,
      prefix: coverage,
      subtitleSource: source
        ? {
            handle: captionHandle,
            bytes: Buffer.from(source.subtitleSnapshot),
            prefix: () => source.subtitleSnapshot.length,
          }
        : null,
    });
    app = await buildApp({
      version: 'issue-308-player-spike',
      db,
      // External mode uses explicitly known control metadata, never writes/probes missing cache bytes.
      probe: source
        ? async (candidate) => {
            assert.equal(candidate, path);
            return createFfprobe('ffprobe')(fixture.front);
          }
        : createFfprobe('ffprobe'),
      mediaRoot,
      tmdb: null,
      artworkDir: join(base, 'artwork'),
      transcoder: adapter.run,
      transcodeDir: join(base, 'transcodes'),
      publicUrl: origin,
      logger: loggerOptions('debug', { write: (line) => process.stderr.write(line) }),
    });
    const library = await app.inject({
      method: 'POST',
      url: '/libraries',
      headers: { ...headers, origin },
      payload: { name: 'Synthetic', rootPath: root, kind: 'films' },
    });
    assert.equal(library.statusCode, 201);
    const scan = await app.inject({
      method: 'POST',
      url: `/libraries/${library.json().id}/scan`,
      headers: { ...headers, origin },
    });
    assert.equal(scan.statusCode, 200);
    const list = (
      await app.inject({ method: 'GET', url: `/libraries/${library.json().id}/media`, headers })
    ).json();
    assert.equal(list.length, 1);
    // Probe/metadata came from the complete control; actual playback reads only this new cache.
    if (source) {
      const unchanged = await stat(path);
      assert.equal(unchanged.ino, pausedIdentity.ino);
      assert.equal(unchanged.size, pausedIdentity.size);
      assert.equal(unchanged.mtimeMs, pausedIdentity.mtimeMs);
      cache = await open(path, 'r');
      log('player.external_cache_opened_readonly', { verifiedBytes: coverage() });
    } else {
      cache = await open(path, 'w+');
      await cache.truncate(fixture.bytes.length);
      log('player.cache_preallocated', { bytes: fixture.bytes.length });
    }
    const { chromium } = webRequire('@playwright/test');
    browser = await chromium.launch({
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required'],
    });
    const context = await browser.newContext();
    await context.addCookies([
      { name: 'pctv_session', value: session.token, url: origin, httpOnly: true, sameSite: 'Lax' },
    ]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.name));
    await page.goto(origin);
    await page.getByRole('button', { name: profile.name, exact: true }).click();
    if (source) {
      const prepared = await page.request.get(`${origin}/api/media/${list[0].id}/subtitles/0`);
      assert.equal(prepared.status(), 200);
      assert.equal(
        (await prepared.text()).trim(),
        source.subtitleReference.trim(),
        'Prefix does not contain the complete required subtitle',
      );
      // Subsequent track loading must succeed even after qBit invalidates the movie mtime.
      await rm(join(base, 'transcodes', 'subtitles'), { recursive: true, force: true });
      log('player.subtitle_prepared_before_play', {
        snapshotBytes: source.subtitleSnapshot.length,
      });
    }
    await page
      .getByRole('button', {
        name: source ? list[0].title : 'Progressive Spike (2026)',
        exact: !source,
      })
      .first()
      .click();
    const detail = page.getByRole('dialog', {
      name: source ? list[0].title : 'Progressive Spike',
      exact: true,
    });
    await detail.getByLabel('Audio').selectOption('1');
    await detail.getByRole('button', { name: '▶ Play', exact: true }).click();
    const deliveryBegan = performance.now();
    // Known reference writer, approximately 2.5 times the fixture's average consumption.
    producer = source
      ? source.resume()
      : (async () => {
          for (let start = 0; start < fixture.bytes.length; start += CHUNK) {
            await delay(125, undefined, { signal: producerAbort.signal });
            const part = fixture.bytes.subarray(start, start + CHUNK);
            const { bytesWritten } = await cache.write(part, 0, part.length, start);
            assert.equal(bytesWritten, part.length);
            const check = Buffer.alloc(part.length);
            const { bytesRead } = await cache.read(check, 0, check.length, start);
            assert.equal(bytesRead, part.length);
            assert(check.equals(part));
            prefix = start + part.length;
          }
          log('player.delivery_completed', {
            afterMs: Math.round(performance.now() - deliveryBegan),
          });
        })();
    // Attach the rejection handler immediately; cleanup will still await the original promise.
    void producer.catch(() => undefined);
    let activeCue = null;
    if (source) {
      await producer;
      await page.waitForFunction(hasFrenchCue, undefined, { timeout: 20_000 });
      const noFrames = await page
        .locator('video')
        .evaluate((video) => video.getVideoPlaybackQuality().totalVideoFrames === 0);
      assert(noFrames, 'Video decoded before subtitle readiness');
      const firstWithCue = page.waitForFunction(activeFrenchFrame, undefined, { timeout: 25_000 });
      gate.release();
      log('player.caption_gate_released');
      activeCue = await (await firstWithCue).jsonValue();
    } else await page.waitForFunction(hasDecodedFrame, undefined, { timeout: 25_000 });
    const first = {
      afterMs: Math.round(performance.now() - deliveryBegan),
      verifiedBytes: coverage(),
      complete: coverage() === fixture.bytes.length,
    };
    first.allReferenceBytesPresent = (await readFile(path)).equals(fixture.bytes);
    log('player.first_browser_frame', first);
    assert.equal(first.complete, false, 'Browser started only after delivery completion');
    assert.equal(
      first.allReferenceBytesPresent,
      false,
      'Stale prefix hid an already complete cache',
    );
    assert(hlsSessionStarted, 'No actual HLS session was observed');
    assert(
      adapter.selected.some((args) => args.includes('0:a:1')),
      'French audio not mapped',
    );
    if (cancelAfterFirstFrame) {
      const stopped = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          response.url().includes('/playback/sessions/'),
      );
      await page.getByRole('button', { name: 'Close player' }).click();
      assert.equal((await stopped).status(), 204);
      await page.locator('video').waitFor({ state: 'detached' });
      log('player.cancelled_while_incomplete', { verifiedBytes: coverage() });
      assert.equal(errors.length, 0, 'Browser page errors before cancellation');
      assert.equal(appFailure, null);
      outcome = {
        verdict: 'PARTIAL',
        stage: 'incomplete player cancellation',
        firstBrowserFrame: first,
        cancelledWhileIncomplete: coverage() < fixture.bytes.length,
        sessionDeleteConfirmed: true,
        externalCacheReadOnly: source !== null,
        subtitleReadyBeforeVideo: source !== null,
        activeCueAtFirstFrame: activeCue,
        hlsSessionStarted,
        frenchAudioMapped: true,
      };
    } else {
      await producer;
      if (source) {
        const deadline = performance.now() + 20_000;
        while (coverage() <= first.verifiedBytes) {
          assert(performance.now() < deadline, 'Backend did not advance during playback');
          await delay(100);
        }
        assert(coverage() < fixture.bytes.length, 'No incomplete concurrent recovery observed');
        await page.waitForFunction(
          () => document.querySelector('video').currentTime > 1,
          undefined,
          {
            timeout: 10_000,
          },
        );
        log('player.concurrent_recovery_observed', { verifiedBytes: coverage() });
      }
      await page.waitForFunction(hasFrenchCue, undefined, { timeout: 10_000 });
      await page.waitForFunction(hasEnded, undefined, { timeout: 40_000 });
      log('player.normal_end_observed');
      const stopped = page.waitForResponse(
        (response) =>
          response.request().method() === 'DELETE' &&
          response.url().includes('/playback/sessions/'),
      );
      await page.getByRole('button', { name: 'Close player' }).click();
      assert.equal((await stopped).status(), 204);
      await page.locator('video').waitFor({ state: 'detached' });
      assert.equal(errors.length, 0, 'Browser page errors');
      assert.equal(appFailure, null);
      // Probe this experiment's own transport boundary after the nominal user journey.
      // Encoded separators must never expose a file outside the trusted build directory.
      const denied = await page.request.get(`${origin}/..%2f..%2fpopcorntv-spike-forbidden`);
      assert.equal(denied.status(), 500);
      assert.equal(await denied.text(), '');
      assert.equal(appFailure?.code, 'ERR_ASSERTION');
      outcome = {
        verdict: 'PARTIAL',
        stage: source
          ? 'real qBittorrent and built PopcornTV player'
          : 'built PopcornTV player with verified pipe adapter',
        firstBrowserFrame: first,
        fixtureBytes: fixture.bytes.length,
        frenchAudioMapped: true,
        frenchSubtitleCueLoaded: true,
        subtitleCheckedAfterCompletion: source === null,
        subtitleReadyBeforeVideo: source !== null,
        activeCueAtFirstFrame: activeCue,
        externalCacheReadOnly: source !== null,
        hlsSessionStarted,
        normalPlaybackEndObserved: true,
        transportEscapeDenied: true,
        resourceObservation: {
          cacheBytes: fixture.bytes.length,
          parentMaxRssKiB: process.resourceUsage().maxRSS,
          parentCpuMicroseconds: process.cpuUsage(cpuStart),
          includesBrowserAndFfmpeg: false,
        },
        pageErrors: errors,
        limits: [
          source
            ? 'Single-file synthetic torrent with one early caption; not arbitrary subtitle readiness'
            : 'Controlled writer, not a combined qBittorrent/browser run',
          'Experiment-only pipe adapter; production still accepts complete local files',
          'No progressive direct play, resume, stalled seek, import/rename, Pi or unexpected VPN-failure validation',
        ],
      };
      log('player.experiment_completed', { elapsedMs: Math.round(performance.now() - began) });
    }
  } catch (error) {
    primaryError = error;
  } finally {
    gate?.abort();
    producerAbort.abort();
    if (producer) await producer.catch(() => undefined);
    failures = await cleanupAll([
      ['browser', () => browser?.close()],
      ['application', () => app?.close()],
      ['adapter', () => adapter?.close()],
      [
        'server',
        () =>
          server
            ? new Promise((done, reject) =>
                server.close((error) => (error ? reject(error) : done())),
              )
            : undefined,
      ],
      ['cache', () => cache?.close()],
      ['caption-snapshot', () => captionHandle?.close()],
      ['database', () => db?.$client.close()],
    ]);
    if (!failures.length) {
      failures = await cleanupAll([
        ['workspace', () => rm(base, { recursive: true, force: true })],
      ]);
      if (!failures.length) log('player.cleanup_completed');
    }
  }
  if (failures.length) {
    const error = new AggregateError(
      primaryError ? [primaryError, ...failures] : failures,
      'player_cleanup_incomplete',
    );
    error.cleanupIncomplete = true;
    throw error;
  }
  if (primaryError) throw primaryError;
  return outcome;
}

/** CLI boundary: validate opt-in and serialize a result or safe failure code; never echo raw errors. */
export async function runPlayerCli(argv, execute = runPlayerSpike) {
  if (argv.length !== 1 || argv[0] !== '--run') {
    console.error('Usage: node scripts/player-spike.mjs --run');
    return 2;
  }
  try {
    console.log(JSON.stringify(await execute(), null, 2));
    return 0;
  } catch (error) {
    log('player.experiment_failed', { code: error.code ?? error.name });
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runPlayerCli(process.argv.slice(2));
}
