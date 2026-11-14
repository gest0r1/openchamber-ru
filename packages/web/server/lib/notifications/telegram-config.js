import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

export const createTelegramConfig = (filePath) => {
  let writes = Promise.resolve();
  const read = async () => {
    try {
      const raw = z.object({
        version: z.literal(1), enabled: z.boolean(),
        botToken: z.string().optional(), defaultAlias: z.string().optional(),
        sender: z.enum(['legacy', 'sdk', 'paused']).optional(),
      }).parse(JSON.parse(await readFile(filePath, 'utf8')));
      return { version: 1, enabled: raw.enabled, botToken: raw.botToken || '', defaultAlias: raw.defaultAlias || '', sender: raw.sender || 'legacy' };
    } catch (error) {
      if (error?.code === 'ENOENT') return { version: 1, enabled: false, botToken: '', defaultAlias: '', sender: 'legacy' };
      throw error;
    }
  };
  const update = (patch) => {
    const task = writes.then(async () => {
      const old = await read();
      const next = { ...old, ...patch };
      await mkdir(dirname(filePath), { recursive: true });
      const temp = filePath + '.' + process.pid + '.tmp';
      await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await rename(temp, filePath);
      return { enabled: next.enabled, defaultAlias: next.defaultAlias, hasBotToken: Boolean(next.botToken), sender: next.sender };
    });
    writes = task.catch(() => {});
    return task;
  };
  // A crash can interrupt legacy -> paused -> sdk. An unowned paused state
  // must never persist across restarts: no SDK sender has been admitted yet.
  // Restore the previous safe legacy owner before starting its watcher.
  const recoverInterruptedSwitch = async () => {
    if ((await read()).sender !== 'paused') return false;
    await update({ sender: 'legacy' });
    return true;
  };
  const publicConfig = async () => {
    const settings = await read();
    return { enabled: settings.enabled, defaultAlias: settings.defaultAlias, hasBotToken: Boolean(settings.botToken), sender: settings.sender };
  };
  return { read, update, publicConfig, recoverInterruptedSwitch };
};
