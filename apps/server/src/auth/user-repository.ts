import { randomUUID } from 'node:crypto';
import { and, asc, count, eq, ne } from 'drizzle-orm';
import type { Account, Role, User } from '@popcorntv/shared';
import type { AppDatabase } from '../db/index.js';
import { users } from '../db/schema.js';

/** A user with the stored hash, for sign-in and password change only. */
export interface StoredUser extends User {
  readonly passwordHash: string;
}

const publicColumns = { id: users.id, username: users.username, role: users.role };

/** Case-insensitive identity of a username (spec auth §4.1). */
export function usernameKey(username: string): string {
  return username.toLowerCase();
}

/** Reads and writes `users` (spec auth §4.1). */
export class UserRepository {
  constructor(private readonly db: AppDatabase) {}

  /** True while the first-owner setup is still pending (UC11). */
  isEmpty(): boolean {
    return (this.db.select({ n: count() }).from(users).get()?.n ?? 0) === 0;
  }

  find(id: string): User | undefined {
    return this.db.select(publicColumns).from(users).where(eq(users.id, id)).get();
  }

  exists(id: string): boolean {
    return this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).get() !== undefined;
  }

  findStored(id: string): StoredUser | undefined {
    return this.db
      .select({ ...publicColumns, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, id))
      .get();
  }

  findByUsername(username: string): StoredUser | undefined {
    return this.db
      .select({ ...publicColumns, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.usernameKey, usernameKey(username)))
      .get();
  }

  /** Adds an account; the caller has checked the username is free (inside its transaction). */
  create(username: string, passwordHash: string, role: Role, now: Date): User {
    const user: User = { id: randomUUID(), username, role };
    this.db
      .insert(users)
      .values({
        ...user,
        usernameKey: usernameKey(username),
        passwordHash,
        createdAt: now.toISOString(),
        lastLoginAt: now.toISOString(),
      })
      .run();
    return user;
  }

  setPassword(id: string, passwordHash: string): void {
    this.db.update(users).set({ passwordHash }).where(eq(users.id, id)).run();
  }

  /** `last_login_at` outlives the 90-day event purge (spec auth UC17). */
  touchLogin(id: string, now: Date): void {
    this.db.update(users).set({ lastLoginAt: now.toISOString() }).where(eq(users.id, id)).run();
  }

  /** Every account with its live session count from `liveCounts` (UC17), by username. */
  list(liveCounts: ReadonlyMap<string, number>): Account[] {
    return this.db
      .select({ ...publicColumns, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
      .from(users)
      .orderBy(asc(users.usernameKey))
      .all()
      .map((row) => ({ ...row, activeSessions: liveCounts.get(row.id) ?? 0 }));
  }

  /**
   * Sets the role; `last_owner` when it would demote the only owner (spec auth R2). Call it
   * inside a transaction so the owner count cannot change in between.
   */
  setRole(id: string, role: Role): 'ok' | 'not_found' | 'last_owner' {
    const user = this.find(id);
    if (!user) return 'not_found';
    if (user.role === 'owner' && role !== 'owner' && !this.hasOtherOwner(id)) return 'last_owner';
    this.db.update(users).set({ role }).where(eq(users.id, id)).run();
    return 'ok';
  }

  /** Deletes the account (cascade); `last_owner` for the only owner (UC17). In a transaction. */
  delete(id: string): 'ok' | 'not_found' | 'last_owner' {
    const user = this.find(id);
    if (!user) return 'not_found';
    if (user.role === 'owner' && !this.hasOtherOwner(id)) return 'last_owner';
    this.db.delete(users).where(eq(users.id, id)).run();
    return 'ok';
  }

  private hasOtherOwner(id: string): boolean {
    const others = this.db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, 'owner'), ne(users.id, id)))
      .get();
    return (others?.n ?? 0) > 0;
  }
}
