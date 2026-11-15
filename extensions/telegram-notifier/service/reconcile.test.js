import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotifierReconciler } from './reconcile.js';

const root = (override = {}) => ({
  sessionId: 'ses_root', directory: '/repo', spaceId: null,
  baselineIdleId: 'idle_old', createdAt: 1, scope: 'session', ...override,
});
const setup = (options = {}) => {
  const deliveries = []; const completed = [];
  const host = {
    subscriptions: async () => ({ active: options.active !== false, subscriptions: options.subscriptions ?? [root()] }),
    completion: async (entry) => { completed.push(entry.sessionId); return options.proof ?? { kind: 'idle', idle: { id: 'idle_new', outcome: 'succeeded' } }; },
    deliver: async (entry) => { deliveries.push(entry); return { delivered: true }; },
    attention: async () => ({ known: true, items: [] }),
    deliverAttention: async () => ({ delivered: true }),
  };
  return { notifier: createNotifierReconciler({ host }), deliveries, completed };
};
test('catch-up delivers a new terminal checkpoint even without SDK event', async () => {
  const { notifier, deliveries } = setup();
  await notifier.reconcile();
  assert.deepEqual(deliveries, [{
    sessionId: 'ses_root', directory: '/repo', idleId: 'idle_new', outcome: 'succeeded',
  }]);
  assert.equal(notifier.status().sweeps, 1);
});
test('legacy ownership prevents SDK sends', async () => {
  const { notifier, deliveries, completed } = setup({ active: false });
  await notifier.reconcile();
  assert.equal(deliveries.length, 0); assert.equal(completed.length, 0);
});
test('initial idle baseline and unknown proof never trigger delivery', async () => {
  const same = setup({ proof: { kind: 'idle', idle: { id: 'idle_old', outcome: 'succeeded' } } });
  await same.notifier.reconcile();
  assert.equal(same.deliveries.length, 0);
  const unknown = setup({ proof: { kind: 'unknown', reason: 'shells-unavailable' } });
  await unknown.notifier.reconcile();
  assert.equal(unknown.deliveries.length, 0);
});
test('failed terminal checkpoint is classified as failed, not successful', async () => {
  const { notifier, deliveries } = setup({ proof: { kind: 'idle', idle: { id: 'idle_error', outcome: 'failed' } } });
  await notifier.reconcile();
  assert.equal(deliveries[0].outcome, 'failed');
});
test('one unreadable subscription does not prevent other sessions from reconciling', async () => {
  const errors = [];
  const delivered = [];
  const host = {
    subscriptions: async () => ({ active: true, subscriptions: [root({ sessionId: 'bad' }), root({ sessionId: 'good' })] }),
    completion: async (entry) => {
      if (entry.sessionId === 'bad') throw new Error('read unavailable');
      return { kind: 'idle', idle: { id: 'new', outcome: 'succeeded' } };
    },
    deliver: async (entry) => { delivered.push(entry.sessionId); return { delivered: true }; },
    attention: async () => ({ known: true, items: [] }),
    deliverAttention: async () => ({ delivered: true }),
  };
  await createNotifierReconciler({ host, onError: (e) => errors.push(e.message) }).reconcile();
  assert.deepEqual(errors, ['read unavailable']);
  assert.deepEqual(delivered, ['good']);
});
test('concurrent sweeps share one in-flight attempt', async () => {
  let resolve; let calls = 0;
  const host = { subscriptions: async () => { calls++; await new Promise((done) => { resolve = done; }); return { active: false, subscriptions: [] }; } };
  const notifier = createNotifierReconciler({ host });
  const first = notifier.reconcile(); const second = notifier.reconcile();
  assert.equal(calls, 1);
  resolve();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});
