import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

type GuestIdentity = { uid: number; gid: number };
type GuestRuntimeOptions = Partial<GuestIdentity> & { root?: string };
type GuestPackage = { guestId: string; packageRoot: string; entry: string; dataDir: string };

const ROOT = '/var/lib/my-opencode-guest-runtime';
const GUEST = /^[a-z][a-z0-9-]*$/;
const MAX_ENTRIES = 6000;
const MAX_BYTES = 128 * 1024 * 1024;

const ensureRootDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true, mode: 0o755 });
  const st = await fs.lstat(dir);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== 0) throw new Error('ROOT_GUEST_RUNTIME_DIR_UNTRUSTED');
  await fs.chmod(dir, 0o755);
};

const identity = (options: GuestRuntimeOptions): GuestIdentity => {
  if (options?.uid !== undefined && options?.gid !== undefined) return { uid: options.uid, gid: options.gid };
  const rawUid = process.env.OPENCHAMBER_EXECUTION_UID;
  const rawGid = process.env.OPENCHAMBER_EXECUTION_GID;
  const uid = Number(rawUid), gid = Number(rawGid);
  if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(gid) || gid < 1) {
    throw new Error('ROOT_GUEST_UID_REQUIRED');
  }
  return { uid, gid };
};

const assertRootOwnedSource = async (source: string) => {
  let current = path.resolve(source);
  while (true) {
    const st = await fs.lstat(current);
    if (st.isSymbolicLink() || st.uid !== 0 || (st.mode & 0o022)) {
      throw new Error('ROOT_GUEST_SOURCE_UNTRUSTED');
    }
    if (current === path.parse(current).root) break;
    current = path.dirname(current);
  }
};

const inspectTree = async (src: string) => {
  let entries = 0, bytes = 0;
  const check = async (name: string): Promise<void> => {
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

const makeMirror = async (src: string, destination: string) => {
  const stage = destination + '.new-' + randomBytes(6).toString('hex');
  await inspectTree(src);
  try {
    await fs.cp(src, stage, { recursive: true, force: false, errorOnExist: true, dereference: false });
    const sanitize = async (dir: string): Promise<void> => {
      const st = await fs.lstat(dir);
      if (st.isSymbolicLink()) throw new Error('ROOT_GUEST_SNAPSHOT_SYMLINK');
      if (st.isDirectory()) {
        await fs.chmod(dir, 0o755);
        for (const child of await fs.readdir(dir)) await sanitize(path.join(dir, child));
      } else if (st.isFile()) await fs.chmod(dir, 0o644 | (st.mode & 0o111));
      else throw new Error('ROOT_GUEST_SNAPSHOT_SPECIAL_FILE');
    };
    await sanitize(stage);
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

const copyGuestData = async (source: string, destination: string, uid: number, gid: number) => {
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
    const changeOwner = async (name: string): Promise<void> => {
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

export async function prepareRootGuestService({ guestId, packageRoot, entry, dataDir }: GuestPackage, options: GuestRuntimeOptions = {}) {
  if (!GUEST.test(guestId)) throw new Error('ROOT_GUEST_INVALID_ID');
  const { uid, gid } = identity(options);
  const root = options.root ?? ROOT;
  const source = path.resolve(packageRoot);
  if (options.root === undefined) await assertRootOwnedSource(source);
  const absoluteEntry = path.resolve(source, entry);
  if (!absoluteEntry.startsWith(source + path.sep) || !(await fs.stat(absoluteEntry)).isFile()) {
    throw new Error('ROOT_GUEST_ENTRY_OUTSIDE_PACKAGE');
  }
  await ensureRootDir(root);
  const codeRoot = path.join(root, 'packages'), dataRoot = path.join(root, 'data');
  await ensureRootDir(codeRoot); await ensureRootDir(dataRoot);
  const codeTarget = path.join(codeRoot, guestId);
  const dataTarget = path.join(dataRoot, guestId);
  if (options.root === undefined && fssync.existsSync(dataDir)) await assertRootOwnedSource(dataDir);
  await makeMirror(source, codeTarget);
  await copyGuestData(dataDir, dataTarget, uid, gid);
  const mappedEntry = path.join(codeTarget, path.relative(source, absoluteEntry));
  if (!(await fs.stat(mappedEntry)).isFile()) throw new Error('ROOT_GUEST_MIRROR_ENTRY_MISSING');
  return { packageRoot: codeTarget, entry: mappedEntry, dataDir: dataTarget };
}

export async function removeRootGuestServiceData(id: string, options: Pick<GuestRuntimeOptions, 'root'> = {}) {
  if (!GUEST.test(id)) throw new Error('ROOT_GUEST_INVALID_ID');
  const root = options.root ?? ROOT;
  const dataRoot = path.join(root, 'data');
  if (!fssync.existsSync(dataRoot)) return;
  const st = await fs.lstat(dataRoot);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== 0) throw new Error('ROOT_GUEST_RUNTIME_DIR_UNTRUSTED');
  await fs.rm(path.join(dataRoot, id), { recursive: true, force: true });
}
