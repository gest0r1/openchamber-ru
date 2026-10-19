import { test, expect } from 'bun:test';
import { createNotificationTriggerRuntime } from './runtime.js';

const createHarness = ({ parentID = null, childActive = false, goalActive = false, telegramNotify = null } = {}) => {
  const delivered = [];
  const pushed = [];
  const runtime = createNotificationTriggerRuntime({
    readSettingsFromDisk: async () => ({
      notifyOnCompletion: false, notifyOnQuestion: false, notificationMode: 'hidden-only',
      nativeNotificationsEnabled: false,
    }),
    prepareNotificationLastMessage: async () => '',
    buildTemplateVariables: async () => ({}),
    extractLastMessageText: () => '',
    fetchLastAssistantMessageText: async () => '',
    resolveNotificationTemplate: () => '',
    shouldApplyResolvedTemplateMessage: () => false,
    emitDesktopNotification: () => false,
    broadcastUiNotification: () => {},
    sendPushToAllUiSessions: async (value) => { pushed.push(value); },
    sendApnsToAllUiSessions: async () => {},
    isAnyInteractiveClientVisible: () => true,
    getIsWindowFocused: () => true,
    getIsSessionAutoAccepting: async () => false,
    buildOpenCodeUrl: () => 'http://localhost:9999/api/session/id',
    getOpenCodeAuthHeaders: () => ({}),
    readSessionMetadata: async () => goalActive ? { openchamber: { goal: { status: 'active' } } } : null,
    fetchImpl: async () => ({
      ok: true, json: async () => ({ id: 'session', parentID }),
    }),
    activityProbe: {
      fetchActiveSessionStatuses: async () => ({}),
      hasWorkingChildren: async () => childActive,
    },
    telegramRuntime: {
      notify: async (payload) => { delivered.push(payload); return telegramNotify ? telegramNotify(payload) : true; },
    },
  });
  const event = (type, data = {}) => ({
    type,
    properties: { sessionID: 'session', directory: '/project', ...data },
  });
  return { runtime, delivered, pushed, event };
};

const flushTelegramDelivery = () => new Promise((resolve) => setTimeout(resolve, 20));

test('Telegram uses the ready trigger independently of UI focus and desktop settings', async () => {
  const { runtime, delivered, event } = createHarness();
  await runtime.maybeSendPushForTrigger(event('session.idle'));
  await flushTelegramDelivery();
  expect(delivered).toEqual([{ sessionId: 'session', directory: '/project', type: 'completed' }]);
});

test('A slow Telegram transport cannot delay notification trigger processing', async () => {
  let finishSend;
  const slowSend = new Promise((resolve) => { finishSend = resolve; });
  const { runtime, delivered, event } = createHarness({ telegramNotify: () => slowSend });
  try {
    const triggerFinished = await Promise.race([
      runtime.maybeSendPushForTrigger(event('session.idle')).then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 250)),
    ]);
    expect(triggerFinished).toBe(true);
    await flushTelegramDelivery();
    expect(delivered).toHaveLength(1);
  } finally {
    finishSend(true);
  }
});

test('Telegram does not send ready when a subagent is active', async () => {
  const { runtime, delivered, event } = createHarness({ childActive: true });
  await runtime.maybeSendPushForTrigger(event('session.idle'));
  await flushTelegramDelivery();
  expect(delivered).toHaveLength(0);
});

test('A child session cannot raise a Telegram question alert', async () => {
  const { runtime, delivered, event } = createHarness({ parentID: 'root' });
  await runtime.maybeSendPushForTrigger(event('form.created', { form: { title: 'Choose an option' } }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  await flushTelegramDelivery();
  expect(delivered).toHaveLength(0);
});

test('A root form question notifies even when other notification settings are off', async () => {
  const { runtime, delivered, event } = createHarness();
  await runtime.maybeSendPushForTrigger(event('form.created', { form: { title: 'Choose an option' } }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  await flushTelegramDelivery();
  expect(delivered).toEqual([{ sessionId: 'session', directory: '/project', type: 'needs_input' }]);
});

test('A permission answered during debounce is not sent to Telegram', async () => {
  const { runtime, delivered, event } = createHarness();
  await runtime.maybeSendPushForTrigger(event('permission.asked', { id: 'permission-1', action: 'read' }));
  await runtime.maybeSendPushForTrigger(event('permission.replied', { requestID: 'permission-1' }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  await flushTelegramDelivery();
  expect(delivered).toHaveLength(0);
});

test('A terminal error notifies an opted-in root', async () => {
  const { runtime, delivered, event } = createHarness();
  await runtime.maybeSendPushForTrigger(event('session.error', { error: { message: 'Failed' } }));
  await flushTelegramDelivery();
  expect(delivered).toEqual([{ sessionId: 'session', directory: '/project', type: 'error' }]);
});

test('A goal completion uses the shared notification trigger', async () => {
  const { runtime, delivered } = createHarness();
  await runtime.sendGoalSettlePush({ sessionId: 'session', directory: '/project', status: 'complete', title: 'Done', body: 'Finished' });
  await flushTelegramDelivery();
  expect(delivered).toEqual([{ sessionId: 'session', directory: '/project', type: 'completed' }]);
});
