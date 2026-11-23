import { describe, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
});
