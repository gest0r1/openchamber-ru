import { describe, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { installGuestFromGitSource, uninstallGuest } from './install.js';
import { findInstalledGuest } from './catalog.js';
import { checkGuestUpdate, updateGuest } from './updates.js';
import { prepareRootGuestService, removeRootGuestServiceData } from './root-service-runtime.js';

const required = process.env.P1_ROOT_EXTENSION_ACCEPTANCE === '1';
const git = (cwd, args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw Error(r.stderr || 'git failed');
};
const makeRemote = async (dir, id) => {
  const repo = path.join(dir, id);
  await fs.mkdir(repo, { mode: 0o755 });
  await fs.writeFile(path.join(repo, 'index.html'), '<html></html>');
  const writeVersion = async (version) => {
    await fs.writeFile(path.join(repo, 'package.json'), JSON.stringify({
      name: '@openchamber/' + id, version, openchamber: {
        apiVersion: 1, contributes: { panel: { id, name: id, icon: 'window', entry: 'index.html' } },
      },
    }));
    git(repo, ['add', '.']);
    git(repo, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', version]);
  };
  git(repo, ['init', '-q', '--template=', '-b', 'main']);
  await writeVersion('1.0.0');
  return { repo, writeVersion };
};

describe.skipIf(!required)('P1 extension lifecycle under real service capabilities', () => {
  test('install two, check update, update, remove; Git cannot access owner data', async () => {
    expect(process.getuid()).toBe(0);
    const status = await fs.readFile('/proc/self/status', 'utf8');
    const caps = BigInt('0x' + /^CapEff:\s+([a-f0-9]+)$/m.exec(status)[1]);
    expect(caps & 0xc3n).toBe(0xc3n); // CHOWN, DAC_OVERRIDE, SETGID, SETUID
    expect(caps & 0x8n).toBe(0n); // no CAP_FOWNER
    const uid = Number(spawnSync('id', ['-u', 'nobody'], { encoding: 'utf8' }).stdout.trim());
    const gid = Number(spawnSync('id', ['-g', 'nobody'], { encoding: 'utf8' }).stdout.trim());
    expect(uid).toBeGreaterThan(0);
    expect(gid).toBeGreaterThan(0);
    const previous = {};
    for (const [key, value] of Object.entries({
      OPENCHAMBER_ROOT_MODE: 'separated', OPENCHAMBER_CHILD_BOUNDARY_ACTIVE: '1',
      OPENCHAMBER_EXECUTION_UID: String(uid), OPENCHAMBER_EXECUTION_GID: String(gid),
    })) { previous[key] = process.env[key]; process.env[key] = value; }
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-extension-lifecycle-'));
    await fs.chmod(dir, 0o755);
    const profile = path.join(dir, 'private-profile');
    const runtime = path.join(dir, 'runtime');
    const persistPath = path.join(profile, 'extensions.json');
    await fs.mkdir(profile, { mode: 0o700 });
    const gitBinary = path.join(dir, 'git-unprivileged');
    // Use the actual UID/GID, no root effective or ambient capability, just
    // as the production child preload does; it is tested in my-opencode.
    await fs.writeFile(gitBinary, '#!/bin/sh\nexec /usr/bin/setpriv --reuid=' + uid + ' --regid=' + gid +
      ' --clear-groups --inh-caps=-all --ambient-caps=-all --no-new-privs /usr/bin/git "$@"\n', { mode: 0o755 });
    try {
      const first = await makeRemote(dir, 'p1-first');
      const second = await makeRemote(dir, 'server-browser');
      const opts = { gitBinary, openchamberVersion: '2.8.0' };
      expect(await installGuestFromGitSource(first.repo, persistPath, opts)).toMatchObject({ ok: true });
      const firstGuest = await findInstalledGuest('p1-first', persistPath);
      expect(firstGuest).toBeTruthy();
      const denied = spawnSync(gitBinary, ['-C', firstGuest.packageRoot, 'status'], { encoding: 'utf8' });
      expect(denied.status).not.toBe(0);
      await first.writeVersion('1.1.0');
      expect(await checkGuestUpdate({ guest: firstGuest, origin: firstGuest.gitOrigin, gitBinary }))
        .toEqual({ available: true, version: '1.1.0', requested: [] });
      // A second install succeeds while the first extension already exists.
      expect(await installGuestFromGitSource(second.repo, persistPath, opts)).toMatchObject({ ok: true });
      const browser = await findInstalledGuest('server-browser', persistPath);
      const config = '{"profileRoot":"/home/opencode/browser-projects"}';
      await fs.writeFile(path.join(browser.packageRoot, 'config.json'), config);
      await second.writeVersion('1.1.0');
      expect(await checkGuestUpdate({ guest: browser, origin: browser.gitOrigin, gitBinary }))
        .toEqual({ available: true, version: '1.1.0', requested: [] });
      expect(await updateGuest({ guest: browser, origin: browser.gitOrigin, persistPath, ...opts }))
        .toEqual({ ok: true, id: 'server-browser' });
      expect((await findInstalledGuest('server-browser', persistPath)).version).toBe('1.1.0');
      expect(await fs.readFile(path.join(browser.packageRoot, 'config.json'), 'utf8')).toBe(config);
      // Service data also requires CHOWN; the root UI must not require FOWNER.
      const data = path.join(profile, 'old-data');
      await fs.mkdir(data);
      await fs.writeFile(path.join(data, 'state'), 'preserved');
      const service = await prepareRootGuestService({ guestId: 'server-browser', packageRoot: browser.packageRoot,
        entry: 'index.html', dataDir: data }, { root: runtime, uid, gid });
      expect((await fs.stat(service.dataDir)).uid).toBe(uid);
      expect((await fs.stat(service.dataDir)).mode & 0o777).toBe(0o700);
      expect(await fs.readFile(path.join(service.dataDir, 'state'), 'utf8')).toBe('preserved');
      await removeRootGuestServiceData('server-browser', { root: runtime });
      expect(await uninstallGuest('server-browser', persistPath)).toMatchObject({ ok: true });
      expect(await findInstalledGuest('server-browser', persistPath)).toBeNull();
      expect(await findInstalledGuest('p1-first', persistPath)).toBeTruthy();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  }, 60_000);
});
