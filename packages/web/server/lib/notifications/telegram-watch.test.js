import { test, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTelegramWatch } from './telegram-watch.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 35));
const createHarness = async () => {
  const root = await mkdtemp(join(tmpdir(), 'telegram-watch-'));
  const state = {
    reachable: true, parentWorking: false, childWorking: false,
    shellWorking: false, form: false, permission: false, returned: false,
    idleId: 'idle-1', outcome: 'succeeded', pageWaiting: false,
  };
  const sent = new Set();
  const notifications = [];
  const jobs = new Map();
  let id = 0;
  const timer = (fn, ms) => {
    const handle = { id: ++id, unref() {} };
    jobs.set(handle.id, { fn, ms });
    return handle;
  };
  const clearTimer = (handle) => jobs.delete(handle?.id);
  const tick = async () => {
    await settle();
    const first = [...jobs].sort((a, b) => a[1].ms - b[1].ms)[0];
    if (!first) throw new Error('No scheduled check to execute');
    jobs.delete(first[0]);
    first[1].fn();
    await settle();
    return first[1].ms;
  };
  const source = {
    buildOpenCodeUrl: (path) => 'http://opencode' + path,
    getOpenCodeAuthHeaders: () => ({}),
    fetchImpl: async (url) => {
      if (!state.reachable) throw new Error('disconnected');
      const { pathname } = new URL(url);
      let data;
      if (pathname === '/api/session/active') {
        const statuses = {};
        if (state.parentWorking) statuses.session = { type: 'running' };
        if (state.childWorking) statuses.child = { type: 'running' };
        data = statuses;
      } else if (pathname === '/api/session/child') {
        data = { id: 'child', parentID: 'session' };
      } else if (pathname === '/api/shell') {
        data = state.shellWorking ? [{ id: 'job' }] : [];
      } else if (pathname === '/api/session/session/form') {
        data = state.form ? [{ id: 'form-1', sessionID: 'session' }] : [];
      } else if (pathname === '/api/session/session/permission') {
        data = state.permission ? [{ id: 'permission-1' }] : [];
      } else if (pathname === '/api/session/session/message') {
        data = { data: [{ id: state.idleId, type: 'idle', outcome: state.outcome }] };
      } else if (pathname === '/api/session') {
        data = { data: [], cursor: {} };
      } else {
        data = { id: 'session', parentID: null };
      }
      return new Response(JSON.stringify({ data }), { status: 200 });
    },
  };
  const telegram = {
    listSubscriptions: async () => [],
    hasSubscription: async () => true,
    notify: async ({ canSend, ...payload }) => {
      if (canSend && !await canSend()) return false;
      if (sent.has(payload.eventKey)) return true;
      sent.add(payload.eventKey);
      notifications.push(payload);
      return true;
    },
    unsubscribe: async () => {},
  };
  const filePath = join(root, 'watch.json');
  const options = {
    filePath, telegram, sourceFor: () => source,
    dispatchPending: async () => state.returned ? [{ parentSessionId: 'session' }] : [],
    isGoalActive: async () => false,
    isPageWaiting: () => state.pageWaiting,
    readSettings: async () => ({ telegramEnabled: true }),
    setTimeoutImpl: timer, clearTimeoutImpl: clearTimer,
  };
  const event = { type: 'session.idle', properties: { sessionID: 'session', directory: '/repo' } };
  return { root, state, filePath, options, event, jobs, tick, notifications,
    cleanup: () => rm(root, { recursive: true, force: true }) };
};

