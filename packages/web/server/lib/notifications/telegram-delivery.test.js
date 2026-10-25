import { test, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createTelegramRuntime } from './telegram-runtime.js';

const setup = async (fetchImpl) => {
  const root = await mkdtemp(join(tmpdir(), 'telegram-delivery-'));
  const config = {
    storePath: join(root, 'subscriptions.json'),
    getBotToken: async () => '12345:token',
    getDefaultAlias: async () => 'team',
    getPublicOrigin: async () => 'https://openchamber.example',
    enabled: async () => true,
    fetchImpl,
  };
  return { root, runtime: createTelegramRuntime(config), cleanup: () => rm(root, { recursive: true, force: true }) };
};

test('one verified idle record is delivered once into a Telegram topic', async () => {
  const posted = [];
  const h = await setup(async (_url, options) => {
    posted.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ ok: true, result: { message_id: posted.length } }));
  });
  try {
    await h.runtime.configureAlias('team', '-123456789', 13, 'topic');
    await h.runtime.subscribe('/repo', 'session', 'team');
    const message = { directory: '/repo', sessionId: 'session', type: 'completed', eventKey: 'idle:one' };
    expect(await h.runtime.notify(message)).toBe(true);
    expect(await h.runtime.notify(message)).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0].message_thread_id).toBe(13);
    expect(posted[0].chat_id).toBe('-123456789');
  } finally { await h.cleanup(); }
});

test('a Telegram timeout never retries an ambiguous notification', async () => {
  let attempts = 0;
  const h = await setup(async () => {
    attempts += 1;
    throw new TypeError('network failed after possible submission');
  });
  try {
    await h.runtime.configureAlias('team', '123456');
    await h.runtime.subscribe('/repo', 'session', 'team');
    const item = { directory: '/repo', sessionId: 'session', type: 'completed', eventKey: 'idle:one' };
    await expect(h.runtime.notify(item)).rejects.toThrow();
    // Reserved on disk before delivery. At-most-once takes priority.
    expect(await h.runtime.notify(item)).toBe(true);
    expect(attempts).toBe(1);
  } finally { await h.cleanup(); }
});

test('an explicit Markdown file stays under the calling session directory', async () => {
  const posted = [];
  const h = await setup(async (_url, options) => {
    posted.push(options.body);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  });
  try {
    await h.runtime.configureAlias('team', '123456');
    await writeFile(join(h.root, 'report.md'), '# Report');
    expect((await h.runtime.sendContent({
      file: 'report.md', directory: h.root, mode: 'document',
    })).delivered).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toBeInstanceOf(FormData);
    await expect(h.runtime.sendContent({
      file: '/etc/passwd', directory: h.root, mode: 'document',
    })).rejects.toThrow();
  } finally { await h.cleanup(); }
});


test('Bot API 5xx does not retry the same automatic message', async () => {
  let attempts = 0;
  const h = await setup(async () => {
    attempts += 1;
    return new Response(JSON.stringify({ ok: false, description: 'failure' }), { status: 500 });
  });
  try {
    await h.runtime.configureAlias('team', '123456');
    await h.runtime.subscribe('/repo', 'session', 'team');
    const item = { directory: '/repo', sessionId: 'session', type: 'completed', eventKey: 'idle:first' };
    await expect(h.runtime.notify(item)).rejects.toThrow();
    expect(await h.runtime.notify(item)).toBe(true);
    expect(attempts).toBe(1);
  } finally { await h.cleanup(); }
});

test('session subscriptions remain enabled until explicitly removed', async () => {
  const h = await setup(async () =>
    new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }))
  );
  try {
    await h.runtime.configureAlias('team', '123456');
    await h.runtime.subscribe('/repo', 'session', 'team');
    const subscription = await h.runtime.getSubscription('/repo', 'session');
    expect(subscription?.expires_at).toBeNull();
    expect(await h.runtime.hasSubscription('/repo', 'session')).toBe(true);
    await h.runtime.unsubscribe('/repo', 'session');
    expect(await h.runtime.hasSubscription('/repo', 'session')).toBe(false);
  } finally { await h.cleanup(); }
});


test('ambiguous delivery remains visible and can be retried manually exactly once', async () => {
  let attempt = 0;
  const h = await setup(async () => {
    attempt += 1;
    if (attempt === 1) throw new TypeError('network lost after send');
    return new Response(JSON.stringify({ ok: true, result: { message_id: 2 } }));
  });
  try {
    await h.runtime.configureAlias('team', '123456');
    await h.runtime.subscribe('/repo', 'session', 'team');
    const item = { directory: '/repo', sessionId: 'session', type: 'completed', eventKey: 'idle:one' };
    await expect(h.runtime.notify(item)).rejects.toThrow();
    const issues = await h.runtime.listDeliveryIssues();
    expect(issues).toHaveLength(1);
    expect(issues[0].status).toBe('delivery_unknown');
    expect(await h.runtime.notify(item)).toBe(true);
    expect(attempt).toBe(1);
    expect(await h.runtime.retryDelivery(issues[0].key)).toBe(true);
    expect(attempt).toBe(2);
    expect(await h.runtime.listDeliveryIssues()).toHaveLength(0);
    await expect(h.runtime.retryDelivery(issues[0].key)).rejects.toThrow();
  } finally { await h.cleanup(); }
});

