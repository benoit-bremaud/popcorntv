import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../db/index.js';
import type { AppDatabase } from '../db/index.js';
import {
  preparationAttempts as attempts,
  preparationDemands as demands,
  preparationInterests as interests,
  preparationTargets as targets,
  profiles,
  users,
} from '../db/schema.js';
import { createAccount } from '../test-fixtures.js';
import { WishlistRepository } from './wishlist-repository.js';
import type { TitleFacts } from './wishlist-repository.js';
import { PreparationRequestRepository } from './preparation-request-repository.js';
import type { RetirementEvidence } from './preparation-request-repository.js';

const MOVIE: TitleFacts = {
  kind: 'movie',
  tmdbId: 1,
  title: 'Synthetic film',
  year: 2026,
  overview: '',
  voteAverage: 0,
  posterPath: null,
};
const opened: AppDatabase[] = [];
const folders: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const db of opened.splice(0)) db.$client.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function setup(path = ':memory:') {
  const db = openDatabase(path);
  opened.push(db);
  const owner = createAccount(db);
  const wishes = new WishlistRepository(db);
  let time = Date.parse('2026-11-13T12:00:00Z');
  const logger = { info: vi.fn(), warn: vi.fn() };
  const repo = new PreparationRequestRepository(db, { now: () => new Date(time), logger });
  const demand = wishes.add('default', MOVIE).demandId;
  const target = repo.ensureTarget(demand);
  const resolve = (state: 'needs_preparation' | 'already_playable' = 'needs_preparation') =>
    repo.resolveLocal(target, state, new Date(time + 1000));
  const claim = () => {
    resolve();
    return repo.claim(target, 'fixture');
  };
  return {
    db,
    owner,
    wishes,
    repo,
    demand,
    target,
    resolve,
    claim,
    logger,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('durable wishlist preparation interests', () => {
  it('shares demand across repeated wishes and profiles while preserving private interest lifetimes', () => {
    const h = setup();
    const first = h.db.select().from(interests).get();
    expect(h.wishes.add('default', MOVIE)).toEqual({ demandId: h.demand, created: false });
    expect(h.db.select().from(interests).get()).toEqual(first);
    const viewer = createAccount(h.db, 'viewer', 'viewer');
    const profile = h.db.select().from(profiles).where(eq(profiles.userId, viewer.userId)).get()!;
    expect(h.wishes.add(profile.id, MOVIE)).toEqual({ demandId: h.demand, created: true });
    h.wishes.remove('default', 'movie', 1);
    h.wishes.remove('default', 'movie', 1);
    expect(h.db.select().from(interests).all()).toHaveLength(1);
    expect(h.db.select().from(demands).all()).toHaveLength(1);
    h.wishes.add('default', MOVIE);
    expect(
      h.db.select().from(interests).where(eq(interests.profileId, 'default')).get()?.id,
    ).not.toBe(first?.id);
  });

  it('rolls back wishlist and demand when interest persistence fails', () => {
    const h = setup();
    h.db.run(
      sql.raw(
        "CREATE TRIGGER reject_interest BEFORE INSERT ON preparation_interests BEGIN SELECT RAISE(ABORT, 'fixture rejection'); END",
      ),
    );
    expect(() => h.wishes.add('default', { ...MOVIE, tmdbId: 2 })).toThrow('fixture rejection');
    expect(h.wishes.list('default').map((w) => w.tmdbId)).toEqual([1]);
    expect(h.db.select().from(demands).all()).toHaveLength(1);
  });

  it('rejects silently ignored database inserts without leaving a partial wish or target', () => {
    const h = setup();
    h.db.run(
      sql.raw(
        'CREATE TRIGGER ignore_demand BEFORE INSERT ON preparation_demands BEGIN SELECT RAISE(IGNORE); END',
      ),
    );
    expect(() => h.wishes.add('default', { ...MOVIE, tmdbId: 2 })).toThrow('demand missing');
    expect(h.wishes.list('default')).toHaveLength(1);
    h.db.run(sql.raw('DROP TRIGGER ignore_demand'));
    const series = h.wishes.add('default', { ...MOVIE, kind: 'tv' }).demandId;
    h.db.run(
      sql.raw(
        'CREATE TRIGGER ignore_target BEFORE INSERT ON preparation_targets BEGIN SELECT RAISE(IGNORE); END',
      ),
    );
    expect(() => h.repo.ensureTarget(series, { season: 1, episode: 1 })).toThrow('target missing');
    expect(h.db.select().from(targets).all()).toHaveLength(1);
  });

  it('cascades account deletion only into private interests, preserving shared jobs', () => {
    const h = setup();
    const token = h.claim();
    const viewer = createAccount(h.db, 'viewer', 'viewer');
    const profile = h.db.select().from(profiles).where(eq(profiles.userId, viewer.userId)).get()!;
    h.wishes.add(profile.id, MOVIE);
    h.db.delete(users).where(eq(users.id, h.owner.userId)).run();
    expect(
      h.db
        .select()
        .from(interests)
        .all()
        .map((i) => i.profileId),
    ).toEqual([profile.id]);
    expect(h.db.select().from(attempts).get()?.id).toBe(token);
  });

  it('keeps movie, series and episode namespaces separate and accepts season zero', () => {
    const h = setup();
    const series = h.wishes.add('default', { ...MOVIE, kind: 'tv' }).demandId;
    expect(series).not.toBe(h.demand);
    expect(() => h.repo.ensureTarget(series)).toThrow('namespace');
    expect(() => h.repo.ensureTarget(h.demand, { season: 0, episode: 1 })).toThrow('namespace');
    const first = h.repo.ensureTarget(series, { season: 0, episode: 1 });
    expect(h.repo.ensureTarget(series, { season: 0, episode: 1 })).toBe(first);
    expect(h.repo.ensureTarget(series, { season: 0, episode: 2 })).not.toBe(first);
    expect(h.repo.ensureTarget(series, { season: 2_147_483_647, episode: 2_147_483_647 })).not.toBe(
      first,
    );
    expect(() => h.repo.ensureTarget('missing')).toThrow('unknown');
  });

  it.each([
    [-1, 1],
    [0, 0],
    [0.5, 1],
    [0, 1.5],
    [2_147_483_648, 1],
    [0, 2_147_483_648],
    [Number.MAX_SAFE_INTEGER + 1, 1],
    [0, NaN],
  ])('rejects invalid episode boundaries (%s, %s) before creating a target', (season, episode) => {
    const h = setup();
    const series = h.wishes.add('default', { ...MOVIE, kind: 'tv' }).demandId;
    expect(() => h.repo.ensureTarget(series, { season, episode })).toThrow(
      'invalid preparation episode',
    );
    expect(h.db.select().from(targets).all()).toHaveLength(1);
  });
});

describe('write-ahead attempt protocol', () => {
  it.each([
    ['a', 'j'],
    ['a'.repeat(64), 'j'.repeat(256)],
  ])('admits exact valid namespace/reference boundaries', (backend, reference) => {
    const h = setup();
    h.resolve();
    const token = h.repo.claim(h.target, backend)!;
    expect(token).toEqual(expect.any(String));
    expect(h.repo.accept(token, reference)).toBe(true);
    expect(h.db.select().from(attempts).get()).toMatchObject({
      backend,
      upstreamReference: reference,
    });
  });

  it('supports injected identity and default time without exposing a target as resolved', () => {
    const h = setup();
    vi.useFakeTimers({ now: Date.parse('2026-11-13T12:00:00Z') });
    const repo = new PreparationRequestRepository(h.db, { id: () => 'deterministic-target' });
    const series = h.wishes.add('default', { ...MOVIE, kind: 'tv' }).demandId;
    const before = Date.now();
    expect(repo.ensureTarget(series, { season: 1, episode: 1 })).toBe('deterministic-target');
    const row = h.db.select().from(targets).where(eq(targets.id, 'deterministic-target')).get()!;
    expect(Date.parse(row.createdAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(row.createdAt)).toBeLessThanOrEqual(Date.now());
    expect(repo.claim(row.id, 'fixture')).toBeNull();
    repo.resolveLocal(row.id, 'needs_preparation', new Date(Date.now() + 60_000));
    const token = repo.claim(row.id, 'fixture')!;
    expect(token).toEqual(expect.any(String));
    expect(repo.accept(token, 'job')).toBe(true);
    expect(repo.accept(token, 'conflict')).toBe(false);
  });

  it('admits exactly one active token and preserves namespace/reference privately', () => {
    const h = setup();
    const token = h.claim();
    expect(token).toEqual(expect.any(String));
    expect(h.repo.claim(h.target, 'other-client')).toBeNull();
    expect(h.repo.accept(token!, 'secret-reference')).toBe(true);
    expect(h.repo.accept(token!, 'secret-reference')).toBe(true);
    expect(h.repo.accept(token!, 'different')).toBe(false);
    expect(h.repo.accept('missing-token', 'reference')).toBe(false);
    expect(h.repo.claim(h.target, 'fixture')).toBeNull();
    expect(
      JSON.stringify(h.logger.info.mock.calls) + JSON.stringify(h.logger.warn.mock.calls),
    ).not.toContain('secret-reference');
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'refused' }),
      expect.any(String),
    );
  });

  it('blocks unresolved, already-playable, stale and future-dated local evidence', () => {
    const h = setup();
    expect(h.repo.claim(h.target, 'fixture')).toBeNull();
    h.resolve('already_playable');
    expect(h.repo.claim(h.target, 'fixture')).toBeNull();
    h.resolve();
    h.advance(1000);
    expect(h.repo.claim(h.target, 'fixture')).toBeNull();
    h.resolve();
    h.advance(-1);
    expect(h.repo.claim(h.target, 'fixture')).toBeNull();
    h.advance(1);
    expect(h.repo.claim(h.target, 'fixture')).not.toBeNull();
    expect(h.repo.claim('missing-target', 'fixture')).toBeNull();
  });

  it('clears failed/unknown resolution and refuses missing or invalid probe lifetimes', () => {
    const h = setup();
    h.resolve();
    expect(h.repo.resolveLocal(h.target, 'unresolved')).toBe(true);
    expect(h.db.select().from(targets).get()).toMatchObject({
      resolution: 'unresolved',
      observedAtMs: null,
      validUntilMs: null,
    });
    expect(h.repo.claim(h.target, 'fixture')).toBeNull();
    expect(h.repo.resolveLocal('missing', 'unresolved')).toBe(false);
    expect(() => h.repo.resolveLocal(h.target, 'needs_preparation')).toThrow('lifetime');
    expect(() => h.repo.resolveLocal(h.target, 'needs_preparation', new Date(NaN))).toThrow(
      'lifetime',
    );
    expect(() =>
      h.repo.resolveLocal(h.target, 'already_playable', new Date('2026-11-13T12:00:00Z')),
    ).toThrow('lifetime');
    expect(() => h.repo.resolveLocal(h.target, 'invalid' as 'unresolved')).toThrow('resolution');
  });

  it('rolls back attempt retirement if clearing obsolete local evidence fails', () => {
    const h = setup();
    const token = h.claim()!;
    h.db.run(
      sql.raw(
        "CREATE TRIGGER reject_resolution BEFORE UPDATE ON preparation_targets BEGIN SELECT RAISE(ABORT, 'fixture resolution failure'); END",
      ),
    );
    expect(() =>
      h.repo.retire(token, { reason: 'not_accepted', dispatcherFenced: true, providerFinal: true }),
    ).toThrow('fixture resolution failure');
    expect(h.db.select().from(attempts).get()?.state).toBe('uncertain');
    expect(h.db.select().from(targets).get()?.resolution).toBe('needs_preparation');
  });

  it('checks remaining owned demand atomically and settles removed subscribers without recreating them', () => {
    const h = setup();
    h.resolve();
    h.wishes.remove('default', 'movie', 1);
    expect(h.repo.claim(h.target, 'fixture')).toBeNull();
    h.wishes.add('default', MOVIE);
    const token = h.repo.claim(h.target, 'fixture')!;
    h.wishes.remove('default', 'movie', 1);
    expect(h.repo.accept(token, 'job')).toBe(true);
    expect(h.db.select().from(interests).all()).toEqual([]);
  });

  it('requires both fencing and provider finality; an empty lookup cannot release a paused dispatcher', () => {
    const h = setup();
    const paused = h.claim()!;
    expect(() =>
      h.repo.retire(paused, {
        reason: 'not_accepted',
        dispatcherFenced: false,
        providerFinal: true,
      } as unknown as RetirementEvidence),
    ).toThrow('evidence');
    expect(() =>
      h.repo.retire(paused, {
        reason: 'not_accepted',
        dispatcherFenced: true,
        providerFinal: false,
      } as unknown as RetirementEvidence),
    ).toThrow('evidence');
    h.advance(60_000);
    h.resolve();
    expect(h.repo.claim(h.target, 'fixture')).toBeNull();
    expect(h.repo.accept(paused, 'late-job')).toBe(true);
    expect(
      h.repo.retire(paused, {
        reason: 'not_accepted',
        dispatcherFenced: true,
        providerFinal: true,
      }),
    ).toBe(false);
  });

  it('retires only guarded matching states, retains history and refuses stale acceptance', () => {
    const h = setup();
    const first = h.claim()!;
    const absence = {
      reason: 'not_accepted',
      dispatcherFenced: true,
      providerFinal: true,
    } as const;
    const finished = {
      reason: 'finished',
      upstreamTerminal: true,
      generationReleased: true,
    } as const;
    expect(h.repo.retire(first, finished)).toBe(false);
    expect(h.repo.retire(first, absence)).toBe(true);
    expect(h.repo.retire(first, absence)).toBe(false);
    expect(h.repo.accept(first, 'late')).toBe(false);
    expect(h.repo.claim(h.target, 'other-client')).toBeNull();
    h.resolve();
    const second = h.repo.claim(h.target, 'other-client')!;
    expect(second).not.toBe(first);
    expect(h.repo.accept(second, 'new-job')).toBe(true);
    expect(() =>
      h.repo.retire(second, {
        reason: 'finished',
        upstreamTerminal: true,
        generationReleased: false,
      } as unknown as RetirementEvidence),
    ).toThrow('evidence');
    expect(h.repo.retire(second, finished)).toBe(true);
    expect(h.repo.claim(h.target, 'other-client')).toBeNull();
    h.resolve('already_playable');
    expect(h.repo.claim(h.target, 'other-client')).toBeNull();
    h.resolve();
    expect(h.repo.claim(h.target, 'other-client')).not.toBeNull();
    expect(h.db.select().from(attempts).all()).toHaveLength(3);
  });

  it.each(['', 'A', 'https://secret', 'a'.repeat(65)])('rejects invalid backend %s', (backend) => {
    const h = setup();
    h.resolve();
    expect(() => h.repo.claim(h.target, backend)).toThrow('namespace');
    expect(h.db.select().from(attempts).all()).toEqual([]);
  });

  it.each(['', 'a'.repeat(257), 'secret\nbody'])(
    'rejects invalid references without changing the attempt',
    (reference) => {
      const h = setup();
      const token = h.claim()!;
      expect(() => h.repo.accept(token, reference)).toThrow('reference');
      expect(h.db.select().from(attempts).get()?.state).toBe('uncertain');
    },
  );

  it('persists uncertain attempts across close/reopen and serializes two independent connections', () => {
    const folder = mkdtempSync(join(tmpdir(), 'popcorntv-requests-'));
    folders.push(folder);
    const path = join(folder, 'data.sqlite');
    const h = setup(path);
    h.resolve();
    const secondDb = openDatabase(path);
    opened.push(secondDb);
    const other = new PreparationRequestRepository(secondDb, {
      now: () => new Date('2026-11-13T12:00:00Z'),
    });
    const token = h.repo.claim(h.target, 'fixture');
    expect(other.claim(h.target, 'other-client')).toBeNull();
    expect(secondDb.select().from(attempts).get()?.id).toBe(token);
    h.db.$client.close();
    opened.splice(opened.indexOf(h.db), 1);
    secondDb.$client.close();
    opened.splice(opened.indexOf(secondDb), 1);
    const reopened = openDatabase(path);
    opened.push(reopened);
    const restored = new PreparationRequestRepository(reopened, {
      now: () => new Date('2026-11-13T12:00:00Z'),
    });
    expect(restored.claim(h.target, 'fixture')).toBeNull();
    expect(restored.accept(token!, 'restored-job')).toBe(true);
  });
});

