import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { MyProvider, NotificationList } from '@popcorntv/shared';
import { openDatabase } from '../db/index.js';
import { notifications as notificationsTable } from '../db/schema.js';
import { ProfileRepository } from '../profiles/repository.js';
import { actAs, createAccount } from '../test-fixtures.js';
import { MyProviderRepository } from './my-provider-repository.js';
import {
  NOTIFICATION_RETENTION_MS,
  NOTIFICATIONS_SHOWN,
  NotificationRepository,
} from './notification-repository.js';
import { registerNotificationRoutes } from './notification-routes.js';

async function setup() {
  const db = openDatabase(':memory:');
  const owner = createAccount(db);
  const neighbour = createAccount(db, 'neighbour', 'viewer');
  const profiles = new ProfileRepository(db);
  const [profile] = profiles.list(owner.userId);
  const [theirs] = profiles.list(neighbour.userId);
  if (!profile || !theirs) throw new Error('no profile');
  const notifications = new NotificationRepository(db);
  const myProviders = new MyProviderRepository(db);
  const app = Fastify();
  actAs(app, () => ({ userId: owner.userId, role: 'owner', sessionId: owner.sessionId }));
  registerNotificationRoutes(app, { notifications, myProviders, profiles });
  await app.ready();
  const note = (tmdbId: number, at: Date) =>
    notifications.add(
      {
        profileId: profile.id,
        kind: 'movie',
        tmdbId,
        title: `Title ${tmdbId}`,
        reason: 'provider',
        providerId: 8,
        providerName: 'Netflix',
      },
      at,
    );
  return { app, db, profile, theirs, notifications, myProviders, note };
}

describe('notification routes', () => {
  it('should list the newest notifications first with the unread count, then mark them read', async () => {
    const t = await setup();
    t.note(1, new Date('2026-11-01T00:00:00Z'));
    t.note(2, new Date('2026-11-02T00:00:00Z'));
    const url = `/profiles/${t.profile.id}/notifications`;

    const first = (await t.app.inject({ url })).json<NotificationList>();
    expect(first.unread).toBe(2);
    expect(first.items.map((item) => item.tmdbId)).toEqual([2, 1]);
    expect(first.items[0]).toMatchObject({
      reason: 'provider',
      providerName: 'Netflix',
      readAt: null,
    });

    const read = await t.app.inject({ method: 'PUT', url: `${url}/read` });
    expect(read.statusCode).toBe(204);
    const after = (await t.app.inject({ url })).json<NotificationList>();
    expect(after.unread).toBe(0);
    expect(after.items.every((item) => item.readAt !== null)).toBe(true);
  });

  it('should cap the list but count every unread line', async () => {
    const t = await setup();
    for (let i = 0; i <= NOTIFICATIONS_SHOWN; i += 1)
      t.note(i, new Date(Date.UTC(2026, 0, 1, 0, i)));
    const body = (
      await t.app.inject({ url: `/profiles/${t.profile.id}/notifications` })
    ).json<NotificationList>();
    expect(body.items).toHaveLength(NOTIFICATIONS_SHOWN);
    expect(body.unread).toBe(NOTIFICATIONS_SHOWN + 1);
  });

  it('should answer an empty list for a profile without notification', async () => {
    const t = await setup();
    const res = await t.app.inject({ url: `/profiles/${t.profile.id}/notifications` });
    expect(res.json()).toEqual({ items: [], unread: 0 });
  });

  it.each([
    ['GET', 'notifications'],
    ['PUT', 'notifications/read'],
    ['GET', 'providers'],
    ['PUT', 'providers/8'],
    ['DELETE', 'providers/8'],
  ] as const)('should refuse %s %s on another user’s profile', async (method, path) => {
    const t = await setup();
    const res = await t.app.inject({
      method,
      url: `/profiles/${t.theirs.id}/${path}`,
      ...(method === 'PUT' && path.startsWith('providers') ? { payload: { name: 'Netflix' } } : {}),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'profile_not_found' });
  });

  it('should refuse a malformed profile id or provider id', async () => {
    const t = await setup();
    expect((await t.app.inject({ url: '/profiles/nope/notifications' })).statusCode).toBe(400);
    for (const id of ['0', 'abc', '2147483648']) {
      const res = await t.app.inject({
        method: 'PUT',
        url: `/profiles/${t.profile.id}/providers/${id}`,
        payload: { name: 'X' },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('should add, rename, list by name and remove my providers', async () => {
    const t = await setup();
    const url = `/profiles/${t.profile.id}/providers`;
    const put = (id: number, name: string) =>
      t.app.inject({ method: 'PUT', url: `${url}/${id}`, payload: { name } });
    expect((await put(8, 'Netflix')).statusCode).toBe(204);
    expect((await put(337, ' Disney Plus ')).statusCode).toBe(204);
    expect((await put(337, 'Disney+')).statusCode).toBe(204);
    expect((await t.app.inject({ url })).json<MyProvider[]>()).toEqual([
      { providerId: 337, name: 'Disney+' },
      { providerId: 8, name: 'Netflix' },
    ]);

    expect((await t.app.inject({ method: 'DELETE', url: `${url}/8` })).statusCode).toBe(204);
    expect((await t.app.inject({ method: 'DELETE', url: `${url}/8` })).statusCode).toBe(204);
    expect((await t.app.inject({ url })).json<MyProvider[]>()).toEqual([
      { providerId: 337, name: 'Disney+' },
    ]);
  });

  it.each([{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(101) }])(
    'should refuse the provider body %j',
    async (payload) => {
      const t = await setup();
      const res = await t.app.inject({
        method: 'PUT',
        url: `/profiles/${t.profile.id}/providers/8`,
        payload,
      });
      expect(res.statusCode).toBe(400);
    },
  );

  it('should refuse a new provider past the limit but still rename one', async () => {
    const t = await setup();
    for (let id = 1; id <= 50; id += 1)
      t.myProviders.put(t.profile.id, { providerId: id, name: `P${id}` }, 50);
    const url = `/profiles/${t.profile.id}/providers`;
    const extra = await t.app.inject({ method: 'PUT', url: `${url}/51`, payload: { name: 'P51' } });
    expect(extra.statusCode).toBe(409);
    expect(extra.json()).toEqual({ error: 'too_many_providers' });
    const rename = await t.app.inject({ method: 'PUT', url: `${url}/1`, payload: { name: 'One' } });
    expect(rename.statusCode).toBe(204);
  });
});

describe('NotificationRepository.purge', () => {
  it('should forget lines past the retention and keep the rest', async () => {
    const t = await setup();
    const now = new Date('2026-11-10T00:00:00Z');
    t.note(1, new Date(now.getTime() - NOTIFICATION_RETENTION_MS - 1));
    t.note(2, new Date(now.getTime() - NOTIFICATION_RETENTION_MS + 1));
    t.notifications.purge(now);
    const rows = t.db.select({ tmdbId: notificationsTable.tmdbId }).from(notificationsTable).all();
    expect(rows).toEqual([{ tmdbId: 2 }]);
  });
});
