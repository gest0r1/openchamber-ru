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
