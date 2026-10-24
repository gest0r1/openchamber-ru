import { test, expect } from 'bun:test';
import { createTelegramApproval } from './telegram-approval.js';

test('an agent cannot approve its own Telegram send', async () => {
  const approval = createTelegramApproval({ timeoutMs: 120000 });
  const requested = approval.request({ sessionId: 'sess', alias: 'owner', text: 'Report', mode: 'document' });
  const pending = approval.list();
  expect(pending).toHaveLength(1);
  expect(pending[0].preview).toBe('Report');
  expect(approval.decide('unknown', true)).toBe(false);
  expect(approval.decide(pending[0].id, true)).toBe(true);
  expect(await requested).toBe(true);
  expect(approval.list()).toHaveLength(0);
  approval.stop();
});

test('a rejected or expired approval never sends Telegram content', async () => {
  const timers = new Map();
  let next = 0;
  const approval = createTelegramApproval({
    setTimer: (fn) => { const id = ++next; timers.set(id, fn); return id; },
    clearTimer: (id) => { timers.delete(id); },
  });
  const rejected = approval.request({ sessionId: 'sess', file: '/repo/report.md' });
  expect(approval.decide(approval.list()[0].id, false)).toBe(true);
  expect(await rejected).toBe(false);
  const expired = approval.request({ sessionId: 'sess', text: 'Hello' });
  expect(approval.list()).toHaveLength(1);
  for (const callback of timers.values()) callback();
  expect(await expired).toBe(false);
  expect(approval.list()).toHaveLength(0);
  approval.stop();
});
