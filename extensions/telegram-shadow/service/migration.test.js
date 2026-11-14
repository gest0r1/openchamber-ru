import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareLegacySnapshot, readLegacyInputs, writePreparedSnapshot } from './migration.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const digest = { runtime: 'a'.repeat(64), watch: 'b'.repeat(64), config: 'c'.repeat(64) };
const session = ['/project', 'ses_one'];
const subKey = sha(JSON.stringify(session));
const deliveryKey = JSON.stringify([...session, 'completed', 'idle:some-id']);
const sample = () => ({
  runtime: {
    version: 1, aliases: {}, subscriptions: {
      [subKey]: { opted_in: true, alias: 'Team Ops', scope: 'run', created_at: 1770000000000,
        expires_at: null, origin: 'user', sessionId: session[1], directory: session[0], spaceId: null },
    }, deliveries: {
      [deliveryKey]: { status: 'delivery_unknown', at: 1770000000001, directory: session[0],
        sessionId: session[1], type: 'completed', eventKey: 'idle:some-id' },
    },
  },
  watch: { version: 1, pending: [{ directory: session[0], sessionId: session[1],
    spaceId: null, attempt: 1, createdAt: 1770000000002, armed: true, baselineIdleId: 'idle:old' }] },
  config: { version: 1, enabled: true, botToken: '111:dummy_secret', defaultAlias: 'Team Ops' },
  configuredAliases: [{ name: 'Team Ops', chat_id: '-100203040', message_thread_id: 101, kind: 'topic' }],
  sourceSha256: { ...digest },
});

async function tempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-migration-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('preserves scope, topic, original session identity, checkpoint, ambiguous delivery and private token', () => {
  const migrated = prepareLegacySnapshot({ ...sample(), now: 1770000010000 });
  assert.deepEqual({ owner: migrated.owner, enabled: migrated.deliveryEnabled, cutover: migrated.cutoverAllowed },
    { owner: 'legacy', enabled: false, cutover: false });
  assert.equal(migrated.settings.botToken, '111:dummy_secret');
  assert.equal(migrated.aliases['team ops'].chatId, '-100203040');
  assert.equal(migrated.aliases['team ops'].threadId, 101);
  assert.equal(migrated.subscriptions[subKey].scope, 'run');
  assert.equal(migrated.deliveries[deliveryKey].status, 'delivery_unknown');
  assert.equal(migrated.pending[0].baselineIdleId, 'idle:old');
  assert.deepEqual(migrated.sourceSha256, digest);
});

test('denies missing configured alias, incorrect keys, incorrect statuses, duplicate checkpoints, unsupported format', () => {
  const scenarios = [
    (a) => { delete a.configuredAliases; },
    (a) => { a.runtime.subscriptions.bad = a.runtime.subscriptions[subKey]; delete a.runtime.subscriptions[subKey]; },
    (a) => { a.runtime.deliveries[deliveryKey].status = 'retry_pending'; },
    (a) => { a.runtime.deliveries.other = a.runtime.deliveries[deliveryKey]; },
    (a) => { a.watch.pending.push({ ...a.watch.pending[0] }); },
    (a) => { a.config.version = 2; },
    (a) => { a.sourceSha256.runtime = 'bad'; },
  ];
  for (const mutate of scenarios) {
    const s = sample(); mutate(s);
    assert.throws(() => prepareLegacySnapshot(s), /MIGRATION_REJECTED/);
  }
});

test('writing is exclusive, mode 0600, idempotent by source/content, never changes existing migration', async (t) => {
  const dir = await tempDir(t);
  const destination = path.join(dir, 'subdir', 'legacy-prepared-v1.json');
  const a = prepareLegacySnapshot({ ...sample(), now: 1770000010000 });
  assert.deepEqual(await writePreparedSnapshot({ snapshot: a, destination, fs }), { created: true });
  assert.equal((await fs.stat(destination)).mode & 0o777, 0o600);
  const original = await fs.readFile(destination, 'utf8');
  const b = prepareLegacySnapshot({ ...sample(), now: 1770000020000 });
  assert.deepEqual(await writePreparedSnapshot({ snapshot: b, destination, fs }), { created: false });
  const changed = sample(); changed.config.botToken = '222:different';
  await assert.rejects(writePreparedSnapshot({ snapshot: prepareLegacySnapshot(changed), destination, fs }), /snapshot already exists/);
  assert.equal(await fs.readFile(destination, 'utf8'), original);
  await assert.rejects(writePreparedSnapshot({ snapshot: { ...a, deliveryEnabled: true }, destination: path.join(dir, 'unsafe'), fs }), /unsafe/);
});

test('source-file loader uses explicit files, validates JSON, retains hashes and rejects mutation between reads', async (t) => {
  const dir = await tempDir(t);
  const s = sample();
  const paths = {};
  for (const [kind, value] of Object.entries({ runtime: s.runtime, watch: s.watch, config: s.config, aliases: s.configuredAliases })) {
    paths[kind] = path.join(dir, kind + '.json');
    await fs.writeFile(paths[kind], JSON.stringify(value), { mode: 0o600 });
  }
  const read = await readLegacyInputs({ paths, fs });
  assert.equal(read.sourceSha256.runtime, sha(JSON.stringify(s.runtime)));
  assert.equal(read.configuredAliases[0].name, 'Team Ops');
  const changedReads = { ...fs, readFile: async (name, opts) => {
    if (name === paths.config) return '{"version":1,"enabled":false}' + String(Math.random());
    return fs.readFile(name, opts);
  } };
  await assert.rejects(readLegacyInputs({ paths, fs: changedReads }), /invalid JSON/);
});

test('CLI performs offline prepare with secret-free stdout, leaves all legacy inputs byte-identical', async (t) => {
  const dir = await tempDir(t);
  const legacy = path.join(dir, 'legacy');
  const privateDir = path.join(dir, 'private');
  await fs.mkdir(legacy);
  const s = sample();
  const paths = {};
  for (const [kind, value] of Object.entries({ runtime: s.runtime, watch: s.watch, config: s.config, aliases: s.configuredAliases })) {
    paths[kind] = path.join(legacy, kind + '.json');
    await fs.writeFile(paths[kind], JSON.stringify(value), { mode: 0o600 });
  }
  const run = () => spawnSync(process.execPath, [new URL('./prepare-legacy.js', import.meta.url).pathname,
    '--runtime', paths.runtime, '--watch', paths.watch, '--config', paths.config,
    '--aliases', paths.aliases, '--data-dir', privateDir], { encoding: 'utf8' });
  const first = run(); assert.equal(first.status, 0, first.stderr);
  const second = run(); assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(first.stdout).created, true);
  assert.equal(JSON.parse(second.stdout).created, false);
  assert.equal(first.stdout.includes('dummy_secret'), false);
  assert.equal(second.stderr.includes('dummy_secret'), false);
  for (const [key, value] of Object.entries({ runtime: s.runtime, watch: s.watch, config: s.config, aliases: s.configuredAliases })) {
    assert.equal(await fs.readFile(paths[key], 'utf8'), JSON.stringify(value));
  }
});
