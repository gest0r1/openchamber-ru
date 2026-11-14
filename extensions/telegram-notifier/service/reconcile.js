/**
 * Event callbacks are hints: SDK delivery is at-most-once. Durable catch-up
 * rechecks every opted-in session, using host terminal proof and host's unique
 * Bot API ledger. Nothing in this extension contains a Telegram token.
 */
export const createNotifierReconciler = ({ host, onError = () => {} }) => {
  let running = null;
  let lastSweep = null;
  let sweeps = 0;
  const reconcile = () => {
    if (running) return running;
    const task = (async () => {
      const { active, subscriptions } = await host.subscriptions();
      if (!active) return;
      // Limit concurrent host probes to avoid scanning many old sessions at once.
      let offset = 0;
      const worker = async () => {
        while (offset < subscriptions.length) {
          const item = subscriptions[offset++];
          try {
            const proof = await host.completion(item);
            if (proof?.kind !== 'idle' || !proof.idle || proof.idle.id === item.baselineIdleId) continue;
            if (!['succeeded', 'failed'].includes(proof.idle.outcome)) continue;
            await host.deliver({
              sessionId: item.sessionId, directory: item.directory,
              ...(item.spaceId ? { spaceId: item.spaceId } : {}),
              idleId: proof.idle.id, outcome: proof.idle.outcome,
            });
          } catch (error) { onError(error); }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, subscriptions.length) }, worker));
    })();
    running = task;
    return task.finally(() => {
      if (running === task) running = null;
      lastSweep = Date.now(); sweeps++;
    });
  };
  return { reconcile, status: () => ({ running: running !== null, lastSweep, sweeps }) };
};
