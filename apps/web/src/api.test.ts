import { describe, expect, it, vi } from 'vitest';
import {
  createProfile,
  deleteProfile,
  loadProfiles,
  updateProfile,
  ApiRequestError,
  artworkUrl,
  loadDiscover,
  loadDiscoverDetails,
  loadWishlist,
  posterUrl,
  searchDiscover,
  setWishlisted,
  subtitleUrl,
  loadCatalog,
  loadProgress,
  saveProgress,
  setWatched,
  onUnauthenticated,
  sendHeartbeat,
  startPlayback,
  stopPlayback,
} from './api.js';
import { media } from './test-fixtures.js';

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('loadCatalog', () => {
  it('merges the media of every library', async () => {
    const a = media({ id: 'a', title: 'A' });
    const b = media({ id: 'b', title: 'B', libraryId: 'lib 2' });
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      if (url === '/api/libraries') return respond([{ id: 'lib-1' }, { id: 'lib 2' }]);
      if (url === '/api/libraries/lib-1/media') return respond([a]);
      if (url === '/api/libraries/lib%202/media') return respond([b]);
      return respond({ error: 'library_not_found' }, 404);
    });
    await expect(loadCatalog(fetchFn)).resolves.toEqual({
      libraries: [{ id: 'lib-1' }, { id: 'lib 2' }],
      media: [a, b],
    });
  });

  it('throws an ApiRequestError on a non-2xx answer', async () => {
    const fetchFn = vi.fn(async () => respond({ error: 'internal' }, 500));
    await expect(loadCatalog(fetchFn)).rejects.toMatchObject({
      name: 'ApiRequestError',
      path: '/libraries',
      status: 500,
    });
  });

  it('throws an ApiRequestError without status on a network failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const error = await loadCatalog(fetchFn).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: null, message: 'Request to /libraries failed' });
  });
});

it('loadCatalog rejects a body that is not a list', async () => {
  const fetchFn = vi.fn(async () => respond({ unexpected: true }));
  await expect(loadCatalog(fetchFn)).rejects.toBeInstanceOf(ApiRequestError);
});

describe('artworkUrl', () => {
  it('encodes the file name under the API prefix', () => {
    expect(artworkUrl('ab cd.jpg')).toBe('/api/artwork/ab%20cd.jpg');
  });
});

describe('startPlayback', () => {
  it('posts the decision and prefixes the returned URL with the API path', async () => {
    const fetchFn = vi.fn(async () =>
      respond(
        { mode: 'hls', sessionId: 's', url: '/playback/sessions/s/index.m3u8', offsetSec: 30 },
        201,
      ),
    );

    const start = await startPlayback({ mediaId: 'm1', directPlay: false, startSec: 30 }, fetchFn);

    expect(start).toEqual({
      mode: 'hls',
      sessionId: 's',
      url: '/api/playback/sessions/s/index.m3u8',
      offsetSec: 30,
    });
    expect(fetchFn).toHaveBeenCalledWith('/api/playback/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId: 'm1', directPlay: false, startSec: 30 }),
    });
  });

  it.each([
    [503, 'busy'],
    [502, 'failed'],
    [404, 'failed'],
  ])('maps %i to %s', async (status, expected) => {
    await expect(
      startPlayback({ mediaId: 'm1', directPlay: true }, async () => respond({}, status)),
    ).resolves.toBe(expected);
  });

  it('maps a 2xx body that is not JSON to failed', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 200 }));
    await expect(startPlayback({ mediaId: 'm1', directPlay: true }, fetchFn)).resolves.toBe(
      'failed',
    );
  });

  it('maps a network failure to failed', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => {
      throw new TypeError('offline');
    });
    await expect(startPlayback({ mediaId: 'm1', directPlay: true }, fetchFn)).resolves.toBe(
      'failed',
    );
  });
});

describe('session heartbeat and stop', () => {
  it('posts the heartbeat and deletes with keepalive', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));

    await sendHeartbeat('s 1', fetchFn);
    await stopPlayback('s 1', fetchFn);

    expect(fetchFn).toHaveBeenNthCalledWith(1, '/api/playback/sessions/s%201/heartbeat', {
      method: 'POST',
    });
    expect(fetchFn).toHaveBeenNthCalledWith(2, '/api/playback/sessions/s%201', {
      method: 'DELETE',
      keepalive: true,
    });
  });

  it('swallows network failures: the idle watchdog cleans up', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => {
      throw new TypeError('offline');
    });
    await expect(sendHeartbeat('s', fetchFn)).resolves.toBeUndefined();
    await expect(stopPlayback('s', fetchFn)).resolves.toBeUndefined();
  });
});

describe('saveProgress', () => {
  it('puts the position with keepalive', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));

    await saveProgress('kid', 'm 1', 42, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith('/api/profiles/kid/media/m%201/progress', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionSec: 42 }),
      keepalive: true,
    });
  });

  it('swallows a network failure', async () => {
    const fetchFn = vi.fn(async (): Promise<Response> => {
      throw new TypeError('offline');
    });

    await expect(saveProgress('kid', 'm1', 1, fetchFn)).resolves.toBeUndefined();
  });
});

describe('loadProgress', () => {
  it('returns the saved positions', async () => {
    const rows = [
      { mediaId: 'm1', positionSec: 5, durationSec: 10, finished: false, updatedAt: 'x' },
    ];

    const fetchFn = vi.fn(async () => respond(rows, 200));

    await expect(loadProgress('kid', fetchFn)).resolves.toEqual(rows);
    expect(fetchFn).toHaveBeenCalledWith('/api/profiles/kid/progress');
  });

  it('returns nothing when the server fails', async () => {
    await expect(loadProgress('kid', async () => respond({}, 500))).resolves.toEqual([]);
  });
});

