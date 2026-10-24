import { test, expect } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
