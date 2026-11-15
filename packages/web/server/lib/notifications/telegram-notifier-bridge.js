/**
 * One SDK notifier owns deciding when to alert. The host retains only the
 * existing outbound Bot API transport, credentials and durable dedupe ledger.
 */
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';

export const createTelegramNotifierBridge = ({ telegram, config, sourceFor = () => null, listWaitingPages = () => [] }) => {
  const active = async () => {
    const settings = await config.read();
    return settings.enabled === true && settings.sender === 'sdk';
  };
  const scopeMatches = (sub, spaceId) => sub && (sub.spaceId ?? null) === (spaceId ?? null);
  const subscriptions = async () => {
    if (!await active()) return { active: false, subscriptions: [] };
    const rows = await telegram.listSubscriptions();
    return { active: true, subscriptions: rows.map((row) => ({
      sessionId: row.sessionId, directory: row.directory, spaceId: row.spaceId ?? null,
      scope: row.scope ?? 'session', createdAt: row.createdAt ?? 0,
      baselineIdleId: row.baselineIdleId ?? null,
    })) };
  };

  const deliver = async (input, proof) => {
    if (!await active()) return { delivered: false };
    const { sessionId, directory, spaceId = null, idleId, outcome } = input;
    const sub = await telegram.getSubscription(directory, sessionId);
    if (!scopeMatches(sub, spaceId) || sub.baselineIdleId === idleId) return { delivered: false };
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

  const readPending = async (item) => {
    if (!await active()) return { known: false, items: [] };
    const sub = await telegram.getSubscription(item.directory, item.sessionId);
    if (!scopeMatches(sub, item.spaceId)) return { known: false, items: [] };
    const source = sourceFor(item.spaceId ?? null);
    if (!source) return { known: false, items: [] };
    const get = async (route) => {
      const response = await source.fetchImpl(source.buildOpenCodeUrl(route, ''), {
        method: 'GET', headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('OpenCode read failed');
      return unwrapOpenCodeResponse(await response.json());
    };
    try {
      const record = await get('/api/session/' + encodeURIComponent(item.sessionId));
      if (record?.id !== item.sessionId || record?.parentID || record?.location?.directory !== item.directory) {
        return { known: false, items: [] };
      }
      const [forms, permissions] = await Promise.all([
        get('/api/session/' + encodeURIComponent(item.sessionId) + '/form'),
        get('/api/session/' + encodeURIComponent(item.sessionId) + '/permission'),
      ]);
      if (!Array.isArray(forms) || !Array.isArray(permissions)) return { known: false, items: [] };
      const items = [];
      for (const [kind, entries] of [['form', forms], ['permission', permissions]]) {
        for (const entry of entries) if (typeof entry?.id === 'string' && entry.id) items.push({ kind, id: entry.id });
      }
      const pageIds = listWaitingPages(item.sessionId, item.spaceId);
      if (!Array.isArray(pageIds)) return { known: false, items: [] };
      for (const id of pageIds) if (typeof id === 'string' && id) items.push({ kind: 'page', id });
      return { known: true, items };
    } catch { return { known: false, items: [] }; }
  };

  const deliverAttention = async (input) => {
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
