import { describe, expect, test, vi } from 'vitest';
import { createTelegramNotifierBridge } from './telegram-notifier-bridge.js';

const create = ({ sender = 'sdk', title = 'Idle', baselineIdleId = 'idle-old' } = {}) => {
  const telegram = {
    listSubscriptions: vi.fn(async () => [{
      sessionId: 'ses_1', directory: '/repo', spaceId: null,
      createdAt: 101, scope: 'session', baselineIdleId,
    }]),
    getSubscription: vi.fn(async () => ({ spaceId: null, baselineIdleId, opted_in: true })),
    hasSubscription: vi.fn(async () => true),
    notify: vi.fn(async ({ canSend }) => Boolean(await canSend())),
  };
  const config = { read: vi.fn(async () => ({ enabled: true, sender })) };
  const sourceFor = () => ({
    buildOpenCodeUrl: (route) => 'http://local' + route,
    getOpenCodeAuthHeaders: () => ({}),
    fetchImpl: vi.fn(async (url) => Response.json((() => {
      const path = new URL(url).pathname;
      if (path === '/api/session/ses_1') return { data: { id: 'ses_1', title, parentID: null, location: { directory: '/repo' } } };
      if (path.endsWith('/form')) return { data: [{ id: 'form-1' }] };
      if (path.endsWith('/permission')) return { data: [] };
      return {};
    })())),
  });
  const bridge = createTelegramNotifierBridge({ telegram, config, sourceFor, listWaitingPages: () => ['page-1'] });
  return { bridge, telegram, config };
};

describe('SDK Telegram sender fence', () => {
  test('legacy owner never gives a plugin subscriptions or sends', async () => {
    const { bridge, telegram } = create({ sender: 'legacy' });
    expect(await bridge.subscriptions()).toEqual({ active: false, subscriptions: [] });
    expect(await bridge.deliver({ sessionId: 'ses_1', directory: '/repo',
      idleId: 'idle-new', outcome: 'succeeded' }, async () => ({ kind: 'idle', idle: { id: 'idle-new', outcome: 'succeeded' } })))
      .toEqual({ delivered: false });
    expect(telegram.notify).not.toHaveBeenCalled();
  });
  test('read-only terminal proof is revalidated before every Bot API send', async () => {
    const { bridge, telegram } = create();
    const proof = vi.fn(async () => ({ kind: 'idle', idle: { id: 'idle-new', outcome: 'succeeded' } }));
    expect(await bridge.deliver({ sessionId: 'ses_1', directory: '/repo',
      idleId: 'idle-new', outcome: 'succeeded' }, proof)).toEqual({ delivered: true });
    expect(proof).toHaveBeenCalledTimes(2);
    expect(telegram.notify.mock.calls[0][0]).toMatchObject({
      sender: 'sdk', type: 'completed', eventKey: 'idle:idle-new',
    });
  });
  test('old baseline, unknown result or a wrong space never triggers delivery', async () => {
    const { bridge, telegram } = create();
    const proof = vi.fn(async () => ({ kind: 'unknown' }));
    for (const item of [
      { sessionId: 'ses_1', directory: '/repo', idleId: 'idle-old', outcome: 'succeeded' },
      { sessionId: 'ses_1', directory: '/repo', idleId: 'idle-new', outcome: 'succeeded' },
      { sessionId: 'ses_1', directory: '/repo', spaceId: 'other', idleId: 'idle-new', outcome: 'succeeded' },
    ]) {
      expect(await bridge.deliver(item, proof)).toEqual({ delivered: false });
    }
    expect(telegram.notify).not.toHaveBeenCalled();
  });
  test('reconstructs pending form/permission/page IDs without sending text or credentials', async () => {
    const { bridge, telegram } = create();
    expect(await bridge.attention({ sessionId: 'ses_1', directory: '/repo' })).toEqual({
      known: true, items: [{ kind: 'form', id: 'form-1' }, { kind: 'page', id: 'page-1' }],
    });
    expect(await bridge.deliverAttention({ sessionId: 'ses_1', directory: '/repo', kind: 'form', id: 'form-1' }))
      .toEqual({ delivered: true });
    expect(telegram.notify.mock.calls[0][0]).toMatchObject({
      sender: 'sdk', type: 'needs_input', eventKey: 'form:form-1',
    });
    expect(await bridge.deliverAttention({ sessionId: 'ses_1', directory: '/repo', kind: 'form', id: 'settled' }))
      .toEqual({ delivered: false });
  });
});
