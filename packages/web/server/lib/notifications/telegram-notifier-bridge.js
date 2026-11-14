/**
 * The SDK notifier owns *deciding when* to alert. The host retains one shared
 * outgoing Bot API transport/ledger, so manual Telegram sends and credentials
 * remain unchanged. Only a proof-checked idle checkpoint can cross this bridge.
 */
export const createTelegramNotifierBridge = ({ telegram, config }) => {
  const active = async () => (await config.read()).enabled === true && (await config.read()).sender === 'sdk';

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
    if (!sub || (sub.spaceId ?? null) !== spaceId || sub.baselineIdleId === idleId) return { delivered: false };
    const matches = async () => {
      if (!await active() || !await telegram.hasSubscription(directory, sessionId)) return false;
      const result = await proof({ sessionId, directory, spaceId });
      return result.kind === 'idle' && result.idle?.id === idleId &&
        result.idle?.outcome === outcome;
    };
    // A stale at-most-once SDK event must never bypass terminal revalidation.
    if (!await matches()) return { delivered: false };
    const delivered = await telegram.notify({
      directory, sessionId, sender: 'sdk',
      type: outcome === 'failed' ? 'error' : 'completed',
      eventKey: 'idle:' + idleId, canSend: matches,
    });
    return { delivered: delivered === true };
  };

  return { subscriptions, deliver };
};