describe('migration and database constraints', () => {
  it('backfills existing wishes through the real migrator exactly once, without attempts or readiness', () => {
    const folder = mkdtempSync(join(tmpdir(), 'popcorntv-requests-migration-'));
    folders.push(folder);
    const path = join(folder, 'legacy.sqlite');
    const raw = new Database(path);
    const root = new URL('../../drizzle/', import.meta.url);
    const journal = JSON.parse(readFileSync(new URL('meta/_journal.json', root), 'utf8')) as {
      entries: { tag: string; when: number }[];
    };
    raw.exec(
      'CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)',
    );
    for (const file of readdirSync(root)
      .filter((name) => name.endsWith('.sql') && name < '0011_')
      .sort())
      raw.exec(
        readFileSync(new URL(file, root), 'utf8').replaceAll('--> statement-breakpoint', ''),
      );
    raw
      .prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)')
      .run('legacy-fixture', journal.entries[10]!.when);
    raw.exec(
      "INSERT INTO wishlist (profile_id, kind, tmdb_id, title, overview, vote_average, added_at) VALUES ('default', 'movie', 1, 'Synthetic', '', 0, '2026-01-01'), ('default', 'tv', 1, 'Synthetic series', '', 0, '2026-01-02')",
    );
    raw.exec(`
      INSERT INTO users (id, username, username_key, password_hash, role, created_at)
      VALUES ('u1', 'First', 'first', 'fixture', 'owner', '2026-01-01'),
             ('u2', 'Second', 'second', 'fixture', 'viewer', '2026-01-01');
      UPDATE profiles SET user_id = 'u1' WHERE id = 'default';
      INSERT INTO profiles (id, user_id, name, name_key, avatar, created_at)
      VALUES ('second', 'u2', 'Second', 'second', 'blue', '2026-01-01');
      INSERT INTO wishlist (profile_id, kind, tmdb_id, title, overview, vote_average, added_at)
      VALUES ('second', 'movie', 1, 'Synthetic', '', 0, '2026-01-03');
    `);
    raw.close();
    const db = openDatabase(path);
    opened.push(db);
    const before = db.select().from(interests).all();
    expect(before).toHaveLength(3);
    expect(new Set(before.filter((i) => i.kind === 'movie').map((i) => i.demandId)).size).toBe(1);
    expect(db.select().from(demands).all()).toHaveLength(2);
    expect(db.select().from(attempts).all()).toEqual([]);
    expect(db.select().from(targets).all()).toEqual([]);
    const again = openDatabase(path);
    opened.push(again);
    expect(again.select().from(interests).all()).toEqual(before);
    expect(again.$client.pragma('foreign_key_check')).toEqual([]);
  });

  it('enforces target, resolution, demand linkage and active-attempt constraints below the repository', () => {
    const h = setup();
    expect(() =>
      h.db
        .update(targets)
        .set({ resolution: 'needs_preparation', observedAtMs: 1, validUntilMs: null })
        .run(),
    ).toThrow();
    expect(() => h.db.update(targets).set({ season: 0 }).run()).toThrow();
    expect(() => h.db.update(interests).set({ tmdbId: 2 }).run()).toThrow();
    const token = h.claim()!;
    expect(() =>
      h.db
        .insert(attempts)
        .values({
          id: 'duplicate',
          targetId: h.target,
          backend: 'fixture',
          state: 'uncertain',
          createdAt: '',
          updatedAt: '',
        })
        .run(),
    ).toThrow();
    expect(() =>
      h.db
        .update(attempts)
        .set({ state: 'retired', retirementReason: null })
        .where(eq(attempts.id, token))
        .run(),
    ).toThrow();
    expect(h.db.select().from(attempts).get()?.state).toBe('uncertain');
  });
});
