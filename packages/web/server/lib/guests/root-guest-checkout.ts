/**
 * Root OpenChamber must never ask opencode's Git process to create files in
 * /root. Git runs in an opencode-owned scratch checkout; the root UI imports a
 * validated, read-only snapshot into its extension store.
 */
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
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

/**
 * Root import anchored to directory file descriptors. Every source component
 * is opened with O_NOFOLLOW and verified by fstat. We never call fs.cp on an
 * opencode-writable path: that would leave a symlink-swap race when root reads.
 * The /proc/self/fd path intentionally makes this Linux-only and fail-closed.
 */
const secureSnapshot = async (source: string, target: string) => {
  const flags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const dirFlags = flags | constants.O_DIRECTORY;
  let entries = 0;
  let bytes = 0;
  const copyDir = async (srcDir: import('node:fs/promises').FileHandle, targetDir: string): Promise<void> => {
    entries += 1;
    if (entries > MAX_ENTRIES) throw new Error('ROOT_GIT_CHECKOUT_ENTRY_LIMIT');
    await fs.mkdir(targetDir, { mode: 0o700 });
    const srcFdRoot = `/proc/self/fd/${srcDir.fd}`;
    for (const child of await fs.readdir(srcFdRoot)) {
      if (child === '.' || child === '..' || child.includes('/')) throw new Error('ROOT_GIT_CHECKOUT_UNSAFE_ENTRY');
      const sourceFile = `${srcFdRoot}/${child}`;
      const destinationFile = path.join(targetDir, child);
      const entryFd = await fs.open(sourceFile, flags);
      try {
        const stat = await entryFd.stat();
        if (stat.isSymbolicLink() || !(stat.isDirectory() || stat.isFile()) ||
            (stat.isFile() && stat.nlink !== 1)) {
          throw new Error('ROOT_GIT_CHECKOUT_UNSAFE_ENTRY');
        }
        if (stat.isDirectory()) {
          // Re-open with O_DIRECTORY to reject a file substituted during the
          // walk. entryFd already anchors the inode; use that for recursion.
          await copyDir(entryFd, destinationFile);
        } else {
          entries += 1;
          if (entries > MAX_ENTRIES) throw new Error('ROOT_GIT_CHECKOUT_ENTRY_LIMIT');
          bytes += stat.size;
          if (bytes > MAX_BYTES) throw new Error('ROOT_GIT_CHECKOUT_SIZE_LIMIT');
          const writer = await fs.open(destinationFile,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
          try {
            const buffer = Buffer.allocUnsafe(64 * 1024);
            let offset = 0;
            while (true) {
              const { bytesRead } = await entryFd.read(buffer, 0, buffer.length, offset);
              if (!bytesRead) break;
              offset += bytesRead;
              if (offset > stat.size || bytes - stat.size + offset > MAX_BYTES) {
                throw new Error('ROOT_GIT_CHECKOUT_SIZE_LIMIT');
              }
              let written = 0;
              while (written < bytesRead) {
                const out = await writer.write(buffer, written, bytesRead - written);
                if (!out.bytesWritten) throw new Error('ROOT_GIT_CHECKOUT_WRITE_FAILED');
                written += out.bytesWritten;
              }
            }
            await writer.sync();
          } finally { await writer.close(); }
          await fs.chmod(destinationFile, 0o644 | (stat.mode & 0o111));
        }
      } finally { await entryFd.close(); }
    }
    await fs.chmod(targetDir, 0o755);
  };
  const sourceFd = await fs.open(source, dirFlags);
  try {
    const stat = await sourceFd.stat();
    if (!stat.isDirectory()) throw new Error('ROOT_GIT_CHECKOUT_UNSAFE_ENTRY');
    await copyDir(sourceFd, target);
    await scan(target, true);
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally { await sourceFd.close(); }
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
