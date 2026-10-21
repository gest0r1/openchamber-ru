import { describe, expect, test } from 'bun:test';

import type { InstalledGuest } from '@/lib/guests/types';
import { CATALOG_EXTENSIONS, EXCALIDRAW_EXTENSION, RESOURCE_MONITOR_EXTENSION, SERVER_BROWSER_EXTENSION, getCatalogExtensionState } from './catalogExtensions';

const installed = (overrides: Partial<InstalledGuest> = {}): InstalledGuest => ({
  id: 'excalidraw',
  name: 'Excalidraw',
  icon: 'icon.svg',
  version: '1.0.0',
  capabilities: { requested: [], granted: [] },
  ...overrides,
});

describe('getCatalogExtensionState', () => {
  test('follows the installed catalog by extension id', () => {
    expect(getCatalogExtensionState([], EXCALIDRAW_EXTENSION)).toEqual({ kind: 'not-installed' });
    expect(getCatalogExtensionState([installed({ id: 'other' })], EXCALIDRAW_EXTENSION)).toEqual({ kind: 'not-installed' });
    expect(getCatalogExtensionState([installed()], EXCALIDRAW_EXTENSION)).toMatchObject({ kind: 'installed' });
    expect(getCatalogExtensionState([installed({ update: { version: '1.1.0' } })], EXCALIDRAW_EXTENSION))
      .toMatchObject({ kind: 'update-available', version: '1.1.0' });
  });

  test('approval and pause outrank an update, since the extension does nothing until they are resolved', () => {
    const unapproved = installed({ capabilities: { requested: ['files'], granted: [] }, enabled: false, update: { version: '2.0.0' } });
    expect(getCatalogExtensionState([unapproved], EXCALIDRAW_EXTENSION)).toMatchObject({ kind: 'needs-approval' });
    expect(getCatalogExtensionState([installed({ enabled: false, update: { version: '2.0.0' } })], EXCALIDRAW_EXTENSION))
      .toMatchObject({ kind: 'paused' });
  });
});

describe('CATALOG_EXTENSIONS', () => {
  test('every card installs a different extension', () => {
    const ids = CATALOG_EXTENSIONS.map((definition) => definition.guestId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getCatalogExtensionState([installed({ id: 'resource-monitor' })], RESOURCE_MONITOR_EXTENSION)).toMatchObject({ kind: 'installed' });
  });

  test('pins the server browser provider to the validated upstream tag', () => {
    expect(SERVER_BROWSER_EXTENSION).toMatchObject({
      guestId: 'server-browser',
      gitUrl: 'https://github.com/JosueGalRe/openchamber-server-browser#v0.7.0',
      homepage: 'https://github.com/JosueGalRe/openchamber-server-browser',
      nameKey: 'settings.integrations.extensionCatalog.serverBrowser.name',
      descriptionKey: 'settings.openchamber.tools.browserProvider.info',
    });
    expect(CATALOG_EXTENSIONS.map((entry) => entry.guestId)).toEqual(['excalidraw', 'resource-monitor', 'server-browser']);
  });

  test('server browser still follows ordinary user-extension approval state', () => {
    const browser = installed({
      id: 'server-browser',
      name: 'Server Browser',
      capabilities: { requested: ['service'], granted: [] },
    });
    expect(getCatalogExtensionState([browser], SERVER_BROWSER_EXTENSION)).toMatchObject({ kind: 'needs-approval' });
  });
});
