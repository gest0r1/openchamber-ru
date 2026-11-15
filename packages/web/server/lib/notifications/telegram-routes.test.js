import { test, expect } from 'vitest';
import { isSpaceRequest, classifySpacePath } from '../spaces/dispatcher.js';
import { registerTelegramRoutes } from './telegram-routes.js';

test('space subscription status stays on the host without leaking a directory into routing', async () => {
  const path = '/api/notifications/telegram/subscription/status';
  const directory = '/spaces/abcdef123456/project';
  const req = {
    originalUrl: path,
    headers: {},
    body: { sessionId: 'session', directory, spaceId: 'abcdef123456' },
  };
  // The space dispatcher never examines the body to select a space.
  expect(isSpaceRequest(req)).toBe(false);
  expect(classifySpacePath(path)).toBe('host_only');
  expect(isSpaceRequest({
    originalUrl: '/api/notifications/telegram/subscription?directory=' + encodeURIComponent(directory),
    headers: {},
  })).toBe(true);

  const handlers = new Map();
  const app = {
    use: () => {},
    get: (route, handler) => { handlers.set('GET ' + route, handler); },
    post: (route, handler) => { handlers.set('POST ' + route, handler); },
    delete: () => {},
  };
  const received = [];
  registerTelegramRoutes(app, {
    telegram: {
      hasSubscription: async (...args) => {
        received.push(args);
        return true;
      },
    },
    config: {}, watch: {}, approval: {},
    getSource: () => null, dispatchPending: async () => [],
    uiAuthController: { ensureSessionToken: async () => 'test-session' },
  });
  const status = await new Promise((resolve, reject) => {
    handlers.get('POST ' + path)(req, { json: resolve }, reject);
  });
  expect(status).toEqual({ subscribed: true });
  expect(received).toEqual([[directory, 'session']]);
});


const senderFixture = (initial = 'legacy', proofResult = { kind: 'idle', idle: { id: 'idle-old', outcome: 'succeeded' } }) => {
  const trace = [];
  let sender = initial;
  const handlers = new Map();
  const app = {
    use: () => {},
    get: (route, handle) => handlers.set('GET ' + route, handle),
    post: (route, handle) => handlers.set('POST ' + route, handle),
    delete: () => {},
  };
  const subscriptions = [{ directory: '/repo', sessionId: 'ses_1', spaceId: null,
    createdAt: 42, baselineIdleId: 'idle-old' }];
  const telegram = {
    waitForSettledDeliveries: async () => {
      trace.push('drain:' + sender);
      expect(sender).toBe('paused');
    },
    listSubscriptions: async () => subscriptions,
    seedBaselines: async (rows) => trace.push('seed:' + rows[0]?.idleId),
  };
  registerTelegramRoutes(app, {
    telegram,
    config: {
      read: async () => ({ sender, enabled: true }),
      update: async ({ sender: value }) => { sender = value; trace.push('sender:' + value); },
    },
    watch: {
      checkpoints: async () => [{ directory: '/repo', sessionId: 'ses_1', spaceId: null,
        baselineIdleId: 'idle-old', armed: false, requireNewIdle: null }],
      start: async () => trace.push('watch:start'),
      reconcileAll: () => trace.push('watch:start'),
    },
    approval: {}, getSource: () => null, dispatchPending: async () => [],
    uiAuthController: { ensureSessionToken: async () => 'test-session' },
    completionProof: async () => proofResult, sdkSenderReady: async () => true,
  });
  const request = (body) => new Promise((resolve, reject) => {
    let code = 200;
    const res = {
      headersSent: false,
      status: (value) => { code = value; return res; },
      json: (value) => { resolve({ status: code, body: value }); return res; },
      setHeader: () => {},
    };
    handlers.get('POST /api/notifications/telegram/sender')({ body }, res, reject);
  });
  return { request, trace, getSender: () => sender };
};

test('quiescent cutover drains legacy before SDK and rollback drains SDK before legacy resumes', async () => {
  const h = senderFixture();
  expect(await h.request({ sender: 'sdk' })).toEqual({ status: 200, body: { sender: 'sdk' } });
  expect(h.trace).toEqual(['sender:paused', 'drain:paused', 'seed:idle-old', 'sender:sdk']);
  expect(await h.request({ sender: 'legacy' })).toEqual({ status: 200, body: { sender: 'legacy' } });
  expect(h.trace.slice(4)).toEqual(['sender:paused', 'drain:paused', 'sender:legacy', 'watch:start']);
});

test('unknown completion during cutover restores only the previous legacy owner', async () => {
  const h = senderFixture('legacy', { kind: 'unknown', reason: 'shells-unavailable' });
  const result = await h.request({ sender: 'sdk' });
  expect(result.status).toBe(409);
  expect(h.getSender()).toBe('legacy');
  expect(h.trace).toEqual(['sender:paused', 'drain:paused', 'sender:legacy', 'watch:start']);
});


