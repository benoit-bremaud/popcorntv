import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { WatchProviders } from '@popcorntv/shared';
import { openDatabase } from '../db/index.js';
import { libraries, media } from '../db/schema.js';
import { ProfileRepository } from '../profiles/repository.js';
import { createAccount } from '../test-fixtures.js';
import type { AvailabilityCheckDeps } from './availability-check.js';
import {
  availabilityEvents,
  checkAvailability,
  countingProviders,
  startAvailabilityCheck,
} from './availability-check.js';
import { MyProviderRepository } from './my-provider-repository.js';
import { NotificationRepository } from './notification-repository.js';
import { WishlistRepository } from './wishlist-repository.js';

const MINE = new Set([8]);

describe('availabilityEvents', () => {
  it('should raise library when the title arrived on disk', () => {
    expect(
      availabilityEvents(
        { inLibrary: false, providerIds: [] },
        { inLibrary: true, providerIds: [] },
        MINE,
      ),
    ).toEqual([{ reason: 'library', providerId: null }]);
  });

  it('should raise one event per newly offered provider of mine only', () => {
    expect(
      availabilityEvents(
        { inLibrary: true, providerIds: [119] },
        { inLibrary: true, providerIds: [8, 119, 337] },
        new Set([8, 119]),
      ),
    ).toEqual([{ reason: 'provider', providerId: 8 }]);
  });

  it('should raise nothing when nothing changed or the title left', () => {
    const seen = { inLibrary: true, providerIds: [8] };
    expect(availabilityEvents(seen, seen, MINE)).toEqual([]);
    expect(availabilityEvents(seen, { inLibrary: false, providerIds: [] }, MINE)).toEqual([]);
  });

  it('should only record a baseline on the first look at the providers', () => {
    expect(
      availabilityEvents(
        { inLibrary: false, providerIds: null },
        { inLibrary: false, providerIds: [8] },
        MINE,
      ),
    ).toEqual([]);
  });

  it('should raise no provider event when the offers are unknown', () => {
    expect(
      availabilityEvents(
        { inLibrary: false, providerIds: [] },
        { inLibrary: false, providerIds: null },
        MINE,
      ),
    ).toEqual([]);
  });
});