test('resuming a busy session prevents a verified ready notification', async () => {
  let requests = 0;
  const h = await setup(async () => {
    requests += 1;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  });
  try {
    await h.runtime.configureAlias('team', '123456');
    await h.runtime.subscribe('/repo', 'session', 'team');
    const ready = { directory: '/repo', sessionId: 'session', type: 'completed',
      eventKey: 'idle:one', canSend: async () => false };
    expect(await h.runtime.notify(ready)).toBe(false);
    expect(requests).toBe(0);
    expect(await h.runtime.listDeliveryIssues()).toHaveLength(0);
  } finally { await h.cleanup(); }
});


test('approved Markdown cannot be replaced while waiting for user consent', async () => {
  let posted = 0;
  const h = await setup(async () => {
    posted += 1;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  });
  try {
    await h.runtime.configureAlias('team', '123456');
    const expectedSha256 = createHash('sha256').update('Original').digest('hex');
    await writeFile(join(h.root, 'report.md'), 'Replaced');
    await expect(h.runtime.sendContent({ file: 'report.md', directory: h.root,
      expectedSha256 })).rejects.toThrow(/changed/);
    expect(posted).toBe(0);
  } finally { await h.cleanup(); }
});

test('pre-send verification errors remain retryable and do not create delivery_unknown', async () => {
  let posts = 0;
  let checks = 0;
  const h = await setup(async () => {
    posts += 1;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  });
  try {
    await h.runtime.configureAlias('team', '123456');
    await h.runtime.subscribe('/repo', 'session', 'team');
    const item = {
      directory: '/repo', sessionId: 'session', type: 'completed', eventKey: 'idle:first',
      canSend: async () => {
        checks += 1;
        if (checks === 2) throw new Error('OpenCode lost connection before send');
        return true;
      },
    };
    await expect(h.runtime.notify(item)).rejects.toThrow(/lost connection/);
    expect(posts).toBe(0);
    expect(await h.runtime.listDeliveryIssues()).toHaveLength(0);
    expect(await h.runtime.notify({ ...item, canSend: async () => true })).toBe(true);
    expect(posts).toBe(1);
  } finally { await h.cleanup(); }
});

test('concurrent notifications cannot both pass an asynchronous completion fence', async () => {
  let posts = 0;
  const h = await setup(async () => {
    posts += 1;
    return new Response(JSON.stringify({ ok: true, result: { message_id: posts } }));
  });
  try {
    await h.runtime.configureAlias('team', '123456');
    await h.runtime.subscribe('/repo', 'session', 'team');
    let entered;
    let release;
    const checking = new Promise((resolve) => { entered = resolve; });
    const held = new Promise((resolve) => { release = resolve; });
    let checks = 0;
    const item = { directory: '/repo', sessionId: 'session', type: 'completed', eventKey: 'idle:shared' };
    const first = h.runtime.notify({ ...item, canSend: async () => {
      checks += 1;
      if (checks === 1) { entered(); await held; }
      return true;
    } });
    await checking;
    // This second event arrives while the first is still reading OpenCode.
    expect(await h.runtime.notify({ ...item, canSend: async () => true })).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(posts).toBe(1);
    expect(await h.runtime.notify(item)).toBe(true);
    expect(posts).toBe(1);
  } finally { await h.cleanup(); }
});

test('unsubscribe during the final live probe cancels delivery before Bot API', async () => {
  let posts = 0;
  const h = await setup(async () => {
    posts += 1;
    return new Response(JSON.stringify({ ok: true, result: { message_id: posts } }));
  });
  try {
    await h.runtime.configureAlias('team', '123456');
    await h.runtime.subscribe('/repo', 'session', 'team');
    let entered;
    let release;
    const checking = new Promise((resolve) => { entered = resolve; });
    const held = new Promise((resolve) => { release = resolve; });
    let checks = 0;
    const delivery = h.runtime.notify({
      directory: '/repo', sessionId: 'session', type: 'completed', eventKey: 'idle:last',
      canSend: async () => {
        checks += 1;
        if (checks === 2) { entered(); await held; }
        return true;
      },
    });
    await checking;
    await h.runtime.unsubscribe('/repo', 'session');
    release();
    expect(await delivery).toBe(false);
    expect(posts).toBe(0);
    expect(await h.runtime.listDeliveryIssues()).toHaveLength(0);
  } finally { await h.cleanup(); }
});
