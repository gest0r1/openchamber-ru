import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTelegramWatch } from './telegram-watch.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const createHarness = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'telegram-watch-'));
  const state = { reachable: true, active: false, shells: false, form: false, permission: false, idleId: 'idle-1', outcome: 'succeeded', pending: false };
  const notifications = [];
  const source = {
    buildOpenCodeUrl: (path) => 'http://opencode' + path,
    getOpenCodeAuthHeaders: () => ({}),
    fetchImpl: async (url) => {
      if (!state.reachable) throw new Error('disconnected');
      const parsed = new URL(url);
      let data;
      switch (parsed.pathname) {
        case '/api/session/active':
          data = state.active ? { session: { type: 'running' } } : {};
          break;
        case '/api/shell':
          data = state.shells ? [{ id: 'sh-1', status: 'running' }] : [];
          break;
        case '/api/session/session/form':
          data = state.form ? [{ id: 'form-1', sessionID: 'session' }] : [];
          break;
        case '/api/session/session/permission':
          data = state.permission ? [{ id: 'permission-1' }] : [];
          break;
        case '/api/session/session/message':
          data = { data: [{ id: state.idleId, type: 'idle', outcome: state.outcome, time: { created: 10 } }] };
          break;
        case '/api/session':
          data = { data: [], cursor: {} };
          break;
        default:
          data = { id: 'session', parentID: null };
      }
      return new Response(JSON.stringify({ data }), { status: 200 });
    },
  };
  const telegram = {
    hasSubscription: async () => true,
    notify: async (payload) => { notifications.push(payload); return true; },
  };
  const options = {
    filePath: join(directory, 'watch.json'), telegram, sourceFor: () => source,
    dispatchPending: async () => state.pending ? [{ parentSessionId: 'session' }] : [],
    readSettings: async () => ({ telegramEnabled: true }),
  };
  const event = { type: 'session.idle', properties: { sessionID: 'session', directory: '/repo' } };
  return { state, notifications, options, directory, event, cleanup: () => rm(directory, { recursive: true, force: true }) };
};

test('unknown completion remains pending and recovers without another idle event', async () => {
  const h = await createHarness();
  try {
    const watch = createTelegramWatch(h.options);
    await watch.start();
    h.state.reachable = false;
    watch.onEvent(h.event);
    await sleep(1700);
    expect(h.notifications).toHaveLength(0);
    expect(watch.pendingCount()).toBe(1);
    h.state.reachable = true;
    await sleep(2400);
    expect(h.notifications).toHaveLength(1);
    expect(h.notifications[0].eventKey).toBe('idle:idle-1');
    watch.stop();
  } finally { await h.cleanup(); }
});

test('shell work and returned results require a new parent idle record', async () => {
  const h = await createHarness();
  try {
    const watch = createTelegramWatch(h.options);
    await watch.start();
    h.state.shells = true;
    watch.onEvent(h.event);
    await sleep(1700);
    expect(h.notifications).toHaveLength(0);
    h.state.shells = false;
    h.state.pending = true;
    await sleep(2400);
    expect(h.notifications).toHaveLength(0);
    h.state.pending = false;
    h.state.idleId = 'idle-2';
    await sleep(5500);
    expect(h.notifications).toHaveLength(1);
    expect(h.notifications[0].eventKey).toBe('idle:idle-2');
    watch.stop();
  } finally { await h.cleanup(); }
});

test('a persisted verification resumes after restart', async () => {
  const h = await createHarness();
  try {
    const before = createTelegramWatch(h.options);
    await before.start();
    h.state.reachable = false;
    before.onEvent(h.event);
    await sleep(1700);
    before.stop();
    h.state.reachable = true;
    const after = createTelegramWatch(h.options);
    await after.start();
    await sleep(1700);
    expect(h.notifications).toHaveLength(1);
    after.stop();
  } finally { await h.cleanup(); }
});

test('a cancelled subscription discards an unresolved notification', async () => {
  const h = await createHarness();
  try {
    const watch = createTelegramWatch(h.options);
    await watch.start();
    h.state.reachable = false;
    watch.onEvent(h.event);
    await sleep(1700);
    await watch.cancel('session', '/repo');
    h.state.reachable = true;
    await sleep(2400);
    expect(h.notifications).toHaveLength(0);
    watch.stop();
  } finally { await h.cleanup(); }
});
