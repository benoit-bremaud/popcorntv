#!/usr/bin/env node
// Log coverage (spec logging R7, agents-skills#383): every `catch` in the server code must
// log, rethrow, or say why not with a `// log: n/a — <reason>` comment. A swallowed error
// is invisible on the Pi, which is how #178 nearly went unnoticed.
/* global URL, console, process */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../apps/server/src/', import.meta.url).pathname;
const HANDLED = /\blog(?:ger)?\b|\bonError\(|\bthrow\b|\breject\(|\/\/ log: n\/a/;

function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) yield path;
  }
}

/** The text from `open` (a `{` or `(`) to its matching closer, strings ignored roughly. */
function block(text, open) {
  const pair = { '{': '}', '(': ')' };
  const closer = pair[text[open]];
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === text[open]) depth += 1;
    else if (text[i] === closer && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

const misses = [];
for (const file of sources(ROOT)) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{|\.catch\(/g)) {
    const open = match.index + match[0].length - 1;
    // The comment may sit on the line just above the `catch` too.
    const before = text.slice(
      text.lastIndexOf('\n', text.lastIndexOf('\n', match.index) - 1),
      match.index,
    );
    if (HANDLED.test(block(text, open)) || /\/\/ log: n\/a/.test(before)) continue;
    const line = text.slice(0, match.index).split('\n').length;
    misses.push(`${relative(process.cwd(), file)}:${line}`);
  }
}

if (misses.length > 0) {
  console.error('catch blocks that neither log, rethrow nor carry `// log: n/a — <reason>`:');
  for (const miss of misses) console.error(`  ${miss}`);
  process.exit(1);
}
console.log('log coverage: every catch logs, rethrows or is annotated');
