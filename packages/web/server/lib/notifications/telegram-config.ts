import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

import { hasErrorCode } from '../guests/input-guards.js';
import type { TelegramSender } from './telegram-runtime.js';

type TelegramConfig = { version: 1; enabled: boolean; botToken: string; defaultAlias: string; sender: TelegramSender };
type PublicTelegramConfig = Omit<TelegramConfig, 'version' | 'botToken'> & { hasBotToken: boolean };

export const createTelegramConfig = (filePath: string) => {
  let writes: Promise<PublicTelegramConfig | void> = Promise.resolve();
  const read = async (): Promise<TelegramConfig> => {
    try {
      const raw = z.object({
        version: z.literal(1), enabled: z.boolean(),
        botToken: z.string().optional(), defaultAlias: z.string().optional(),
        sender: z.enum(['legacy', 'sdk', 'paused']).optional(),
      }).parse(JSON.parse(await readFile(filePath, 'utf8')));
      return { version: 1, enabled: raw.enabled, botToken: raw.botToken || '', defaultAlias: raw.defaultAlias || '', sender: raw.sender || 'legacy' };
    } catch (error) {
      if (hasErrorCode(error) && error.code === 'ENOENT') return { version: 1, enabled: false, botToken: '', defaultAlias: '', sender: 'legacy' };
      throw error;
    }
  };
  const update = (patch: Partial<Omit<TelegramConfig, 'version'>>) => {
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