describe('countingProviders', () => {
  it('should keep flatrate, free and ads once each, sorted, and drop rent and buy', () => {
    const answer: WatchProviders = {
      link: null,
      offers: [
        { providerId: 337, name: 'Disney+', logoPath: null, type: 'flatrate' },
        { providerId: 2, name: 'Apple TV', logoPath: null, type: 'rent' },
        { providerId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' },
        { providerId: 8, name: 'Netflix', logoPath: null, type: 'ads' },
        { providerId: 3, name: 'Play', logoPath: null, type: 'buy' },
        { providerId: 61, name: 'Arte', logoPath: null, type: 'free' },
      ],
    };
    expect(countingProviders(answer)).toEqual([8, 61, 337]);
  });

  it('should answer nothing for no offer', () => {
    expect(countingProviders({ link: null, offers: [] })).toEqual([]);
  });
});

const NETFLIX: WatchProviders = {
  link: null,
  offers: [{ providerId: 8, name: 'Netflix', logoPath: null, type: 'flatrate' }],
};

function setup() {
  const db = openDatabase(':memory:');
  const owner = createAccount(db);
  const profiles = new ProfileRepository(db);
  const [profile] = profiles.list(owner.userId);
  if (!profile) throw new Error('no profile');
  const wishlist = new WishlistRepository(db);
  const notifications = new NotificationRepository(db);
  const myProviders = new MyProviderRepository(db);
  const libraryId = randomUUID();
  db.insert(libraries)
    .values({ id: libraryId, name: 'Films', rootPath: '/m', kind: 'films', createdAt: '' })
    .run();
  const addFilm = (tmdbId: number): void => {
    db.insert(media)
      .values({ id: randomUUID(), libraryId, kind: 'film', title: 'Dune', tmdbId })
      .run();
  };
  const wish = (tmdbId: number, profileId = profile.id): void =>
    wishlist.add(profileId, {
      kind: 'movie',
      tmdbId,
      title: `Title ${tmdbId}`,
      year: 2021,
      overview: '',
      voteAverage: 7,
      posterPath: null,
    });
  const logger = { info: vi.fn(), warn: vi.fn() };
  return {
    db,
    owner,
    profiles,
    profile,
    wishlist,
    notifications,
    myProviders,
    addFilm,
    wish,
    logger,
  };
}

describe('checkAvailability', () => {
  it('should notify a title arriving on disk, once', async () => {
    const t = setup();
    t.wish(1);
    const deps = { ...t, offers: null };
    await checkAvailability(deps);
    t.addFilm(1);
    await checkAvailability(deps);
    await checkAvailability(deps);

    const { items, unread } = t.notifications.list(t.profile.id);
    expect(unread).toBe(1);
    expect(items).toMatchObject([
      {
        kind: 'movie',
        tmdbId: 1,
        title: 'Title 1',
        reason: 'library',
        providerId: null,
        readAt: null,
      },
    ]);
    expect(t.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'notification.created', reason: 'library', tmdbId: 1 }),
      'notification created',
    );
  });

  it('should not notify a title already on disk when added', async () => {
    const t = setup();
    t.addFilm(1);
    t.wish(1);
    await checkAvailability({ ...t, offers: null });
    expect(t.notifications.list(t.profile.id).unread).toBe(0);
  });

  it('should notify a new offer on one of my providers after the baseline, by name', async () => {
    const t = setup();
    t.wish(1);
    t.myProviders.put(t.profile.id, { providerId: 8, name: 'Netflix' }, 50);
    const offers = vi.fn<NonNullable<AvailabilityCheckDeps['offers']>>(async () => ({
      link: null,
      offers: [],
    }));
    await checkAvailability({ ...t, offers });
    offers.mockResolvedValue(NETFLIX);
    await checkAvailability({ ...t, offers });

    expect(t.notifications.list(t.profile.id).items).toMatchObject([
      { reason: 'provider', providerId: 8, providerName: 'Netflix' },
    ]);
  });

  it('should not notify an offer on a provider that is not mine, nor when it becomes mine', async () => {
    const t = setup();
    t.wish(1);
    const offers = vi.fn<NonNullable<AvailabilityCheckDeps['offers']>>(async () => ({
      link: null,
      offers: [],
    }));
    await checkAvailability({ ...t, offers });
    offers.mockResolvedValue(NETFLIX);
    await checkAvailability({ ...t, offers });
    t.myProviders.put(t.profile.id, { providerId: 8, name: 'Netflix' }, 50);
    await checkAvailability({ ...t, offers });
    expect(t.notifications.list(t.profile.id).unread).toBe(0);
  });

  it('should look a title up once for every profile wishing it, and notify each', async () => {
    const t = setup();
    const other = t.profiles.create(t.owner.userId, { name: 'Kid', avatar: 'blue' });
    if (!other.ok) throw new Error('no second profile');
    t.wish(1);
    t.wish(1, other.profile.id);
    const offers = vi.fn(async () => NETFLIX);
    await checkAvailability({ ...t, offers });
    t.addFilm(1);
    await checkAvailability({ ...t, offers });

    expect(offers).toHaveBeenCalledTimes(2);
    expect(t.notifications.list(t.profile.id).unread).toBe(1);
    expect(t.notifications.list(other.profile.id).unread).toBe(1);
  });

  it('should log a TMDB failure, keep the baseline and go on with the next title', async () => {
    const t = setup();
    t.wish(1);
    t.wish(2);
    t.myProviders.put(t.profile.id, { providerId: 8, name: 'Netflix' }, 50);
    const offers = vi.fn<NonNullable<AvailabilityCheckDeps['offers']>>(async () => ({
      link: null,
      offers: [],
    }));
    await checkAvailability({ ...t, offers });
    offers.mockImplementation(async (_kind, id) => {
      if (id === 1) throw new Error('TMDB down');
      return NETFLIX;
    });
    await checkAvailability({ ...t, offers });
    offers.mockResolvedValue(NETFLIX);
    await checkAvailability({ ...t, offers });

    const titles = t.notifications.list(t.profile.id).items.map((item) => item.tmdbId);
    expect(titles.sort()).toEqual([1, 2]);
    expect(t.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'wishlist.check.title_failed', tmdbId: 1 }),
      'wishlist check failed for a title',
    );
    expect(t.logger.info).toHaveBeenCalledWith(
      { event: 'wishlist.check.done', titles: 2, notified: 1, failed: 1 },
      'wishlist check done',
    );
  });

  it('should stop between titles once stopped', async () => {
    const t = setup();
    t.wish(1);
    t.wish(2);
    const offers = vi.fn(async () => NETFLIX);
    let calls = 0;
    await checkAvailability({ ...t, offers }, () => calls++ > 0);
    expect(offers).toHaveBeenCalledTimes(1);
  });

  it('should do nothing on an empty wishlist', async () => {
    const t = setup();
    const offers = vi.fn(async () => NETFLIX);
    await checkAvailability({ ...t, offers });
    expect(offers).not.toHaveBeenCalled();
  });
});

describe('startAvailabilityCheck', () => {
  it('should run on each tick, skip a tick while a run is going, and stop', async () => {
    const t = setup();
    t.wish(1);
    let tick: () => void = () => undefined;
    const clearInterval = vi.fn();
    let release: () => void = () => undefined;
    const offers = vi.fn(
      () =>
        new Promise<WatchProviders>((resolve) => {
          release = () => resolve(NETFLIX);
        }),
    );
    const stop = startAvailabilityCheck({
      ...t,
      offers,
      intervalMin: 5,
      setInterval: (run, ms) => {
        expect(ms).toBe(300_000);
        tick = run;
        return 'handle';
      },
      clearInterval,
    });
    tick();
    tick();
    expect(offers).toHaveBeenCalledTimes(1);
    const stopped = stop();
    release();
    await stopped;
    expect(clearInterval).toHaveBeenCalledWith('handle');
    tick();
    expect(offers).toHaveBeenCalledTimes(1);
  });

  it('should log a failed run', async () => {
    const t = setup();
    let tick: () => void = () => undefined;
    const stop = startAvailabilityCheck({
      ...t,
      wishlist: {
        checkRows: () => {
          throw new Error('db gone');
        },
        saveSeen: vi.fn(),
      },
      offers: null,
      intervalMin: 1,
      setInterval: (run) => {
        tick = run;
        return 1;
      },
      clearInterval: vi.fn(),
    });
    tick();
    await stop();
    expect(t.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'wishlist.check.failed' }),
      'wishlist check failed',
    );
  });
});
