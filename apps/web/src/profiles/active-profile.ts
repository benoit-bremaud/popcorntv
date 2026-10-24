/** Where the web remembers the active profile (ADR-0008 §3). */
const KEY = 'popcorntv.activeProfileId';

/**
 * The remembered profile id, or null. Storage can be missing or throw (private window,
 * blocked site data): the picker then simply shows every time (spec profiles 1b).
 */
export function rememberedProfileId(
  storage: Storage | undefined = globalThis.localStorage,
): string | null {
  try {
    return storage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

/** Remembers the picked profile; a failing storage is ignored. */
export function rememberProfileId(
  id: string,
  storage: Storage | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(KEY, id);
  } catch {
    // Not remembered: the picker shows again next time.
  }
}