describe('profiles', () => {
  const kid = { id: 'k1', name: 'Kid', avatar: 'blue' } as const;
  const offline = async (): Promise<Response> => {
    throw new TypeError('offline');
  };

  it('loads the profiles', async () => {
    await expect(loadProfiles(async () => respond([kid]))).resolves.toEqual([kid]);
  });

  it('creates a profile', async () => {
    const fetchFn = vi.fn(async () => respond(kid, 201));

    await expect(createProfile({ name: 'Kid', avatar: 'blue' }, fetchFn)).resolves.toEqual({
      ok: true,
      profile: kid,
    });
    expect(fetchFn).toHaveBeenCalledWith('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Kid', avatar: 'blue' }),
    });
  });

  it('returns the error code of a refused write', async () => {
    const fetchFn = vi.fn(async () => respond({ error: 'profile_name_taken' }, 409));

    await expect(updateProfile('k 1', { name: 'Me' }, fetchFn)).resolves.toEqual({
      ok: false,
      error: 'profile_name_taken',
    });
    expect(fetchFn).toHaveBeenCalledWith('/api/profiles/k%201', expect.anything());
  });

  it('reports a network failure or a non-JSON answer as a null error', async () => {
    await expect(createProfile({ name: 'Kid', avatar: 'blue' }, offline)).resolves.toEqual({
      ok: false,
      error: null,
    });
    await expect(
      updateProfile('k1', {}, async () => new Response('<html>', { status: 502 })),
    ).resolves.toEqual({ ok: false, error: null });
  });

  it('deletes a profile', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));

    await expect(deleteProfile('k1', fetchFn)).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledWith('/api/profiles/k1', { method: 'DELETE' });
  });

  it('returns why a delete was refused', async () => {
    await expect(
      deleteProfile('k1', async () => respond({ error: 'last_profile' }, 409)),
    ).resolves.toEqual({ ok: false, error: 'last_profile' });
    await expect(deleteProfile('k1', offline)).resolves.toEqual({ ok: false, error: null });
  });
});

describe('subtitleUrl', () => {
  it('builds the shifted track URL under /api', () => {
    expect(subtitleUrl('a b', 2, 754)).toBe('/api/media/a%20b/subtitles/2?offsetSec=754');
  });
});

describe('fire-and-forget calls after the session ended', () => {
  it('tell the auth gate about a 401 and still never throw', async () => {
    const listener = vi.fn();
    onUnauthenticated(listener);
    const gone = async () => new Response('{}', { status: 401 });

    await saveProgress('p1', 'm1', 12, gone);
    await sendHeartbeat('s1', gone);

    expect(listener).toHaveBeenCalledTimes(2);
    onUnauthenticated(() => undefined);
  });
});

describe('setWatched', () => {
  it.each([
    [true, 'PUT'],
    [false, 'DELETE'],
  ])('should send %s as %s', async (value, method) => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));

    expect(await setWatched('kid', 'm 1', value, fetchFn)).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('/api/profiles/kid/media/m%201/watched', { method });
  });

  it('should report a refusal or an unreachable server', async () => {
    expect(
      await setWatched('kid', 'm', true, async () => new Response(null, { status: 404 })),
    ).toBe(false);
    expect(
      await setWatched('kid', 'm', true, async () => {
        throw new TypeError('offline');
      }),
    ).toBe(false);
  });
});

describe('Discover helpers (UC26)', () => {
  it('builds the URLs of lists, search, sheet and posters', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => respond([]));
    await loadDiscover('trending', 'tv', fetchFn);
    await searchDiscover('la haine', fetchFn);
    expect(fetchFn.mock.calls.map((call) => call[0])).toEqual([
      '/api/discover?list=trending&kind=tv',
      '/api/discover/search?q=la%20haine',
    ]);
    expect(posterUrl('/abc.jpg')).toBe('/api/discover/poster/abc.jpg');
  });

  it('loads a title sheet, and throws on an error status or a network failure', async () => {
    await expect(
      loadDiscoverDetails('movie', 7, async () => respond({ tmdbId: 7 })),
    ).resolves.toEqual({
      tmdbId: 7,
    });
    await expect(
      loadDiscoverDetails('movie', 7, async () => respond({}, 502)),
    ).rejects.toMatchObject({
      status: 502,
    });
    await expect(
      loadDiscoverDetails('movie', 7, async () => Promise.reject(new TypeError('offline'))),
    ).rejects.toMatchObject({ status: null });
  });

  it('reads the wishlist, empty when the server fails', async () => {
    await expect(loadWishlist('p 1', async () => respond([{ tmdbId: 1 }]))).resolves.toEqual([
      { tmdbId: 1 },
    ]);
    await expect(loadWishlist('p1', async () => respond({}, 500))).resolves.toEqual([]);
  });

  it('adds with PUT, removes with DELETE, false when refused or offline', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(setWishlisted('p1', 'movie', 3, true, fetchFn)).resolves.toBe(true);
    await expect(setWishlisted('p1', 'tv', 4, false, fetchFn)).resolves.toBe(true);
    expect(fetchFn.mock.calls).toEqual([
      ['/api/profiles/p1/wishlist/movie/3', { method: 'PUT' }],
      ['/api/profiles/p1/wishlist/tv/4', { method: 'DELETE' }],
    ]);
    await expect(setWishlisted('p1', 'tv', 4, true, async () => respond({}, 409))).resolves.toBe(
      false,
    );
    await expect(
      setWishlisted('p1', 'tv', 4, true, async () => Promise.reject(new TypeError('offline'))),
    ).resolves.toBe(false);
  });
});
