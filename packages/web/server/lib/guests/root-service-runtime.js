/**
 * Root OpenChamber serves owner UI only. Third-party guest service code and
 * persistent guest data must run under opencode without traversing /root.
 *
 * The mirror's parents are root-owned (0755), the executable snapshot is
 * root-owned read-only, and only the guest's data leaf is opencode-owned.
 * All writes by the service are therefore confined to its unprivileged UID.
 */
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = '/var/lib/my-opencode-guest-runtime';
const GUEST = /^[a-z][a-z0-9-]*$/;
const MAX_ENTRIES = 6000;
const MAX_BYTES = 128 * 1024 * 1024;

const ensureRootDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true, mode: 0o755 });
  const st = await fs.lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== 0) throw new Error('ROOT_GUEST_RUNTIME_DIR_UNTRUSTED');
  await fs.chmod(dir, 0o755);
};

const identity = (options) => {
  if (options?.uid !== undefined && options?.gid !== undefined) return { uid: options.uid, gid: options.gid };
  const rawUid = process.env.OPENCHAMBER_EXECUTION_UID;
  const rawGid = process.env.OPENCHAMBER_EXECUTION_GID;
  const uid = Number(rawUid), gid = Number(rawGid);
  if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(gid) || gid < 1) {
    throw new Error('ROOT_GUEST_UID_REQUIRED');
  }
  return { uid, gid };
};

const inspectTree = async (src) => {
  let entries = 0, bytes = 0;
  const check = async (name) => {
    const st = await fs.lstat(name);
    if (st.isSymbolicLink() || !(st.isDirectory() || st.isFile()) || st.nlink > 1 && st.isFile()) {
      throw new Error('ROOT_GUEST_SOURCE_UNSAFE');
    }
    if (++entries > MAX_ENTRIES) throw new Error('ROOT_GUEST_TOO_MANY_FILES');
    if (st.isFile()) {
      bytes += st.size;
      if (bytes > MAX_BYTES) throw new Error('ROOT_GUEST_TOO_LARGE');
    }
    if (st.isDirectory()) for (const child of await fs.readdir(name)) await check(path.join(name, child));
  };
  await check(src);
};

const makeMirror = async (src, destination) => {
  const stage = destination + '.new-' + randomBytes(6).toString('hex');
  await inspectTree(src);
  try {
    await fs.cp(src, stage, { recursive: true, force: false, errorOnExist: true, dereference: false });
    const sanitize = async (dir) => {
      const st = await fs.lstat(dir);
      if (st.isSymbolicLink()) throw new Error('ROOT_GUEST_SNAPSHOT_SYMLINK');
      if (st.isDirectory()) {
        await fs.chmod(dir, 0o755);
        for (const child of await fs.readdir(dir)) await sanitize(path.join(dir, child));
      } else if (st.isFile()) await fs.chmod(dir, 0o644 | (st.mode & 0o111));
      else throw new Error('ROOT_GUEST_SNAPSHOT_SPECIAL_FILE');
    };
    await sanitize(stage);
    // Snapshot replacement may occur only after the previous process stopped.
    const old = destination + '.old-' + randomBytes(6).toString('hex');
    if (fssync.existsSync(destination)) await fs.rename(destination, old);
    try { await fs.rename(stage, destination); }
    catch (e) {
      if (fssync.existsSync(old)) await fs.rename(old, destination);
      throw e;
    }
    if (fssync.existsSync(old)) await fs.rm(old, { recursive: true, force: true });
  } finally { await fs.rm(stage, { recursive: true, force: true }).catch(() => {}); }
};

const copyGuestData = async (source, destination, uid, gid) => {
  if (fssync.existsSync(destination)) {
    const st = await fs.lstat(destination);
    if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== uid) throw new Error('ROOT_GUEST_DATA_UNTRUSTED');
    return;
  }
  const stage = destination + '.new-' + randomBytes(6).toString('hex');
  try {
    if (fssync.existsSync(source)) {
      await inspectTree(source);
      await fs.cp(source, stage, { recursive: true, force: false, errorOnExist: true, dereference: false });
    } else await fs.mkdir(stage, { mode: 0o700 });
    const changeOwner = async (name) => {
      const st = await fs.lstat(name);
      if (st.isSymbolicLink()) throw new Error('ROOT_GUEST_DATA_SYMLINK');
      if (st.isDirectory()) {
        for (const child of await fs.readdir(name)) await changeOwner(path.join(name, child));
        await fs.chown(name, uid, gid); await fs.chmod(name, 0o700);
      } else {
        if (!st.isFile()) throw new Error('ROOT_GUEST_DATA_SPECIAL_FILE');
        await fs.chown(name, uid, gid); await fs.chmod(name, 0o600);
      }
    };
    await changeOwner(stage);
    await fs.rename(stage, destination);
  } finally { await fs.rm(stage, { recursive: true, force: true }).catch(() => {}); }
};

/**
 * Production only calls this from a root OpenChamber service with verified
 * process credentials. Options are an injectable test seam, NOT a route input.
 */
export async function prepareRootGuestService({ guestId, packageRoot, entry, dataDir }, options = {}) {
  if (!GUEST.test(guestId)) throw new Error('ROOT_GUEST_INVALID_ID');
  const { uid, gid } = identity(options);
  const root = options.root ?? ROOT;
  const source = path.resolve(packageRoot);
  const absoluteEntry = path.resolve(source, entry);
  if (!absoluteEntry.startsWith(source + path.sep) || !(await fs.stat(absoluteEntry)).isFile()) {
    throw new Error('ROOT_GUEST_ENTRY_OUTSIDE_PACKAGE');
  }
  await ensureRootDir(root);
  const codeRoot = path.join(root, 'packages'), dataRoot = path.join(root, 'data');
  await ensureRootDir(codeRoot); await ensureRootDir(dataRoot);
  const codeTarget = path.join(codeRoot, guestId);
  const dataTarget = path.join(dataRoot, guestId);
  await makeMirror(source, codeTarget);
  await copyGuestData(dataDir, dataTarget, uid, gid);
  const mappedEntry = path.join(codeTarget, path.relative(source, absoluteEntry));
  if (!(await fs.stat(mappedEntry)).isFile()) throw new Error('ROOT_GUEST_MIRROR_ENTRY_MISSING');
  return { packageRoot: codeTarget, entry: mappedEntry, dataDir: dataTarget };
}

export async function removeRootGuestServiceData(id, options = {}) {
  if (!GUEST.test(id)) throw new Error('ROOT_GUEST_INVALID_ID');
  const root = options.root ?? ROOT;
  // Parent is root-owned. A plugin cannot replace it to redirect deletion.
  const dataRoot = path.join(root, 'data');
  if (!fssync.existsSync(dataRoot)) return;
  const st = await fs.lstat(dataRoot);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== 0) throw new Error('ROOT_GUEST_RUNTIME_DIR_UNTRUSTED');
  await fs.rm(path.join(dataRoot, id), { recursive: true, force: true });
}
