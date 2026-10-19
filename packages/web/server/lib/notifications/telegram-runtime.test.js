import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
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
    assert.equal(await runtime.notify({ directory: '/repo', sessionId: 's1', type: 'unsupported' }), false);
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

test('Configured aliases support default recipient, opt-in scope, expiry and formatted Markdown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-scopes-'));
  let aliases = [];
  const sent = [];
  const deps = {
    storePath: join(dir, 'telegram.json'),
    getBotToken: async () => '123:example-token',
    getPublicOrigin: async () => 'https://example.test',
    getConfiguredAliases: async () => aliases,
    persistAliases: async (next) => { aliases = next; },
    getDefaultAlias: async () => 'мне',
    enabled: async () => true,
    activityProbe: {
      fetchActiveSessionStatuses: async () => ({}),
      hasWorkingDescendants: async () => false,
    },
    fetchImpl: async (_url, options) => {
      sent.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ ok: true, result: {} }) };
    },
  };
  try {
    const runtime = createTelegramRuntime(deps);
    await runtime.configureAlias('МНЕ', '-100123', 19, 'topic');
    assert.deepEqual(await runtime.listAliases(), ['мне']);
    assert.equal((await runtime.listAliasDetails())[0].chat_id_masked.includes('-100123'), false);
    await runtime.subscribe('/project', 'once', undefined, { scope: 'once' });
    assert.equal(await runtime.notify({ directory: '/project', sessionId: 'once', type: 'needs_input' }), true);
    assert.equal(await runtime.hasSubscription('/project', 'once'), false);
    assert.equal(await runtime.notify({ directory: '/project', sessionId: 'once', type: 'completed' }), false);
    await runtime.subscribe('/project', 'run', undefined, { scope: 'run' });
    assert.equal(await runtime.notify({ directory: '/project', sessionId: 'run', type: 'needs_input' }), true);
    assert.equal(await runtime.hasSubscription('/project', 'run'), true);
    assert.equal(await runtime.notify({ directory: '/project', sessionId: 'run', type: 'completed' }), true);
    assert.equal(await runtime.hasSubscription('/project', 'run'), false);
    await runtime.sendContent({ text: '**bold** & ready', alias: 'мне', mode: 'formatted' });
    assert.equal(sent.at(-1).parse_mode, 'HTML');
    assert.equal(sent.at(-1).text, '<b>bold</b> &amp; ready');
    assert.equal(sent.at(-1).message_thread_id, 19);
    await assert.rejects(runtime.subscribe('/project', 'bad', 'unknown'), /Unknown Telegram alias/);
    await assert.rejects(runtime.subscribe('/project', 'bad', undefined, { expiresAt: Date.now() - 1 }), /expiry/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('A missing default alias is a configuration error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-missing-default-'));
  try {
    const runtime = createTelegramRuntime({
      storePath: join(dir, 'telegram.json'),
      getBotToken: async () => '123:example-token',
      getPublicOrigin: async () => '',
      getDefaultAlias: async () => '',
      activityProbe: {},
    });
    await assert.rejects(runtime.subscribe('/project', 'session'), /default alias/);
    await assert.rejects(runtime.sendContent({ text: 'hello' }), /default alias/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Formatted messages respect Telegram 4096-character HTML limit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-chunk-'));
  const requests = [];
  try {
    const runtime = createTelegramRuntime({
      storePath: join(dir, 'telegram.json'),
      getBotToken: async () => '123:example-token',
      getPublicOrigin: async () => '',
      activityProbe: {},
      fetchImpl: async (_url, options) => {
        requests.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ ok: true, result: {} }) };
      },
    });
    await runtime.configureAlias('me', '12345');
    await runtime.sendContent({ alias: 'me', mode: 'formatted', text: '&'.repeat(4400) });
    assert.ok(requests.length > 1);
    assert.ok(requests.every((request) => request.text.length <= 4096 && request.parse_mode === 'HTML'));
    assert.equal(requests.map((request) => request.text.replaceAll('&amp;', '&')).join(''), '&'.repeat(4400));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('An alias rename retains existing opt-in subscriptions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-rename-'));
  try {
    const runtime = createTelegramRuntime({
      storePath: join(dir, 'telegram.json'),
      getBotToken: async () => '123:example-token',
      getPublicOrigin: async () => '',
      activityProbe: {},
    });
    await runtime.configureAlias('old', '12345');
    await runtime.subscribe('/project', 'session', 'old');
    await runtime.configureAlias('new', null, null, 'private', 'old');
    assert.deepEqual(await runtime.listAliases(), ['new']);
    assert.equal(await runtime.hasSubscription('/project', 'session'), true);
    await runtime.deleteAlias('new');
    assert.equal(await runtime.hasSubscription('/project', 'session'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('A configured token is never exposed through alias inspection', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-secret-'));
  try {
    const runtime = createTelegramRuntime({
      storePath: join(dir, 'telegram.json'),
      getBotToken: async () => '123:ultra-secret-token',
      getPublicOrigin: async () => '',
      activityProbe: {},
    });
    await runtime.configureAlias('private', '123456789');
    const serialized = JSON.stringify({
      aliases: await runtime.listAliasDetails(),
      hasBotToken: await runtime.hasBotToken(),
    });
    assert.doesNotMatch(serialized, /ultra-secret-token|123456789/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('An unsubscribe during live activity probing prevents a stale Telegram alert', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-race-'));
  let releaseProbe;
  let probeStarted;
  const started = new Promise((resolve) => { probeStarted = resolve; });
  const gate = new Promise((resolve) => { releaseProbe = resolve; });
  let sends = 0;
  try {
    const runtime = createTelegramRuntime({
      storePath: join(dir, 'telegram.json'),
      getBotToken: async () => '123:test-token',
      getPublicOrigin: async () => '',
      activityProbe: {
        fetchActiveSessionStatuses: async () => {
          probeStarted();
          await gate;
          return {};
        },
        hasWorkingDescendants: async () => false,
      },
      fetchImpl: async () => {
        sends += 1;
        return { ok: true, json: async () => ({ ok: true, result: {} }) };
      },
    });
    await runtime.configureAlias('me', '123456');
    await runtime.subscribe('/repo', 's1', 'me');
    const pending = runtime.notify({ directory: '/repo', sessionId: 's1', type: 'completed' });
    await started;
    await runtime.unsubscribe('/repo', 's1');
    releaseProbe();
    assert.equal(await pending, false);
    assert.equal(sends, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Disabling Telegram during an activity probe prevents a queued notification', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-disable-race-'));
  let releaseProbe;
  let probeStarted;
  const started = new Promise((resolve) => { probeStarted = resolve; });
  const gate = new Promise((resolve) => { releaseProbe = resolve; });
  let enabled = true;
  let sends = 0;
  try {
    const runtime = createTelegramRuntime({
      storePath: join(dir, 'telegram.json'),
      getBotToken: async () => '123:test-token',
      getPublicOrigin: async () => '',
      enabled: async () => enabled,
      activityProbe: {
        fetchActiveSessionStatuses: async () => {
          probeStarted();
          await gate;
          return {};
        },
        hasWorkingDescendants: async () => false,
      },
      fetchImpl: async () => {
        sends += 1;
        return { ok: true, json: async () => ({ ok: true, result: {} }) };
      },
    });
    await runtime.configureAlias('me', '123456');
    await runtime.subscribe('/repo', 's1', 'me');
    const pending = runtime.notify({ directory: '/repo', sessionId: 's1', type: 'completed' });
    await started;
    enabled = false;
    releaseProbe();
    assert.equal(await pending, false);
    assert.equal(sends, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Expired session opt-ins are pruned from persistent storage on access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-ttl-'));
  const path = join(dir, 'telegram.json');
  const runtime = createTelegramRuntime({
    storePath: path,
    getBotToken: async () => '123:test-token',
    getPublicOrigin: async () => '',
    activityProbe: {},
  });
  try {
    await runtime.configureAlias('me', '123456');
    await runtime.subscribe('/repo', 'session', 'me', { expiresAt: Date.now() + 40 });
    assert.equal(await runtime.hasSubscription('/repo', 'session'), true);
    await new Promise((resolve) => setTimeout(resolve, 70));
    assert.equal(await runtime.hasSubscription('/repo', 'session'), false);
    const stored = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(stored.subscriptions, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Different user decisions in one session are not collapsed by the dedup window', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-decisions-'));
  const messages = [];
  try {
    const runtime = createTelegramRuntime({
      storePath: join(dir, 'telegram.json'),
      getBotToken: async () => '123:test-token',
      getPublicOrigin: async () => '',
      enabled: async () => true,
      activityProbe: {},
      fetchImpl: async (_url, options) => {
        messages.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ ok: true, result: {} }) };
      },
    });
    await runtime.configureAlias('me', '12345');
    await runtime.subscribe('/repo', 'session', 'me');
    assert.equal(await runtime.notify({
      directory: '/repo', sessionId: 'session', type: 'needs_input', eventKey: 'form-a',
    }), true);
    assert.equal(await runtime.notify({
      directory: '/repo', sessionId: 'session', type: 'needs_input', eventKey: 'form-a',
    }), false);
    assert.equal(await runtime.notify({
      directory: '/repo', sessionId: 'session', type: 'needs_input', eventKey: 'permission-b',
    }), true);
    assert.equal(messages.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Short Telegram peer IDs are never sent to UI unmasked', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openchamber-telegram-mask-'));
  try {
    const runtime = createTelegramRuntime({
      storePath: join(dir, 'telegram.json'),
      getBotToken: async () => '123:test-token',
      getPublicOrigin: async () => '',
      activityProbe: {},
    });
    await runtime.configureAlias('small', '1234');
    assert.equal((await runtime.listAliasDetails())[0].chat_id_masked, '****');
    await runtime.configureAlias('long', '-1002345678');
    assert.ok((await runtime.listAliasDetails()).every((item) => !item.chat_id_masked.includes('-1002345678')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
