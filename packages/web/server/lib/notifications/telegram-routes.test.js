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
      reconcileAll: () => trace.push('watch:reconcile'),
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
  expect(h.trace.slice(4)).toEqual(['sender:paused', 'drain:paused', 'sender:legacy', 'watch:reconcile']);
});

test('unknown completion during cutover restores only the previous legacy owner', async () => {
  const h = senderFixture('legacy', { kind: 'unknown', reason: 'shells-unavailable' });
  const result = await h.request({ sender: 'sdk' });
  expect(result.status).toBe(409);
  expect(h.getSender()).toBe('legacy');
  expect(h.trace).toEqual(['sender:paused', 'drain:paused', 'sender:legacy', 'watch:reconcile']);
});
