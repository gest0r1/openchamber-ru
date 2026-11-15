#!/usr/bin/env node
import fs from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareLegacySnapshot, readLegacyInputs, writePreparedSnapshot } from './migration.js';

const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  if (!['--runtime', '--watch', '--config', '--aliases', '--data-dir'].includes(process.argv[i]) ||
      flags.has(process.argv[i]) || i + 1 >= process.argv.length) {
    console.error('Usage: prepare-legacy.js --runtime ABS --watch ABS --config ABS [--aliases ABS] --data-dir ABS');
    process.exitCode = 2;
    break;
  }
  flags.set(process.argv[i], process.argv[i + 1]);
}
if (process.exitCode !== 2) {
  try {
    const dataDir = flags.get('--data-dir');
    if (!dataDir || !isAbsolute(dataDir)) throw new Error('Absolute private service data dir required');
    const packageRoot = fileURLToPath(new URL('../', import.meta.url));
    const destinationRoot = resolve(dataDir);
    if (destinationRoot === resolve(packageRoot) || destinationRoot.startsWith(resolve(packageRoot) + sep)) {
      throw new Error('MIGRATION_REJECTED: private data dir must be outside extension source');
    }
    const paths = Object.fromEntries(['runtime', 'watch', 'config', 'aliases'].map((key) =>
      [key, flags.get('--' + key)]));
    const inputs = await readLegacyInputs({ paths, fs });
    const snapshot = prepareLegacySnapshot(inputs);
    const destination = join(dataDir, 'legacy-prepared-v1.json');
    const result = await writePreparedSnapshot({ snapshot, destination, fs });
    // NEVER output the token, aliases, chat IDs, session IDs or paths.
    console.log(JSON.stringify({ prepared: true, created: result.created,
      subscriptions: Object.keys(snapshot.subscriptions).length,
      deliveries: Object.keys(snapshot.deliveries).length, pending: snapshot.pending.length,
      sender: 'legacy', extensionDeliveryEnabled: false }));
  } catch (error) {
    const reason = String(error?.message ?? '');
    console.error('Legacy preparation refused:', reason.startsWith('MIGRATION_REJECTED: ')
      ? reason.slice(0, 160) : 'source I/O failure (no changes applied)');
    process.exitCode = 1;
  }
}
