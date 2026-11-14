import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createShadowJournal, parseShadowEvent } from './state.js';

const eventOf = (id, parentId = null) => ({
  v: 1, requestId: 'req-' + id, event: {
    id, type: 'turn-finished', at: 1730000000000,
    session: { id: 'ses_1', parentId },
    project: { directory: '/project' }, linked: [],
  },
});
const fixture = async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-telegram-shadow-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'shadow-events-v1.json');
};

test('accepts SDK 2.7.1 metadata and strips transcript fields', () => {
  const wire = eventOf('evt_1');
  wire.content = { type: 'turn-finished', reply: 'secret transcript' };
  assert.deepEqual(parseShadowEvent(wire), {
    id: 'evt_1', type: 'turn-finished', at: 1730000000000,
    sessionId: 'ses_1', parentId: null, directory: '/project',
  });
});

test('refuses unsupported protocol, missing identity and unscoped session', () => {
  for (const invalid of [
    { ...eventOf('evt_1'), v: 2 },
    { ...eventOf('evt_1'), event: { ...eventOf('evt_1').event, id: '' } },
    { ...eventOf('evt_1'), event: { ...eventOf('evt_1').event, session: { id: 'ses_1' } } },
    { ...eventOf('evt_1'), event: { ...eventOf('evt_1').event, project: { directory: undefined } } },
    { ...eventOf('evt_1'), event: { ...eventOf('evt_1').event, type: 'unknown' } },
  ]) assert.equal(parseShadowEvent(invalid), null);
});

test('journals root and subagent separately, deduplicates and recovers after restart', async (t) => {
  const filePath = await fixture(t);
  const journal = createShadowJournal({ filePath, fs, now: () => 1730000000100 });
  const a = parseShadowEvent(eventOf('evt_1'));
  const b = parseShadowEvent(eventOf('evt_2', 'ses_parent'));
  assert.deepEqual(await journal.record(a), { recorded: true, duplicate: false });
  assert.deepEqual(await journal.record(a), { recorded: false, duplicate: true });
  assert.deepEqual(await journal.record(b), { recorded: true, duplicate: false });
  assert.deepEqual(await journal.status(), { version: 1, observed: 2, rootEvents: 1, deliveryEnabled: false });
  const disk = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.equal(disk.events[0].root, true);
  assert.equal(disk.events[1].root, false);
  assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
  const restarted = createShadowJournal({ filePath, fs });
  assert.deepEqual(await restarted.record(a), { recorded: false, duplicate: true });
  assert.deepEqual(await restarted.status(), { version: 1, observed: 2, rootEvents: 1, deliveryEnabled: false });
});

test('serializes concurrent append and never writes agent content or token', async (t) => {
  const filePath = await fixture(t);
  const journal = createShadowJournal({ filePath, fs });
  await Promise.all([journal.record(parseShadowEvent(eventOf('evt_a'))),
    journal.record(parseShadowEvent(eventOf('evt_b')))]);
  const text = await fs.readFile(filePath, 'utf8');
  assert.equal(JSON.parse(text).events.length, 2);
  assert.equal(text.includes('botToken'), false);
  assert.equal(text.includes('reply'), false);
});

test('corrupt journal fails closed without deleting legacy or shadow data', async (t) => {
  const filePath = await fixture(t);
  await fs.writeFile(filePath, '{broken', { mode: 0o600 });
  const journal = createShadowJournal({ filePath, fs });
  await assert.rejects(journal.record(parseShadowEvent(eventOf('evt_1'))));
  assert.equal(await fs.readFile(filePath, 'utf8'), '{broken');
});
