import type { MediaKind, ProviderIds } from '@popcorntv/shared';

/** The fields of a file-backed `media` row that say which title it holds, whatever its path. */
export interface MediaIdentity {
  readonly kind: MediaKind;
  readonly parsedTitle: string;
  readonly year: number | null;
  readonly season: number | null;
  readonly episode: number | null;
  readonly part: number | null;
  readonly seriesId: string | null;
  readonly tmdbId: number | null;
  readonly providerIds: ProviderIds;
}

/**
 * Keys under which two files hold the same title (spec progress-carry-over R2): an episode
 * by its series row and numbers, anything else by its TMDB id when known and by its parsed
 * title and year. Pure.
 */
export function identityKeys(row: MediaIdentity): string[] {
  if (row.kind === 'series') return [];
  if (row.kind === 'episode') {
    return row.seriesId === null || row.episode === null
      ? []
      : [`episode|${row.seriesId}|${row.season ?? ''}|${row.episode}`];
  }
  const part = row.part ?? '';
  const tmdb = row.tmdbId === null ? row.providerIds.tmdb : String(row.tmdbId);
  const keys = [
    `${row.kind}|${row.parsedTitle.normalize('NFC').toLowerCase()}|${row.year ?? ''}|${part}`,
  ];
  return tmdb === undefined ? keys : [...keys, `tmdb|${tmdb}|${part}`];
}

/**
 * For each removed row, the one present row holding the same title, if exactly one does
 * (an ambiguous match carries nothing, R3). Pure.
 */
export function carryOverTargets(
  removed: readonly (MediaIdentity & { readonly id: string })[],
  present: readonly (MediaIdentity & { readonly id: string })[],
): Map<string, string> {
  const byKey = new Map<string, Set<string>>();
  for (const row of present) {
    for (const key of identityKeys(row)) byKey.set(key, (byKey.get(key) ?? new Set()).add(row.id));
  }
  const targets = new Map<string, string>();
  for (const row of removed) {
    const candidates = new Set(identityKeys(row).flatMap((key) => [...(byKey.get(key) ?? [])]));
    const [only] = candidates;
    if (candidates.size === 1 && only !== undefined) targets.set(row.id, only);
  }
  return targets;
}