test('unknown is retained, checked again, then delivered exactly once', async () => {
  const h = await createHarness();
  const watch = createTelegramWatch(h.options);
  try {
    await watch.start();
    h.state.reachable = false;
    await watch.queue({ sessionId: 'session', directory: '/repo' });
    expect(await h.tick()).toBe(1500);
    expect(h.notifications).toHaveLength(0);
    expect(watch.pendingCount()).toBe(1);
    h.state.reachable = true;
    expect(await h.tick()).toBe(5000);
    expect(h.notifications).toHaveLength(0);
    expect(await h.tick()).toBe(500);
    expect(h.notifications).toHaveLength(1);
    expect(h.notifications[0].eventKey).toBe('idle:idle-1');
    // Periodic checkpoint reconciliation never sends the same idle twice.
    await h.tick();
    expect(h.notifications).toHaveLength(1);
  } finally { watch.stop(); await h.cleanup(); }
});

test('outstanding returnResult prevents an intermediate idle; first new idle delivers', async () => {
  const h = await createHarness();
  const watch = createTelegramWatch(h.options);
  try {
    await watch.start();
    h.state.returned = true;
    await watch.queue({ sessionId: 'session', directory: '/repo' });
    await h.tick();
    expect(h.notifications).toHaveLength(0);
    h.state.returned = false;
    await h.tick();
    expect(h.notifications).toHaveLength(0);
    h.state.idleId = 'idle-2';
    await h.tick();
    await h.tick();
    expect(h.notifications.map((item) => item.eventKey)).toEqual(['idle:idle-2']);
  } finally { watch.stop(); await h.cleanup(); }
});

test('a background shell may finish without forcing a new parent idle', async () => {
  const h = await createHarness();
  const watch = createTelegramWatch(h.options);
  try {
    await watch.start();
    h.state.shellWorking = true;
    await watch.queue({ sessionId: 'session', directory: '/repo' });
    await h.tick();
    expect(h.notifications).toHaveLength(0);
    h.state.shellWorking = false;
    await h.tick();
    await h.tick();
    expect(h.notifications.map((item) => item.eventKey)).toEqual(['idle:idle-1']);
  } finally { watch.stop(); await h.cleanup(); }
});

test('restore in-flight completion after server restart without a second idle event', async () => {
  const h = await createHarness();
  let watch = createTelegramWatch(h.options);
  try {
    await watch.start();
    h.state.reachable = false;
    await watch.queue({ sessionId: 'session', directory: '/repo' });
    await h.tick();
    watch.stop();
    const persisted = JSON.parse(await readFile(h.filePath, 'utf8'));
    expect(persisted.pending).toHaveLength(1);
    h.state.reachable = true;
    watch = createTelegramWatch(h.options);
    await watch.start();
    await h.tick();
    await h.tick();
    expect(h.notifications.map((item) => item.eventKey)).toEqual(['idle:idle-1']);
  } finally { watch.stop(); await h.cleanup(); }
});

test('a subscribed session recovers an unanswered form after restart and reconnect', async () => {
  const h = await createHarness();
  const watch = createTelegramWatch(h.options);
  try {
    await watch.start();
    await watch.track({ sessionId: 'session', directory: '/repo' });
    h.state.form = true;
    await h.tick();
    expect(h.notifications.map((item) => item.eventKey)).toEqual(['form:form-1']);
    await h.tick();
    expect(h.notifications.filter((item) => item.eventKey === 'form:form-1')).toHaveLength(1);
  } finally { watch.stop(); await h.cleanup(); }
});

test('a settled page does not deliver a stale input notification', async () => {
  const h = await createHarness();
  const watch = createTelegramWatch(h.options);
  try {
    await watch.start();
    await watch.track({ sessionId: 'session', directory: '/repo' });
    h.state.pageWaiting = true;
    const page = { type: 'openchamber:page-waiting', properties: {
      sessionID: 'session', directory: '/repo', page: { id: 'page-1' },
    } };
    watch.onEvent(page);
    h.state.pageWaiting = false;
    watch.onEvent({ type: 'openchamber:page-settled', properties: {
      sessionID: 'session', directory: '/repo', pageID: 'page-1',
    } });
    await h.tick();
    expect(h.notifications).toHaveLength(0);
  } finally { watch.stop(); await h.cleanup(); }
});

