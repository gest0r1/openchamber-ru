import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createTelegramConfig } from './telegram-config.js';

test('interrupted sender cutover restores legacy without losing credentials or configuration', async () => {
  const root = await mkdtemp(join(tmpdir(), 'telegram-sender-recovery-'));
  try {
    const path = join(root, 'telegram-config.json');
    const previous = createTelegramConfig(path);
    await previous.update({
      enabled: true, botToken: '12345:disposable-test-token',
      defaultAlias: 'test-team', sender: 'paused',
    });
    // Simulate process restart: a fresh runtime reads the durable config.
    const restarted = createTelegramConfig(path);
    expect(await restarted.recoverInterruptedSwitch()).toBe(true);
    expect(await restarted.read()).toEqual({
      version: 1, enabled: true, botToken: '12345:disposable-test-token',
      defaultAlias: 'test-team', sender: 'legacy',
    });
    expect(await restarted.recoverInterruptedSwitch()).toBe(false);

    // A completed SDK cutover is not undone by an ordinary restart.
    await restarted.update({ sender: 'sdk' });
    expect(await createTelegramConfig(path).recoverInterruptedSwitch()).toBe(false);
    expect((await restarted.read()).sender).toBe('sdk');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
