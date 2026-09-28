#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const refIndex = args.indexOf('--ref');
const ref = refIndex >= 0 ? args[refIndex + 1] : 'HEAD';
if (refIndex >= 0 && !ref) throw new Error('--ref requires a git ref');

const exact = new Set([
  '.github/workflows/integration-linux-bundle.yml',
  'package.json',
  'bun.lock',
  'tsconfig.json',
  'vite.config.ts',
  'scripts/build-builtin-extensions.mjs',
  'scripts/install-linux-integration-bundle.sh',
  'scripts/linux-bundle-fingerprint.mjs',
]);

function testOnly(path) {
  return /(?:^|\/)(?:__tests__|tests?|e2e)(?:\/|$)/.test(path) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function runtimeInput(path) {
  if (exact.has(path)) return true;
  if (path.startsWith('bun-patches/')) return true;
  if (/^packages\/[^/]+\/package\.json$/.test(path)) return true;
  if (/^packages\/sdk\/examples\/[^/]+\/package\.json$/.test(path)) return true;
  if (path.startsWith('packages/web/') ||
      path.startsWith('packages/ui/') ||
      path.startsWith('packages/sdk/') ||
      path.startsWith('packages/extensions/')) {
    return !testOnly(path);
  }
  return false;
}

const raw = execFileSync('git', ['ls-tree', '-r', '-z', ref], { encoding: 'utf8' });
const entries = raw.split('\0').filter(Boolean).map((record) => {
  const match = record.match(/^(\d+)\s+(\w+)\s+([0-9a-f]+)\t(.+)$/);
  if (!match) throw new Error(`Unexpected git ls-tree record: ${record}`);
  return { mode: match[1], type: match[2], sha: match[3], path: match[4] };
}).filter((entry) => entry.type === 'blob' && runtimeInput(entry.path))
  .sort((a, b) => a.path.localeCompare(b.path));

if (!entries.length) throw new Error('No Linux bundle runtime inputs found');

const hash = createHash('sha256');
hash.update('openchamber-linux-bundle-fingerprint-v1\0');
for (const entry of entries) {
  hash.update(entry.mode);
  hash.update('\0');
  hash.update(entry.path);
  hash.update('\0');
  hash.update(entry.sha);
  hash.update('\0');
}
const fingerprint = hash.digest('hex');

if (args.includes('--json')) {
  process.stdout.write(JSON.stringify({
    schema_version: 1,
    ref,
    fingerprint,
    files: entries.map((entry) => entry.path),
  }, null, 2) + '\n');
} else {
  process.stdout.write(fingerprint + '\n');
}
