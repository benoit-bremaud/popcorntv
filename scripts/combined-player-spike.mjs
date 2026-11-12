#!/usr/bin/env node
/* global console, process */
/** Explicit local-only composition: the real backend owns its source until the real player closes. */
import { pathToFileURL } from 'node:url';
import { runBackendSpike } from './qbittorrent-spike.mjs';
import { runPlayerSpike } from './player-spike.mjs';

/** Run the real internal-peer download and player with immutable early-caption preparation. */
export function runCombinedSpike({ cancelAfterFirstFrame = false } = {}) {
  return runBackendSpike({
    consume: (source) => runPlayerSpike({ source, cancelAfterFirstFrame }),
  });
}

/** Keep the combined experiment opt-in and emit only safe failure codes on CLI errors. */
export async function runCombinedCli(argv, execute = runCombinedSpike) {
  if (argv.length !== 1 || argv[0] !== '--run') {
    console.error('Usage: node scripts/combined-player-spike.mjs --run');
    return 2;
  }
  try {
    console.log(JSON.stringify(await execute(), null, 2));
    return 0;
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'combined.experiment_failed', code: error.code ?? error.name }),
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCombinedCli(process.argv.slice(2));
}