test('tracked-session search finds a renamed older subscription beyond the latest fifty', async () => {
  const handlers = new Map();
  const app = {
    use: () => {},
    get: (route, handle) => handlers.set('GET ' + route, handle),
    post: () => {},
    delete: () => {},
  };
  const rows = Array.from({ length: 61 }, (_, i) => ({
    sessionId: 'ses_' + i, directory: '/project', spaceId: null,
    title: 'Old title ' + i, alias: 'team', createdAt: 1000 - i,
  }));
  registerTelegramRoutes(app, {
    telegram: { listSubscriptions: async () => rows },
    config: {}, watch: {}, approval: {},
    getSource: () => ({
      buildOpenCodeUrl: (path) => 'http://opencode' + path,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl: async (url) => {
        const id = decodeURIComponent(new URL(url).pathname.split('/').pop());
        return Response.json({ data: {
          id, title: id === 'ses_60' ? 'Renamed long-running work' : 'Old title',
          location: { directory: '/project' },
        } });
      },
    }),
    dispatchPending: async () => [],
    uiAuthController: { ensureSessionToken: async () => 'test-session' },
  });
  const response = await new Promise((resolve, reject) => {
    const res = { setHeader: () => {}, json: resolve };
    handlers.get('GET /api/notifications/telegram/subscriptions')(
      { query: { q: 'renamed long-running', page: '0' } }, res, reject);
  });
  expect(response.total).toBe(1);
  expect(response.subscriptions).toHaveLength(1);
  expect(response.subscriptions[0]).toMatchObject({
    sessionId: 'ses_60', title: 'Renamed long-running work',
  });
  expect(response.hasMore).toBe(false);
});


const optInFixture = (initial = 'legacy', holdVerify = false) => {
  let sender = initial;
  let verifyStarted;
  let releaseVerify;
  const verifying = new Promise((resolve) => { verifyStarted = resolve; });
  const held = new Promise((resolve) => { releaseVerify = resolve; });
  const trace = [];
  const handlers = new Map();
  const app = {
    use: () => {},
    get: (route, h) => handlers.set('GET ' + route, h),
    post: (route, h) => handlers.set('POST ' + route, h),
    delete: () => {},
  };
  registerTelegramRoutes(app, {
    config: {
      read: async () => ({ sender, enabled: true }),
      update: async ({ sender: next }) => { sender = next; trace.push('sender:' + next); },
    },
    telegram: {
      subscribe: async () => trace.push('subscribed'),
      unsubscribe: async () => trace.push('unsubscribed'),
      waitForSettledDeliveries: async () => {},
      listSubscriptions: async () => [],
      seedBaselines: async () => {},
    },
    watch: {
      track: async () => trace.push('legacy-track'),
      start: async () => trace.push('watch:start'),
      cancel: async () => {},
      checkpoints: async () => [],
      reconcileAll: () => {},
    },
    approval: {}, dispatchPending: async () => [],
    completionProof: async () => ({ kind: 'idle', idle: { id: 'idle-old', outcome: 'succeeded' } }),
    sdkSenderReady: async () => true,
    getSource: () => ({
      buildOpenCodeUrl: (url) => 'http://opencode' + url,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl: async (url) => {
        if (new URL(url).pathname.endsWith('/message')) {
          return Response.json({ data: [{ type: 'idle', id: 'idle-old' }] });
        }
        verifyStarted();
        if (holdVerify) await held;
        return Response.json({ data: {
          id: 'ses_1', title: 'Work', parentID: null,
          location: { directory: '/repo' },
        } });
      },
    }),
    uiAuthController: { ensureSessionToken: async () => 'test-session' },
  });
  const request = (route, body = {}) => new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      headersSent: false,
      status: (code) => { status = code; return res; },
      json: (data) => { resolve({ status, body: data }); return res; },
      setHeader: () => {},
    };
    handlers.get('POST /api/notifications/telegram/' + route)({ body }, res, reject);
  });
  return { request, trace, verifying, releaseVerify, getSender: () => sender };
};

test('SDK opt-in keeps a passive rollback checkpoint; rollback restores its legacy watcher', async () => {
  const h = optInFixture('sdk');
  expect(await h.request('subscribe', { sessionId: 'ses_1', directory: '/repo' }))
    .toEqual({ status: 200, body: { subscribed: true } });
  expect(h.trace).toEqual(['subscribed', 'legacy-track']);
  expect(await h.request('sender', { sender: 'legacy' }))
    .toEqual({ status: 200, body: { sender: 'legacy' } });
  expect(h.trace).toEqual(['subscribed', 'legacy-track', 'sender:paused', 'sender:legacy', 'watch:start']);
});

test('ongoing subscription blocks a concurrent sender cutover until checkpoint is durable', async () => {
  const h = optInFixture('legacy', true);
  const optIn = h.request('subscribe', { sessionId: 'ses_1', directory: '/repo' });
  await h.verifying;
  const switching = await h.request('sender', { sender: 'sdk' });
  expect(switching.status).toBe(409);
  expect(h.getSender()).toBe('legacy');
  h.releaseVerify();
  expect(await optIn).toEqual({ status: 200, body: { subscribed: true } });
  expect(h.trace).toEqual(['subscribed', 'legacy-track']);
});
