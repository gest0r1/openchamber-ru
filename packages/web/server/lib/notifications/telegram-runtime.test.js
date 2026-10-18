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
    enterpriseAllowed: () => true,
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
    const restarted = createTelegramRuntime(deps);
    assert.equal(await restarted.notify({ directory: '/repo', sessionId: 's1', type: 'completed' }), true);
    await restarted.unsubscribe('/repo', 's1');
    assert.equal(await restarted.notify({ directory: '/repo', sessionId: 's1', type: 'completed' }), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
