import { hash, verify } from '@node-rs/argon2';

/** Password hashing boundary (spec auth R4); the only module importing argon2. */
export interface Hasher {
  hash(password: string): Promise<string>;
  /** Checks against `stored`, or against a dummy hash when null so unknown users cost the same. */
  verify(stored: string | null, password: string): Promise<boolean>;
}

/** Thrown when no hashing slot frees up in time; the routes answer `429 too_many_attempts`. */
export class HasherBusyError extends Error {
  constructor() {
    super('password hasher busy');
    this.name = 'HasherBusyError';
  }
}

/** argon2id, 19 MiB, 2 passes, 1 lane (OWASP baseline). `2` is `Algorithm.Argon2id`, a const enum. */
const OPTIONS = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export interface HasherOptions {
  /** Hashes allowed at once (spec auth R4: 4). */
  readonly maxConcurrent?: number;
  /** How long a request waits for a slot before `HasherBusyError` (spec auth R4: 2 s). */
  readonly waitMs?: number;
}

/**
 * argon2id with a concurrency cap: each hash holds ~19 MiB and a libuv thread, so a burst
 * of sign-ins cannot exhaust memory or starve the file streams.
 */
export class Argon2Hasher implements Hasher {
  private running = 0;
  private readonly waiting: Array<() => void> = [];
  private readonly maxConcurrent: number;
  private readonly waitMs: number;
  private dummy: Promise<string> | null = null;

  constructor(options: HasherOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 4;
    this.waitMs = options.waitMs ?? 2_000;
  }

  async hash(password: string): Promise<string> {
    return this.withSlot(() => hash(password, OPTIONS));
  }

  async verify(stored: string | null, password: string): Promise<boolean> {
    // The dummy is computed once, outside a slot: it is a fixed value, not request work.
    this.dummy ??= hash('popcorntv-dummy-password', OPTIONS);
    const target = stored ?? (await this.dummy);
    const ok = await this.withSlot(() => verify(target, password));
    return stored !== null && ok;
  }

  private async withSlot<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await work();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running += 1;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.waiting.splice(this.waiting.indexOf(grant), 1);
        reject(new HasherBusyError());
      }, this.waitMs);
      this.waiting.push(grant);
    });
  }

  /** Hands the slot straight to the next waiter, so `running` never dips and lets a newcomer cut in. */
  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.running -= 1;
  }
}
