import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The direct sub-folders of `root`, sorted by name (spec library-management R2). Symbolic
 * links are left out (a `Dirent` from `readdir` is never followed) and so are hidden
 * names. An unreadable root gives an empty list: the typed path stays available.
 */
export async function listSubFolders(
  root: string,
): Promise<{ readonly name: string; readonly path: string }[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({ name: entry.name, path: join(root, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
