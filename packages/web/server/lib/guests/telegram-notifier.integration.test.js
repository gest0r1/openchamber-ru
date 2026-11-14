import { afterEach, beforeEach, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectGuestPackage } from './catalog.js';
import { setCapabilityGrants, writeExtensionStore } from './persist.js';
import {
  beginGuestServiceHost, configureGuestOpenCodeProvider, getServiceStatus,
  proxyGuestServiceRequest, stopAllGuestServices, stopGuestService,
} from './service.js';

// Exercise the actual distributable SDK notifier package and service host.
// The Bot API is never contacted; no real credentials or user sessions.
const packageRoot = fileURLToPath(new URL('../../../../../extensions/telegram-notifier/', import.meta.url));
const guestId = 'telegram-notifier';

beforeEach(() => {
  beginGuestServiceHost();
  // The real service host refuses provides:opencode without an installed
  // OpenCode provider. The service uses no OpenCode credentials in this test.
  configureGuestOpenCodeProvider({
    environmentFor: async () => ({}),
    revokeGuest: () => {},
    revokeAll: () => {},
    stop: async () => {},
  });
});
afterEach(async () => stopAllGuestServices());

test('Telegram notifier SDK service needs explicit grants, accepts events and can restart and revoke', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-telegram-notifier-host-'));
  const persistPath = path.join(root, 'extensions.json');
  try {
    const inspected = await inspectGuestPackage(packageRoot, { openchamberVersion: '2.7.1' });
    expect(inspected).toMatchObject({ ok: true });
    if (!inspected.ok) throw new Error('SDK notifier manifest rejected by the catalog');
    const guest = inspected.guest;
    expect(guest.id).toBe(guestId);
    expect(guest.service?.provides).toContain('opencode');
    expect(guest.service?.keepRunning).toBe(true);
    expect(guest.sessionEvents?.content).not.toBe(true);

    await writeExtensionStore(persistPath, { paths: [packageRoot], sources: {}, capabilityGrants: {} });
    const request = ({ method, route, body, granted = ['service', 'opencode'] }) =>
      proxyGuestServiceRequest({
        guestId, packageRoot, service: guest.service, granted, persistPath,
        method, path: route, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    await expect(request({ method: 'GET', route: '/health', granted: [] }))
      .rejects.toMatchObject({ code: 'NO_SERVICE' });

    await setCapabilityGrants(guestId, persistPath, ['service', 'opencode']);
    expect((await request({ method: 'GET', route: '/health' })).status).toBe(200);
    expect(getServiceStatus(guestId)).toBe('ready');
    const event = {
      v: 1, requestId: 'test-notifier-1',
      event: { id: 'evt-notifier', type: 'turn-finished', at: 1730000000000,
        session: { id: 'ses_root', parentId: null },
        project: { directory: '/isolated/test-project' }, linked: [] },
    };
    const accepted = await request({ method: 'POST', route: '/session-events', body: event });
    expect(accepted.status).toBe(200);
    expect(JSON.parse(accepted.body)).toEqual({ ok: true });
    const status = await request({ method: 'GET', route: '/status' });
    expect(JSON.parse(status.body)).toMatchObject({ ok: true });
    expect((await fs.readdir(path.join(root, 'guest-data', guestId)).catch(() => [])))
      .not.toContain('bot-token.json');

    await stopGuestService(guestId);
    expect(getServiceStatus(guestId)).toBe('stopped');
    expect((await request({ method: 'GET', route: '/health' })).status).toBe(200);
    await setCapabilityGrants(guestId, persistPath, []);
    await stopGuestService(guestId);
    await expect(request({ method: 'GET', route: '/health', granted: [] }))
      .rejects.toMatchObject({ code: 'NO_SERVICE' });
  } finally {
    await stopGuestService(guestId);
    await fs.rm(root, { recursive: true, force: true });
  }
});
