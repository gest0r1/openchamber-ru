import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hasErrorCode } from './input-guards.js';

const CONFIG_MAX_BYTES = 64 * 1024;

export async function preserveServerBrowserConfig(guestId: string, currentRoot: string, nextRoot: string) {
  if (guestId !== 'server-browser') return;
  const source = await fs.open(path.join(currentRoot, 'config.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    .catch((error: Error) => {
      if (hasErrorCode(error) && error.code === 'ENOENT') return null;
      throw error;
    });
  if (!source) return;

  let contents: Buffer;
  try {
    const stat = await source.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > CONFIG_MAX_BYTES
        || (process.getuid?.() === 0 && (stat.uid !== 0 || (stat.mode & 0o022) !== 0))) {
      throw new Error('Server Browser configuration is not a trusted regular file');
    }
    contents = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await source.read(contents, 0, contents.length, 0);
    if (bytesRead !== stat.size) throw new Error('Server Browser configuration changed during update');
    contents = contents.subarray(0, bytesRead);
  } finally {
    await source.close();
  }

  const destination = path.join(nextRoot, 'config.json');
  await fs.rm(destination, { force: true });
  await fs.writeFile(destination, contents, { flag: 'wx', mode: 0o600 });
}
