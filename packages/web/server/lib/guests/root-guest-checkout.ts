/**
 * Root OpenChamber must never ask opencode's Git process to create files in
 * /root. Git runs in an opencode-owned scratch checkout; the root UI imports a
 * validated, read-only snapshot into its extension store.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const BASE = '/var/lib/my-opencode-guest-runtime';
const CHECKOUTS = path.join(BASE, 'git-checkouts');
const MAX_ENTRIES = 6000;
const MAX_BYTES = 128 * 1024 * 1024;

const safeDir = async (dir: string, mode: number) => {
  await fs.mkdir(dir, { recursive: true, mode });
  const st = await fs.lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== 0 || (st.mode & 0o022)) {
    throw new Error('ROOT_GIT_CHECKOUT_PARENT_UNTRUSTED');
  }
  await fs.chmod(dir, mode);
};

const scan = async (root: string, requireRoot = false) => {
  let count = 0;
  let bytes = 0;
  const visit = async (name: string): Promise<void> => {
    const stat = await fs.lstat(name);
    if (stat.isSymbolicLink() || !(stat.isFile() || stat.isDirectory()) ||
        (stat.isFile() && stat.nlink !== 1) || (requireRoot && stat.uid !== 0)) {
      throw new Error('ROOT_GIT_CHECKOUT_UNSAFE_ENTRY');
    }
    count += 1;
    if (count > MAX_ENTRIES) throw new Error('ROOT_GIT_CHECKOUT_ENTRY_LIMIT');
    if (stat.isFile()) {
      bytes += stat.size;
      if (bytes > MAX_BYTES) throw new Error('ROOT_GIT_CHECKOUT_SIZE_LIMIT');
    } else {
      for (const child of await fs.readdir(name)) await visit(path.join(name, child));
    }
  };
  await visit(root);
};

export const validateGuestGitTree = scan;

const secureSnapshot = async (source: string, target: string) => {
  await scan(source);
  // Do not dereference links in the source. A second scan of the copied tree
  // is authoritative; only that tree is inspected or executed thereafter.
  await fs.cp(source, target, { recursive: true, force: false, errorOnExist: true, dereference: false });
  await scan(target, true);
  const sanitize = async (name: string): Promise<void> => {
    const st = await fs.lstat(name);
    if (st.isDirectory()) {
      for (const entry of await fs.readdir(name)) await sanitize(path.join(name, entry));
      await fs.chmod(name, 0o755);
    } else if (st.isFile()) {
      await fs.chmod(name, 0o644 | (st.mode & 0o111));
    } else {
      throw new Error('ROOT_GIT_CHECKOUT_UNSAFE_ENTRY');
    }
  };
  await sanitize(target);
  await scan(target, true);
};

const checkedUid = () => {
  const uid = Number(process.env.OPENCHAMBER_EXECUTION_UID);
  const gid = Number(process.env.OPENCHAMBER_EXECUTION_GID);
  if (process.env.OPENCHAMBER_ROOT_MODE !== 'separated' ||
      process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE !== '1' ||
      !Number.isSafeInteger(uid) || uid < 1 ||
      !Number.isSafeInteger(gid) || gid < 1) {
    throw new Error('ROOT_GIT_CHECKOUT_BOUNDARY_REQUIRED');
  }
  return { uid, gid };
};

/**
 * The ordinary non-root installation path remains unchanged.
 * prepare(destination) calls the existing Git network/authentication logic;
 * child_process is already forced to opencode by the trusted root boundary.
 */
type PrepareResult = { ok: true; root?: string } | { ok: false; code: string };

export async function prepareGuestGitCheckout(
  destination: string,
  prepare: (checkout: string) => Promise<PrepareResult>,
): Promise<PrepareResult> {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
    return prepare(destination);
  }
  const { uid, gid } = checkedUid();
  await safeDir(BASE, 0o755);
  await safeDir(CHECKOUTS, 0o711);
  const scratch = path.join(CHECKOUTS, 'checkout-' + randomBytes(12).toString('hex'));
  await fs.mkdir(scratch, { mode: 0o700 });
  try {
    await fs.chown(scratch, uid, gid);
    const checkout = path.join(scratch, 'source');
    const result = await prepare(checkout);
    if (!result.ok) return result;
    const root = result.root ?? checkout;
    if (!path.resolve(root).startsWith(checkout + path.sep) && path.resolve(root) !== checkout) {
      throw new Error('ROOT_GIT_CHECKOUT_OUTSIDE_SCRATCH');
    }
    await secureSnapshot(root, destination);
    return { ok: true, root: destination };
  } finally {
    await fs.rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}
