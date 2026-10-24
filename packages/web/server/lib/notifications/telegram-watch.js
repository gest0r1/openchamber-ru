import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createSessionActivityProbe } from '../opencode/session-activity.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';

const QUIET_MS = 1500;
const RETRY_MS = [2000, 5000, 10000, 30000, 60000];
const keyOf = (entry) => JSON.stringify([entry.spaceId ?? null, entry.directory, entry.sessionId]);
const sessionIdOf = (event) => event?.properties?.sessionID ?? event?.properties?.sessionId ?? event?.properties?.info?.sessionID;
const delayFor = (attempt) => RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];

export const createTelegramWatch = ({
  filePath, telegram, sourceFor, dispatchPending = async () => [],
  isGoalActive = async () => false,
  isPageWaiting = () => false,
  readSettings, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout,
  now = Date.now,
}) => {
  const pending = new Map();
  const timers = new Map();
  const decisions = new Map();
  const eventRevisions = new Map();
  let loaded = null;
  let writes = Promise.resolve();
  let stopped = false;

  const persist = () => {
    const bytes = JSON.stringify({ version: 1, pending: [...pending.values()] });
    writes = writes.catch(() => {}).then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      const temp = filePath + '.' + process.pid + '.tmp';
      await writeFile(temp, bytes, { mode: 0o600 });
      await rename(temp, filePath);
    });
    return writes;
  };
  const load = () => {
    if (!loaded) loaded = readFile(filePath, 'utf8').then((raw) => {
      const file = JSON.parse(raw);
      if (file.version !== 1 || !Array.isArray(file.pending)) throw new Error('Invalid Telegram watch data');
      for (const item of file.pending) {
        if (!item || typeof item.directory !== 'string' || typeof item.sessionId !== 'string') continue;
        if (item.spaceId !== null && item.spaceId !== undefined && typeof item.spaceId !== 'string') continue;
        pending.set(keyOf(item), item);
      }
    }).catch(async (error) => {
      if (error?.code === 'ENOENT') return;
      if (error instanceof SyntaxError || error?.message === 'Invalid Telegram watch data') {
        const archived = filePath + '.corrupt-' + Date.now() + '-' + process.pid;
        // Preserve the damaged data for investigation rather than deleting it.
        await rename(filePath, archived);
        console.warn('[Telegram] damaged watch state was quarantined; awaiting reconciliation:', archived);
        return;
      }
      loaded = null;
      throw error;
    });
    return loaded;
  };
  const clear = (key) => {
    const timer = timers.get(key);
    if (timer) clearTimeoutImpl(timer);
    timers.delete(key);
  };
  const arm = (key, ms) => {
    if (stopped || !pending.has(key)) return;
    clear(key);
    const timer = setTimeoutImpl(() => {
      timers.delete(key);
      void check(key).catch((error) => {
        console.warn('[Telegram] completion verification failed:', error?.message ?? error);
        if (pending.has(key)) arm(key, 60000);
      });
    }, ms);
    timer.unref?.();
    timers.set(key, timer);
  };
  const fetchJson = async (source, path, query = {}) => {
    const url = source.buildOpenCodeUrl(path, '');
    const search = new URLSearchParams(query);
    const response = await source.fetchImpl(search.size ? url + '?' + search : url, {
      method: 'GET',
      headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('OpenCode status request failed');
    return unwrapOpenCodeResponse(await response.json());
  };
  const latestIdle = async (source, sessionId) => {
    // Fetch idle records directly. A long tool-heavy turn can have more than
    // 50 messages after the latest terminal record.
    const page = await fetchJson(source, '/api/session/' + encodeURIComponent(sessionId) + '/message', { limit: '1', order: 'desc', type: 'idle' });
    const rows = Array.isArray(page) ? page : page?.data;
    if (!Array.isArray(rows)) return null;
    const record = rows.find((item) => item?.type === 'idle');
    if (!record || typeof record.id !== 'string' ||
        !['succeeded', 'failed', 'interrupted'].includes(record.outcome)) return null;
    return record;
  };
  const attention = async (record, source) => {
    if (!source || !await telegram.hasSubscription(record.directory, record.sessionId)) return;
    // Poll each subscribed session, not only recently received events. This
    // reconstructs unanswered forms/permissions after a restart or SSE loss.
    for (const resource of ['form', 'permission']) {
      const url = '/api/session/' + encodeURIComponent(record.sessionId) + '/' + resource;
      const list = await fetchJson(source, url).catch(() => null);
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (typeof item?.id !== 'string' || !item.id) continue;
        // Fetch twice: a request may settle between reading the list and
        // preparing the notification. Unknown never means unanswered.
        const refreshed = await fetchJson(source, url).catch(() => null);
        if (!Array.isArray(refreshed) || !refreshed.some((active) => active?.id === item.id)) continue;
        if (pending.get(keyOf(record)) !== record) return;
        await telegram.notify({ directory: record.directory, sessionId: record.sessionId,
          type: 'needs_input', eventKey: resource + ':' + item.id });
      }
    }
  };
  const activity = async (record, source) => {
    const probe = createSessionActivityProbe({ ...source, timeoutMs: 10000 });
    const statuses = await probe.fetchActiveSessionStatuses();
    if (!statuses) return { kind: 'unknown' };
    if (statuses[record.sessionId]) return { kind: 'working', reason: 'session' };
    const descendants = await probe.hasWorkingDescendants(record.sessionId, statuses);
    if (descendants === null) return { kind: 'unknown' };
    if (descendants) return { kind: 'working', reason: 'descendant' };
    // A location-wide shell lock is conservative. OpenCode's shell list does
    // not guarantee a session owner, so an unrelated shell delays completion.
    const shells = await probe.hasRunningShells(record.sessionId, record.directory);
    if (shells === null) return { kind: 'unknown' };
    if (shells) return { kind: 'working', reason: 'shell' };
    const blocking = await probe.hasBlockingRequests(record.sessionId, record.directory);
    if (blocking === null) return { kind: 'unknown' };
    if (blocking) return { kind: 'working', reason: 'request' };
    const dispatched = await dispatchPending(record.spaceId, record.sessionId);
    if (!Array.isArray(dispatched)) return { kind: 'unknown' };
    if (dispatched.some((entry) => entry.parentSessionId === record.sessionId)) {
      return { kind: 'working', reason: 'dispatch' };
    }
    const idle = await latestIdle(source, record.sessionId).catch(() => null);
    return idle ? { kind: 'idle', idle } : { kind: 'unknown' };
  };
  const check = async (key) => {
    await load();
    const record = pending.get(key);
    if (!record || stopped) return;
    if (!await telegram.hasSubscription(record.directory, record.sessionId)) {
      pending.delete(key);
      await persist();
      return;
    }
    if ((await readSettings())?.telegramEnabled !== true) {
      arm(key, 60000);
      return;
    }
    const source = sourceFor(record.spaceId);
    if (source) await attention(record, source).catch((error) => {
      console.warn('[Telegram] input reconciliation failed:', error?.message ?? error);
    });
    if (pending.get(key) !== record || stopped) return;
    if (!record.armed) {
      const idle = source ? await latestIdle(source, record.sessionId).catch(() => null) : null;
      if (idle && record.baselineIdleId === undefined) record.baselineIdleId = idle.id;
      else if (idle && idle.id !== record.baselineIdleId) record.armed = true;
      await persist();
      if (!record.armed) { arm(key, 60000); return; }
    }
    // Goal Mode resumes the agent between idle transitions. Its settled
    // status, not an intermediate idle, allows the final notification.
    const goal = await isGoalActive(record.sessionId, record.spaceId).catch(() => null);
    if (goal !== false) {
      arm(key, 5000);
      return;
    }
    let state = { kind: 'unknown' };
    if (source) {
      try { state = await activity(record, source); } catch { /* retry */ }
    }
    // A parent may idle while a background result is on its way. Require a
    // subsequent terminal record after any confirmed background activity.
    if (state.kind === 'working' && state.reason !== 'shell') {
      // The parent will resume when a descendant, returned result or user
      // action settles. The current idle record is a temporary boundary.
      // A detached shell is different: it may finish without resuming the
      // parent, so a terminal idle is accepted once the shell disappears.
      if (!record.waitForNewIdle) {
        const previous = await latestIdle(source, record.sessionId).catch(() => null);
        record.requireNewIdle = previous?.id ?? null;
        record.waitForNewIdle = true;
      }
    }
    if (state.kind === 'idle') {
      const idle = state.idle;
      if (idle.outcome === 'interrupted') {
        // An interrupted turn must not alert as completed. Keep its checkpoint
        // so a later run can still be found after an event-stream disconnect.
        pending.set(key, { ...record, armed: false, baselineIdleId: idle.id,
          requireNewIdle: null, waitForNewIdle: false, attempt: 0 });
        await persist();
        arm(key, 60000);
        return;
      }
      if (record.baselineIdleId && idle.id === record.baselineIdleId) {
        record.attempt = (record.attempt || 0) + 1;
        await persist();
        arm(key, delayFor(record.attempt));
        return;
      }
      if (record.waitForNewIdle && record.requireNewIdle === idle.id) {
        record.attempt = (record.attempt || 0) + 1;
        await persist();
        arm(key, delayFor(record.attempt));
        return;
      }
      // Quiet recheck closes the usual race where a parent resumes just
      // after the first idle probe. Validate all gates and the same run.
      await new Promise((resolve) => { const timer = setTimeoutImpl(resolve, 500); timer.unref?.(); });
      if (pending.get(key) !== record || stopped) return;
      const confirmed = source ? await activity(record, source).catch(() => ({ kind: 'unknown' })) : { kind: 'unknown' };
      if (confirmed.kind !== 'idle' || confirmed.idle.id !== idle.id) {
        record.attempt = (record.attempt || 0) + 1;
        await persist();
        arm(key, delayFor(record.attempt));
        return;
      }
      // The delivery runtime checks this fence immediately before its HTTP
      // send as well as the subscription's opt-out state.
      const canSend = async () => {
        if (stopped || pending.get(key) !== record) return false;
        const current = source ? await activity(record, source).catch(() => ({ kind: 'unknown' })) : { kind: 'unknown' };
        return current.kind === 'idle' && current.idle.id === idle.id;
      };
      const delivered = await telegram.notify({
        directory: record.directory, sessionId: record.sessionId,
        type: idle.outcome === 'failed' ? 'error' : 'completed',
        eventKey: 'idle:' + idle.id,
        canSend,
      });
      if (delivered || !await telegram.hasSubscription(record.directory, record.sessionId)) {
        if (await telegram.hasSubscription(record.directory, record.sessionId)) {
          pending.set(key, { ...record, armed: false, baselineIdleId: idle.id,
            requireNewIdle: null, waitForNewIdle: false, attempt: 0 });
          await persist();
          arm(key, 60000);
        } else {
          pending.delete(key);
          await persist();
        }
        return;
      }
    }
    record.attempt = (record.attempt || 0) + 1;
    await persist();
    arm(key, delayFor(record.attempt));
  };
  const queue = async ({ sessionId, directory, spaceId = null }) => {
    await load();
    if (!sessionId || !directory || !await telegram.hasSubscription(directory, sessionId)) return;
    const entry = { sessionId, directory, spaceId, attempt: 0, createdAt: now() };
    const key = keyOf(entry);
    const existing = pending.get(key);
    // Keep the baseline and the background-work barrier across repeated idle events.
    pending.set(key, existing ? { ...existing, armed: true, attempt: 0 } : { ...entry, armed: true });
    await persist();
    arm(key, QUIET_MS);
  };
  const track = async ({ sessionId, directory, spaceId = null }) => {
    await load();
    const entry = { sessionId, directory, spaceId, attempt: 0, createdAt: now(), armed: false };
    const source = sourceFor(spaceId);
    const idle = source ? await latestIdle(source, sessionId).catch(() => null) : null;
    if (idle) entry.baselineIdleId = idle.id;
    else if (source) {
      // Distinguish a readable history with no idle from a failed read.
      // A subscriber who opts in while the first turn runs can recover
      // its completion even if the corresponding event gets lost.
      const page = await fetchJson(source, '/api/session/' + encodeURIComponent(sessionId) + '/message', { limit: '50', order: 'desc' }).catch(() => null);
      if (Array.isArray(page) || Array.isArray(page?.data)) entry.baselineIdleId = null;
    }
    const key = keyOf(entry);
    pending.set(key, entry);
    await persist();
    arm(key, 60000);
  };
  const cancel = async (sessionId, directory, spaceId = null) => {
    await load();
    const key = keyOf({ sessionId, directory, spaceId });
    pending.delete(key);
    clear(key);
    for (const [requestKey, timer] of decisions) {
      try {
        const [targetSpace, targetDirectory, targetSession] = JSON.parse(requestKey);
        if (targetSpace === spaceId && targetDirectory === directory && targetSession === sessionId) {
          clearTimeoutImpl(timer);
          decisions.delete(requestKey);
          eventRevisions.set(requestKey, (eventRevisions.get(requestKey) || 0) + 1);
        }
      } catch { /* invalid ephemeral key */ }
    }
    await persist();
  };
  const decision = (payload, spaceId, kind, requestId) => {
    const sessionId = sessionIdOf(payload);
    const directory = payload.properties?.directory;
    if (!sessionId || !directory || sessionId === 'global' || !requestId || !pending.has(keyOf({ sessionId, directory, spaceId }))) return;
    const key = JSON.stringify([spaceId, directory, sessionId, kind, requestId]);
    const revision = (eventRevisions.get(key) || 0) + 1;
    eventRevisions.set(key, revision);
    const old = decisions.get(key);
    if (old) clearTimeoutImpl(old);
    const timer = setTimeoutImpl(async () => {
      decisions.delete(key);
      try {
        const source = sourceFor(spaceId);
        if (!source) return;
        const session = await fetchJson(source, '/api/session/' + encodeURIComponent(sessionId)).catch(() => null);
        if (!session || session.parentID || eventRevisions.get(key) !== revision ||
          !pending.has(keyOf({ sessionId, directory, spaceId }))) return;
        if (kind === 'page' && !isPageWaiting(sessionId, requestId)) return;
        if (kind === 'form' || kind === 'permission') {
          const resource = kind === 'form' ? 'form' : 'permission';
          const requests = await fetchJson(source, '/api/session/' + encodeURIComponent(sessionId) + '/' + resource).catch(() => null);
          if (!Array.isArray(requests) || !requests.some((item) => item?.id === requestId)) return;
        }
        // A settlement arriving while a network read is in flight invalidates
        // its revision. Confirm immediately before entering the delivery gate.
        if (eventRevisions.get(key) !== revision ||
          !pending.has(keyOf({ sessionId, directory, spaceId })) ||
          (kind === 'page' && !isPageWaiting(sessionId, requestId))) return;
        await telegram.notify({ directory, sessionId, type: 'needs_input',
          eventKey: kind + ':' + requestId,
          canSend: async () => eventRevisions.get(key) === revision &&
            pending.has(keyOf({ sessionId, directory, spaceId })) &&
            (kind !== 'page' || isPageWaiting(sessionId, requestId)),
        });
      } catch (error) {
        console.warn('[Telegram] waiting-for-user notification failed:', error?.message ?? error);
      }
    }, 800);
    timer.unref?.();
    decisions.set(key, timer);
  };
  const settle = (payload, spaceId, kind, requestId) => {
    const sessionId = sessionIdOf(payload);
    const directory = payload.properties?.directory;
    if (!sessionId || !directory) return;
    const key = JSON.stringify([spaceId, directory, sessionId, kind, requestId]);
    const timer = decisions.get(key);
    if (timer) clearTimeoutImpl(timer);
    decisions.delete(key);
    eventRevisions.set(key, (eventRevisions.get(key) || 0) + 1);
  };
  const onEvent = (payload, { spaceId = null } = {}) => {
    if (!payload || typeof payload !== 'object') return;
    const sessionId = sessionIdOf(payload);
    let directory = payload.properties?.directory;
    // Some execution-status events contain a session id without its location.
    // The subscription checkpoint holds the verified session location. Use it
    // only when the session and space identify exactly one tracked record.
    if (!directory && sessionId) {
      const matches = [...pending.values()].filter((entry) =>
        entry.sessionId === sessionId && (entry.spaceId ?? null) === spaceId);
      if (matches.length === 1) {
        directory = matches[0].directory;
        payload = { ...payload, properties: { ...payload.properties, directory } };
      }
    }
    if (sessionId && directory && payload.type === 'session.deleted') {
      void (async () => {
        await telegram.unsubscribe(directory, sessionId);
        await cancel(sessionId, directory, spaceId);
      })().catch((error) => console.warn('[Telegram] session deletion cleanup failed:', error?.message ?? error));
      return;
    }
    if (sessionId && directory && payload.type === 'session.status' && payload.properties?.status?.type !== 'idle') {
      // Replace the record object synchronously to invalidate in-flight idle
      // verification before it reaches the outbound delivery gate.
      const key = keyOf({ sessionId, directory, spaceId });
      const previous = pending.get(key);
      if (previous) {
        pending.set(key, { ...previous, armed: false, baselineIdleId: previous.baselineIdleId });
        void persist().then(() => arm(key, 5000)).catch(() => {});
      }
    }
    if (sessionId && directory && payload.type === 'session.idle') {
      if (payload.properties?.aborted !== true) void queue({ sessionId, directory, spaceId }).catch(() => {});
      else void cancel(sessionId, directory, spaceId).catch(() => {});
    }
    if (sessionId && directory && payload.type === 'session.error') {
      void queue({ sessionId, directory, spaceId }).catch(() => {});
    }
    if (payload.type === 'form.created') decision(payload, spaceId, 'form', payload.properties?.form?.id);
    if (payload.type === 'permission.asked') decision(payload, spaceId, 'permission', payload.properties?.id ?? payload.properties?.requestID);
    if (payload.type === 'openchamber:page-waiting') decision(payload, spaceId, 'page', payload.properties?.page?.id);
    if (payload.type === 'form.settled') settle(payload, spaceId, 'form', payload.properties?.formID);
    if (payload.type === 'permission.replied') settle(payload, spaceId, 'permission', payload.properties?.requestID);
    if (payload.type === 'openchamber:page-settled') settle(payload, spaceId, 'page', payload.properties?.pageID);
  };
  const reconcileAll = () => {
    for (const key of pending.keys()) arm(key, 1000);
  };
  const start = async () => {
    await load();
    reconcileAll();
  };
  const stop = () => {
    stopped = true;
    for (const key of timers.keys()) clear(key);
    for (const timer of decisions.values()) clearTimeoutImpl(timer);
    decisions.clear();
  };
  return { start, stop, reconcileAll, onEvent, track, queue, cancel, pendingCount: () => pending.size };
};
