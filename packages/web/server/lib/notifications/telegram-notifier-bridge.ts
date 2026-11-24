import { readTelegramSessionData, telegramPendingRequests, telegramSessionRecord } from '../guests/session-completion-proof.js';
import type { createSessionCompletionProof, IdleRecord, TelegramSession, TelegramSourceFor } from '../guests/session-completion-proof.js';
import type { createTelegramRuntime } from './telegram-runtime.js';
import type { createTelegramConfig } from './telegram-config.js';

type AttentionInput = TelegramSession & { kind: 'form' | 'permission' | 'page'; id: string };
type DeliveryRequest = TelegramSession & { idleId: string; outcome: IdleRecord['outcome'] };
type BridgeOptions = {
  telegram: ReturnType<typeof createTelegramRuntime>;
  config: ReturnType<typeof createTelegramConfig>;
  sourceFor?: TelegramSourceFor;
  listWaitingPages?: (sessionId: string, spaceId?: string | null) => string[] | null;
};

export const createTelegramNotifierBridge = ({ telegram, config, sourceFor = () => null, listWaitingPages = () => [] }: BridgeOptions) => {
  const active = async () => {
    const settings = await config.read();
    return settings.enabled === true && settings.sender === 'sdk';
  };
  const subscriptions = async () => {
    if (!await active()) return { active: false, subscriptions: [] };
    const rows = await telegram.listSubscriptions();
    return { active: true, subscriptions: rows.map((row) => ({
      sessionId: row.sessionId, directory: row.directory, spaceId: row.spaceId ?? null,
      scope: row.scope ?? 'session', createdAt: row.createdAt ?? 0,
      baselineIdleId: row.baselineIdleId ?? null,
    })) };
  };

  const deliver = async (input: DeliveryRequest, proof: ReturnType<typeof createSessionCompletionProof>) => {
    if (!await active()) return { delivered: false };
    const { sessionId, directory, spaceId = null, idleId, outcome } = input;
    const sub = await telegram.getSubscription(directory, sessionId);
    if (!sub || (sub.spaceId ?? null) !== spaceId || sub.baselineIdleId === idleId) return { delivered: false };
    const matches = async () => {
      if (!await active() || !await telegram.hasSubscription(directory, sessionId)) return false;
      const result = await proof({ sessionId, directory, spaceId });
      return result.kind === 'idle' && result.idle?.id === idleId &&
        result.idle?.outcome === outcome;
    };
    if (!await matches()) return { delivered: false };
    const delivered = await telegram.notify({
      directory, sessionId, sender: 'sdk',
      type: outcome === 'failed' ? 'error' : 'completed',
      eventKey: 'idle:' + idleId, canSend: matches,
    });
    return { delivered: delivered === true };
  };

  const readPending = async (item: TelegramSession) => {
    if (!await active()) return { known: false, items: [] };
    const sub = await telegram.getSubscription(item.directory, item.sessionId);
    if (!sub || (sub.spaceId ?? null) !== (item.spaceId ?? null)) return { known: false, items: [] };
    const source = sourceFor(item.spaceId ?? null);
    if (!source) return { known: false, items: [] };
    const path = '/api/session/' + encodeURIComponent(item.sessionId);
    const get = (route: string) => readTelegramSessionData(source, route);
    try {
      const record = telegramSessionRecord.safeParse(await get(path)).data;
      if (record?.id !== item.sessionId || record?.parentID || record?.location?.directory !== item.directory) {
        return { known: false, items: [] };
      }
      const [formData, permissionData] = await Promise.all([get(path + '/form'), get(path + '/permission')]);
      const forms = telegramPendingRequests.safeParse(formData);
      const permissions = telegramPendingRequests.safeParse(permissionData);
      if (!forms.success || !permissions.success) return { known: false, items: [] };
      const items: Pick<AttentionInput, 'kind' | 'id'>[] = [
        ...forms.data.map(({ id }) => ({ kind: 'form' as const, id })),
        ...permissions.data.map(({ id }) => ({ kind: 'permission' as const, id })),
      ];
      const pageIds = listWaitingPages(item.sessionId, item.spaceId);
      if (!Array.isArray(pageIds)) return { known: false, items: [] };
      for (const id of pageIds) if (id) items.push({ kind: 'page', id });
      return { known: true, items };
    } catch { return { known: false, items: [] }; }
  };

  const deliverAttention = async (input: AttentionInput) => {
    if (!await active()) return { delivered: false };
    const current = await readPending(input);
    if (!current.known || !current.items.some((row) => row.kind === input.kind && row.id === input.id)) {
      return { delivered: false };
    }
    const stillWaiting = async () => {
      const latest = await readPending(input);
      return latest.known && latest.items.some((row) => row.kind === input.kind && row.id === input.id);
    };
    return { delivered: await telegram.notify({
      directory: input.directory, sessionId: input.sessionId, sender: 'sdk',
      type: 'needs_input', eventKey: input.kind + ':' + input.id,
      canSend: stillWaiting,
    }) === true };
  };

  return { subscriptions, deliver, attention: readPending, deliverAttention };
};
