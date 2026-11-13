import { randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { DiscoverKind } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import {
  preparationAttempts as attempts,
  preparationDemands as demands,
  preparationInterests as interests,
  preparationTargets as targets,
  profiles,
  users,
} from '../db/schema.js';

/** Inject time/identity and categorical logging without introducing external service IO. */
export interface PreparationRequestOptions {
  readonly now?: () => Date;
  readonly id?: () => string;
  readonly logger?: Pick<FastifyBaseLogger, 'info' | 'warn'>;
}

/** Trusted adapter evidence; no HTTP endpoint accepts these attestations from a browser. */
export type RetirementEvidence =
  | {
      readonly reason: 'not_accepted';
      readonly dispatcherFenced: true;
      readonly providerFinal: true;
    }
  | {
      readonly reason: 'finished';
      readonly upstreamTerminal: true;
      readonly generationReleased: true;
    };

/** Local write-ahead protocol for #309; provider proof/IO belongs to #310, generations to #311. */
export class PreparationRequestRepository {
  private readonly now: () => Date;
  private readonly id: () => string;

  constructor(
    private readonly db: AppDatabase,
    private readonly options: PreparationRequestOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? randomUUID;
  }

  /** Links an existing wish; called inside the wishlist transaction, never after its commit. */
  linkInterest(profileId: string, kind: DiscoverKind, tmdbId: number, createdAt: string) {
    this.db
      .insert(demands)
      .values({ id: this.id(), kind, tmdbId, createdAt })
      .onConflictDoNothing({ target: [demands.kind, demands.tmdbId] })
      .run();
    const demand = this.db
      .select()
      .from(demands)
      .where(and(eq(demands.kind, kind), eq(demands.tmdbId, tmdbId)))
      .get();
    if (!demand) throw new Error('preparation demand missing after insertion');
    const inserted = this.db
      .insert(interests)
      .values({ id: this.id(), demandId: demand.id, profileId, kind, tmdbId, createdAt })
      .onConflictDoNothing({ target: [interests.profileId, interests.kind, interests.tmdbId] })
      .returning()
      .get();
    return { demandId: demand.id, created: inserted !== undefined };
  }

  /** Creates a movie target or an explicit episode; a series wish alone creates no episode. */
  ensureTarget(
    demandId: string,
    episode?: { readonly season: number; readonly episode: number },
  ): string {
    return this.db.transaction(
      () => {
        const demand = this.db.select().from(demands).where(eq(demands.id, demandId)).get();
        if (!demand) throw new Error('unknown preparation demand');
        if (
          (demand.kind === 'movie' && episode !== undefined) ||
          (demand.kind === 'tv' && episode === undefined)
        )
          throw new Error('invalid preparation target namespace');
        const season = episode?.season ?? -1;
        const number = episode?.episode ?? -1;
        if (
          episode &&
          (!Number.isSafeInteger(season) ||
            season < 0 ||
            season > 2_147_483_647 ||
            !Number.isSafeInteger(number) ||
            number < 1 ||
            number > 2_147_483_647)
        )
          throw new Error('invalid preparation episode');
        const row = {
          id: this.id(),
          demandId,
          kind: demand.kind,
          tmdbId: demand.tmdbId,
          season,
          episode: number,
          createdAt: this.now().toISOString(),
        };
        this.db
          .insert(targets)
          .values(row)
          .onConflictDoNothing({ target: [targets.demandId, targets.season, targets.episode] })
          .run();
        const target = this.db
          .select({ id: targets.id })
          .from(targets)
          .where(
            and(
              eq(targets.demandId, demandId),
              eq(targets.season, season),
              eq(targets.episode, number),
            ),
          )
          .get();
        if (!target) throw new Error('preparation target missing after insertion');
        return target.id;
      },
      { behavior: 'immediate' },
    );
  }

  /** Records trusted local probe evidence; unknown/error evidence must use unresolved. */
  resolveLocal(
    targetId: string,
    resolution: 'unresolved' | 'needs_preparation' | 'already_playable',
    validUntil?: Date,
  ): boolean {
    const now = this.now().getTime();
    const until = validUntil?.getTime();
    if (
      resolution !== 'unresolved' &&
      resolution !== 'needs_preparation' &&
      resolution !== 'already_playable'
    )
      throw new Error('invalid preparation resolution');
    if (
      resolution !== 'unresolved' &&
      (!Number.isSafeInteger(now) ||
        until === undefined ||
        !Number.isSafeInteger(until) ||
        until <= now)
    )
      throw new Error('invalid preparation evidence lifetime');
    return (
      this.db
        .update(targets)
        .set({
          resolution,
          observedAtMs: resolution === 'unresolved' ? null : now,
          validUntilMs: resolution === 'unresolved' ? null : until,
        })
        .where(eq(targets.id, targetId))
        .run().changes === 1
    );
  }

  /** Atomically reserves one uncertain token before dispatch; unknown/stale evidence blocks. */
  claim(targetId: string, backend: string): string | null {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(backend))
      throw new Error('invalid preparation backend namespace');
    const token = this.db.transaction(
      () => {
        const target = this.db.select().from(targets).where(eq(targets.id, targetId)).get();
        const now = this.now();
        const time = now.getTime();
        if (
          !target ||
          target.resolution !== 'needs_preparation' ||
          target.observedAtMs === null ||
          target.validUntilMs === null ||
          time < target.observedAtMs ||
          time >= target.validUntilMs ||
          !Number.isSafeInteger(time)
        )
          return null;
        const interest = this.db
          .select({ id: interests.id })
          .from(interests)
          .innerJoin(profiles, eq(profiles.id, interests.profileId))
          .innerJoin(users, eq(users.id, profiles.userId))
          .where(eq(interests.demandId, target.demandId))
          .limit(1)
          .get();
        if (!interest) return null;
        const active = this.db
          .select({ id: attempts.id })
          .from(attempts)
          .where(and(eq(attempts.targetId, targetId), ne(attempts.state, 'retired')))
          .limit(1)
          .get();
        if (active) return null;
        const id = this.id();
        this.db
          .insert(attempts)
          .values({
            id,
            targetId,
            backend,
            state: 'uncertain',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          })
          .run();
        return id;
      },
      { behavior: 'immediate' },
    );
    if (token)
      this.options.logger?.info(
        { event: 'preparation.attempt.claimed', attemptId: token },
        'Preparation attempt reserved',
      );
    return token;
  }

  /** Reconciles acceptance against the original token; conflicting or retired tokens refuse. */
  accept(token: string, upstreamReference: string): boolean {
    if (
      upstreamReference.length < 1 ||
      upstreamReference.length > 256 ||
      [...upstreamReference].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    )
      throw new Error('invalid preparation upstream reference');
    const result = this.db.transaction(
      () => {
        const row = this.db.select().from(attempts).where(eq(attempts.id, token)).get();
        if (!row || row.state === 'retired') return false;
        if (row.state === 'accepted') return row.upstreamReference === upstreamReference;
        return (
          this.db
            .update(attempts)
            .set({ state: 'accepted', upstreamReference, updatedAt: this.now().toISOString() })
            .where(and(eq(attempts.id, token), eq(attempts.state, 'uncertain')))
            .run().changes === 1
        );
      },
      { behavior: 'immediate' },
    );
    this.logTransition(token, result, 'accepted');
    return result;
  }

  /** Requires trusted dispatcher/provider or generation proof; timeouts alone never retire. */
  retire(token: string, evidence: RetirementEvidence): boolean {
    const notAccepted =
      evidence.reason === 'not_accepted' &&
      evidence.dispatcherFenced === true &&
      evidence.providerFinal === true;
    const finished =
      evidence.reason === 'finished' &&
      evidence.upstreamTerminal === true &&
      evidence.generationReleased === true;
    if (!notAccepted && !finished) throw new Error('incomplete preparation retirement evidence');
    const changed = this.db.transaction(
      () => {
        const retired = this.db
          .update(attempts)
          .set({
            state: 'retired',
            retirementReason: evidence.reason,
            updatedAt: this.now().toISOString(),
          })
          .where(
            and(eq(attempts.id, token), eq(attempts.state, notAccepted ? 'uncertain' : 'accepted')),
          )
          .returning({ targetId: attempts.targetId })
          .get();
        if (!retired) return false;
        // Completion may have changed local availability since the original missing-file probe.
        this.db
          .update(targets)
          .set({ resolution: 'unresolved', observedAtMs: null, validUntilMs: null })
          .where(eq(targets.id, retired.targetId))
          .run();
        return true;
      },
      { behavior: 'immediate' },
    );
    this.logTransition(token, changed, 'retired');
    return changed;
  }

  private logTransition(token: string, accepted: boolean, transition: string): void {
    const fields = {
      event: 'preparation.attempt.transition',
      attemptId: token,
      transition,
      outcome: accepted ? 'applied' : 'refused',
    };
    if (accepted) this.options.logger?.info(fields, 'Preparation attempt reconciled');
    else this.options.logger?.warn(fields, 'Preparation attempt transition refused');
  }
}
