import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareGuestGitCheckout, validateGuestGitTree } from './root-guest-checkout.js';

const fixture = async (run: (root: string) => Promise<void>) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-git-boundary-'));
  try { await run(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
};

describe('P1 root extension checkout safety', () => {
  test('accepts an ordinary tree with one-owner regular files', async () => fixture(async (root) => {
    await fs.mkdir(path.join(root, 'nested'));
    await fs.writeFile(path.join(root, 'nested', 'index.js'), 'export {}');
    await expect(validateGuestGitTree(root)).resolves.toBeUndefined();
  }));

  test('rejects symlinks without following them', async () => fixture(async (root) => {
    await fs.symlink('/etc/passwd', path.join(root, 'unsafe'));
    await expect(validateGuestGitTree(root)).rejects.toThrow('ROOT_GIT_CHECKOUT_UNSAFE_ENTRY');
  }));

  test('rejects hardlinked files', async () => fixture(async (root) => {
    const file = path.join(root, 'first');
    await fs.writeFile(file, 'data');
    await fs.link(file, path.join(root, 'second'));
    await expect(validateGuestGitTree(root)).rejects.toThrow('ROOT_GIT_CHECKOUT_UNSAFE_ENTRY');
  }));

  test('rejects an oversized source before copying', async () => fixture(async (root) => {
    await fs.writeFile(path.join(root, 'large'), '');
    await fs.truncate(path.join(root, 'large'), 128 * 1024 * 1024 + 1);
    await expect(validateGuestGitTree(root)).rejects.toThrow('ROOT_GIT_CHECKOUT_SIZE_LIMIT');
  }));

  test('requires a trusted root execution boundary in root mode', async () => fixture(async (root) => {
    if (process.getuid?.() !== 0) return;
    const oldMode = process.env.OPENCHAMBER_ROOT_MODE;
    const oldMarker = process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE;
    try {
      delete process.env.OPENCHAMBER_ROOT_MODE;
      delete process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE;
      await expect(prepareGuestGitCheckout(path.join(root, 'destination'), async () => ({ ok: true })))
        .rejects.toThrow('ROOT_GIT_CHECKOUT_BOUNDARY_REQUIRED');
    } finally {
      if (oldMode === undefined) delete process.env.OPENCHAMBER_ROOT_MODE;
      else process.env.OPENCHAMBER_ROOT_MODE = oldMode;
      if (oldMarker === undefined) delete process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE;
      else process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE = oldMarker;
    }
  }));

  test('preserves ordinary non-root checkout behavior', async () => fixture(async (root) => {
    if (process.getuid?.() === 0) return;
    const target = path.join(root, 'destination');
    let called = false;
    const result = await prepareGuestGitCheckout(target, async (checkout) => {
      expect(checkout).toBe(target);
      called = true;
      return { ok: true, root: checkout };
    });
    expect(called).toBe(true);
    expect(result).toEqual({ ok: true, root: target });
  }));

  test('root-owned snapshot is created from a Git checkout executed by unprivileged UID', async () => fixture(async (root) => {
    if (process.getuid?.() !== 0) return;
    const nobodyUid = Number(spawnSync('id', ['-u', 'nobody'], { encoding: 'utf8' }).stdout.trim());
    const nobodyGid = Number(spawnSync('id', ['-g', 'nobody'], { encoding: 'utf8' }).stdout.trim());
    if (!Number.isInteger(nobodyUid) || nobodyUid <= 0 || !Number.isInteger(nobodyGid) || nobodyGid <= 0) return;
    const old = {
      mode: process.env.OPENCHAMBER_ROOT_MODE,
      marker: process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE,
      uid: process.env.OPENCHAMBER_EXECUTION_UID,
      gid: process.env.OPENCHAMBER_EXECUTION_GID,
    };
    try {
      process.env.OPENCHAMBER_ROOT_MODE = 'separated';
      process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE = '1';
      process.env.OPENCHAMBER_EXECUTION_UID = String(nobodyUid);
      process.env.OPENCHAMBER_EXECUTION_GID = String(nobodyGid);
      await fs.chmod(root, 0o755);
      const source = path.join(root, 'source');
      const dest = path.join(root, 'root-package');
      await fs.mkdir(source);
      await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'test' }));
      for (const args of [['init', '--quiet', source], ['-C', source, 'add', 'package.json'], ['-C', source, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '--quiet', '-m', 'initial']]) {
        const git = spawnSync('git', args, { encoding: 'utf8' });
        expect(git.status).toBe(0);
      }
      const result = await prepareGuestGitCheckout(dest, async (checkout) => {
        const git = spawnSync('git', ['clone', '--quiet', '--no-hardlinks', '--', source, checkout], {
          cwd: path.dirname(checkout), uid: nobodyUid, gid: nobodyGid, encoding: 'utf8',
          env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: '/tmp', GIT_TERMINAL_PROMPT: '0' },
        });
        expect(git.status).toBe(0);
        return { ok: true, root: checkout };
      });
      expect(result.ok).toBe(true);
      expect((await fs.lstat(dest)).uid).toBe(0);
      const write = spawnSync('sh', ['-c', 'echo altered >> "$1"', 'sh', path.join(dest, 'package.json')], {
        uid: nobodyUid, gid: nobodyGid, encoding: 'utf8',
      });
      expect(write.status).not.toBe(0);
      await expect(validateGuestGitTree(dest, true)).resolves.toBeUndefined();
    } finally {
      for (const [key, name] of [['mode', 'OPENCHAMBER_ROOT_MODE'], ['marker', 'OPENCHAMBER_CHILD_BOUNDARY_ACTIVE'], ['uid', 'OPENCHAMBER_EXECUTION_UID'], ['gid', 'OPENCHAMBER_EXECUTION_GID']] as const) {
        const value = old[key];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }));
});
