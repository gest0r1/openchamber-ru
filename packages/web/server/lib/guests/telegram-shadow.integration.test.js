import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectGuestPackage } from './catalog.js';
import { setCapabilityGrants, writeExtensionStore } from './persist.js';
import {
  beginGuestServiceHost, getServiceStatus, proxyGuestServiceRequest,
  stopAllGuestServices, stopGuestService,
} from './service.js';

// Use the *actual* distributable standalone extension, not a mock of its
// manifest or service. No Bot API, external network, live user data or secrets.
const packageRoot = fileURLToPath(new URL('../../../../../extensions/telegram-shadow/', import.meta.url));
const guestId = 'telegram-shadow';
const envelope = (id, parentId = null) => ({
  v: 1, requestId: 'test-' + id,
  event: {
    id, type: 'turn-finished', at: 1730000000000,
    session: { id: parentId ? 'ses_child' : 'ses_root', parentId },
    project: { directory: '/isolated/test-project' }, linked: [],
  },
});

beforeEach(() => beginGuestServiceHost());
afterEach(async () => stopAllGuestServices());

describe('Telegram shadow SDK host install and durable lifecycle', () => {
  test('needs the explicit host service grant; persists root/child events and resumes after restart', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-sdk-telegram-host-'));
    const persistPath = path.join(root, 'extensions.json');
    try {
      const inspected = await inspectGuestPackage(packageRoot, { openchamberVersion: '2.7.1' });
      expect(inspected.ok).toBe(true);
      if (!inspected.ok) throw new Error('Telegram shadow manifest rejected by the real catalog');
      const guest = inspected.guest;
      expect(guest.id).toBe(guestId);
      expect(guest.service?.keepRunning).toBe(true);
      expect(guest.sessionEvents?.content).toBe(false);
      expect(guest.sessionEvents?.events).toContain('turn-finished');
      expect(guest.service?.provides).toBeUndefined();

      await writeExtensionStore(persistPath, {
        paths: [packageRoot], sources: {}, capabilityGrants: {},
      });
      const request = ({ method, route, wire, granted = ['service'] }) =>
        proxyGuestServiceRequest({
          guestId, packageRoot, service: guest.service,
          granted, persistPath, method, path: route,
          ...(wire === undefined ? {} : { body: JSON.stringify(wire) }),
        });
      await expect(request({ method: 'GET', route: '/health', granted: [] }))
        .rejects.toMatchObject({ code: 'NO_SERVICE' });
      expect(getServiceStatus(guestId)).toBe('stopped');

      await setCapabilityGrants(guestId, persistPath, ['service']);
      const status = await request({ method: 'GET', route: '/health' });
      expect(status.status).toBe(200);
      expect(getServiceStatus(guestId)).toBe('ready');

      const first = await request({ method: 'POST', route: '/session-events', wire: envelope('evt-root') });
      expect(first.status).toBe(200);
      expect(JSON.parse(first.body)).toMatchObject({ ok: true, recorded: true, duplicate: false });
      const second = await request({ method: 'POST', route: '/session-events', wire: envelope('evt-child', 'ses_root') });
      expect(second.status).toBe(200);
      const replay = await request({ method: 'POST', route: '/session-events', wire: envelope('evt-root') });
      expect(JSON.parse(replay.body)).toMatchObject({ ok: true, recorded: false, duplicate: true });

      const statePath = path.join(root, 'guest-data', guestId, 'shadow-events-v1.json');
      const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
      expect(state.events.length).toBe(2);
      expect((await fs.stat(statePath)).mode & 0o777).toBe(0o600);
      expect(await fs.readFile(statePath, 'utf8')).not.toContain('botToken');
      expect(await fs.readFile(statePath, 'utf8')).not.toContain('reply');

      await stopGuestService(guestId);
      expect(getServiceStatus(guestId)).toBe('stopped');
      const restarted = await request({ method: 'GET', route: '/status' });
      expect(JSON.parse(restarted.body)).toMatchObject({
        ok: true, version: 1, observed: 2, rootEvents: 1, deliveryEnabled: false,
      });
      const duplicateAfterRestart = await request({ method: 'POST', route: '/session-events', wire: envelope('evt-child', 'ses_root') });
      expect(JSON.parse(duplicateAfterRestart.body)).toMatchObject({ duplicate: true, recorded: false });

      await setCapabilityGrants(guestId, persistPath, []);
      await stopGuestService(guestId);
      await expect(request({ method: 'GET', route: '/status', granted: [] }))
        .rejects.toMatchObject({ code: 'NO_SERVICE' });
    } finally {
      await stopGuestService(guestId);
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