test('deleted sessions remove their subscription and pending checks', async () => {
  const h = await createHarness();
  const watch = createTelegramWatch(h.options);
  let deletes = 0;
  h.options.telegram.unsubscribe = async () => { deletes += 1; };
  try {
    await watch.start();
    await watch.track({ sessionId: 'session', directory: '/repo' });
    watch.onEvent({ type: 'session.deleted', properties: {
      sessionID: 'session', directory: '/repo',
    } });
    await settle();
    expect(deletes).toBe(1);
    expect(watch.pendingCount()).toBe(0);
  } finally { watch.stop(); await h.cleanup(); }
});


test('a corrupt checkpoint is quarantined and rebuilt from subscriptions', async () => {
  const h = await createHarness();
  h.options.telegram.listSubscriptions = async () => [
    { sessionId: 'session', directory: '/repo', spaceId: null },
  ];
  const watch = createTelegramWatch(h.options);
  try {
    await writeFile(h.filePath, '{invalid');
    await watch.start();
    const files = await readdir(h.root);
    expect(files.some((name) => name.startsWith('watch.json.corrupt-'))).toBe(true);
    expect(watch.pendingCount()).toBe(1);
    const saved = JSON.parse(await readFile(h.filePath, 'utf8'));
    expect(saved.pending[0].sessionId).toBe('session');
  } finally { watch.stop(); await h.cleanup(); }
});

test('a resumed parent before the quiet timer cancels its completion', async () => {
  const h = await createHarness();
  const watch = createTelegramWatch(h.options);
  try {
    await watch.start();
    await watch.queue({ sessionId: 'session', directory: '/repo' });
    await h.tick(); // first idle check, now waiting for quiet recheck
    h.state.parentWorking = true;
    await h.tick(); // 500 ms confirmation detects renewed work
    expect(h.notifications).toHaveLength(0);
    h.state.parentWorking = false;
    h.state.idleId = 'idle-2';
    await h.tick();
    await h.tick();
    expect(h.notifications.map((item) => item.eventKey)).toEqual(['idle:idle-2']);
  } finally { watch.stop(); await h.cleanup(); }
});


test('an aborted idle keeps the subscription checkpoint across a missed later idle event', async () => {
  const h = await createHarness();
  const watch = createTelegramWatch(h.options);
  try {
    await watch.start();
    await watch.track({ sessionId: 'session', directory: '/repo' });
    h.state.idleId = 'idle-2';
    h.state.outcome = 'interrupted';
    watch.onEvent({ type: 'session.idle', properties: {
      sessionID: 'session', directory: '/repo', aborted: true,
    } });
    expect(watch.pendingCount()).toBe(1);
    await h.tick();
    expect(h.notifications).toHaveLength(0);
    // No SSE event arrives for the next turn; the durable checkpoint must
    // still detect its completed idle record during reconciliation.
    h.state.idleId = 'idle-3';
    h.state.outcome = 'succeeded';
    await h.tick();
    await h.tick();
    expect(h.notifications.map((item) => item.eventKey)).toEqual(['idle:idle-3']);
  } finally { watch.stop(); await h.cleanup(); }
});


test('a deletion received before restoring checkpoints cannot revive the deleted session', async () => {
  const h = await createHarness();
  let watch = createTelegramWatch(h.options);
  try {
    await watch.start();
    await watch.track({ sessionId: 'session', directory: '/repo' });
    watch.stop();
    watch = createTelegramWatch(h.options);
    // A delete event can race with the first checkpoint load at startup.
    watch.onEvent({ type: 'session.deleted', properties: {
      sessionID: 'session', directory: '/repo',
    } });
    await settle();
    const saved = JSON.parse(await readFile(h.filePath, 'utf8'));
    expect(saved.pending).toHaveLength(0);
    expect(watch.pendingCount()).toBe(0);
  } finally { watch.stop(); await h.cleanup(); }
});
