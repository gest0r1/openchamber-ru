import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTelegramRuntime } from './telegram-runtime.js';

test('Telegram subscriptions are opt-in, persist and fail closed on unknown activity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-'));
  const calls = [];
  let statuses = {};
  let descendants = false;
  const deps = {
    storePath: join(dir, 'telegram.json'),
    getBotToken: async () => '123:example-token',
    getPublicOrigin: async () => 'https://example.test',
    enabled: async () => true,
    activityProbe: {
      fetchActiveSessionStatuses: async () => statuses,
      hasWorkingDescendants: async () => descendants,
    },
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true, result: {} }) };
    },
  };
  try {
    const runtime = createTelegramRuntime(deps);
    await runtime.configureAlias('мне', '-100123', 42);
    assert.equal(await runtime.notify({ directory: '/repo', sessionId: 's1', type: 'completed' }), false);
    await runtime.subscribe('/repo', 's1', 'мне');
    statuses = null;
    assert.equal(await runtime.notify({ directory: '/repo', sessionId: 's1', type: 'completed' }), false);
    statuses = {};
    descendants = null;
    assert.equal(await runtime.notify({ directory: '/repo', sessionId: 's1', type: 'completed' }), false);
    descendants = false;
    assert.equal(await runtime.notify({ directory: '/repo', sessionId: 's1', type: 'completed' }), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].chat_id, '-100123');
    assert.equal(calls[0].message_thread_id, 42);
    assert.match(calls[0].text, /session=s1/);
    assert.equal(await runtime.notify({ directory: '/repo', sessionId: 's1', type: 'error' }), false);
    assert.equal(await runtime.notify({ directory: '/repo', sessionId: 's1', type: 'needs_input' }), true);
    assert.equal(await runtime.notify({ directory: '/repo', sessionId: 's1', type: 'completed' }), false);
    const restarted = createTelegramRuntime(deps);
    assert.equal(await restarted.hasSubscription('/repo', 's1'), true);
    assert.deepEqual(await restarted.listAliases(), ['мне']);
    await restarted.unsubscribe('/repo', 's1');
    assert.equal(await restarted.notify({ directory: '/repo', sessionId: 's1', type: 'completed' }), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Telegram document upload rejects traversal, symlinks outside roots and oversized files', async () => {
  const { writeFile, symlink } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-doc-'));
  const inside = join(dir, 'allowed');
  const outside = join(dir, 'outside.md');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(inside);
  await writeFile(outside, '# secret');
  await symlink(outside, join(inside, 'link.md'));
  const calls = [];
  const runtime = createTelegramRuntime({
    storePath: join(dir, 'telegram.json'),
    getBotToken: async () => '123:example-token',
    getPublicOrigin: async () => '',
    enabled: async () => true,
    allowedFileRoots: [inside],
    activityProbe: {},
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ ok: true, result: {} }) };
    },
  });
  try {
    await runtime.configureAlias('me', '12345');
    await assert.rejects(runtime.sendDocument('me', outside), /outside allowed roots/);
    await assert.rejects(runtime.sendDocument('me', join(inside, 'link.md')), /outside allowed roots/);
    const doc = join(inside, 'readme.md');
    await writeFile(doc, '# ready');
    assert.equal(await runtime.sendDocument('me', doc), true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /sendDocument$/);
    assert.equal(calls[0].options.body.get('chat_id'), '12345');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Telegram remains silent when disabled even with an existing subscription', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-disabled-'));
  let called = false;
  const runtime = createTelegramRuntime({
    storePath: join(dir, 'telegram.json'),
    getBotToken: async () => '123:example-token',
    getPublicOrigin: async () => '',
    enabled: async () => false,
    activityProbe: { fetchActiveSessionStatuses: async () => ({}), hasWorkingDescendants: async () => false },
    fetchImpl: async () => { called = true; throw new Error('unexpected request'); },
  });
  try {
    await runtime.configureAlias('me', '12345');
    await runtime.subscribe('/repo', 's1', 'me');
    assert.equal(await runtime.notify({ directory: '/repo', sessionId: 's1', type: 'completed' }), false);
    assert.equal(called, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
