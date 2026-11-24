import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { createSessionActivityProbe } from '../opencode/session-activity.js';
import { hasErrorCode, hasErrorMessage } from '../guests/input-guards.js';
import { latestTelegramIdle, readTelegramSessionData, telegramPendingRequests, telegramSessionRecord } from '../guests/session-completion-proof.js';
import type { DispatchPending, IdleRecord, TelegramGoalActive, TelegramSession, TelegramSource, TelegramSourceFor } from '../guests/session-completion-proof.js';
import type { createTelegramRuntime } from './telegram-runtime.js';

type WatchOptions = {
  filePath: string;
  telegram: ReturnType<typeof createTelegramRuntime>;
  sourceFor: TelegramSourceFor;
  dispatchPending?: DispatchPending;
  isGoalActive?: TelegramGoalActive;
  isPageWaiting?: (sessionId: string, requestId: string) => boolean;
  readSettings: () => Promise<{ telegramEnabled?: boolean }>;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  now?: () => number;
};
type Activity = { kind: 'unknown' } | { kind: 'working'; reason: string } | { kind: 'idle'; idle: IdleRecord };
const persistedEntrySchema = z.object({
  directory: z.string(), sessionId: z.string(), spaceId: z.string().nullish(),
  attempt: z.number().optional(), createdAt: z.number().optional(), armed: z.boolean().optional(),
  baselineIdleId: z.string().nullish(), requireNewIdle: z.string().nullish(), waitForNewIdle: z.boolean().optional(),
});
type WatchEntry = z.infer<typeof persistedEntrySchema>;
const requestIds = z.object({ id: z.string().optional() });
const eventSchema = z.object({
  type: z.string(),
  properties: z.object({
    sessionID: z.string().optional(), sessionId: z.string().optional(), directory: z.string().nullish(),
    info: z.object({ sessionID: z.string().optional() }).optional(),
    status: z.object({ type: z.string().optional() }).optional(), aborted: z.boolean().optional(),
    form: requestIds.optional(), page: requestIds.optional(), id: z.string().optional(),
    formID: z.string().optional(), pageID: z.string().optional(), requestID: z.string().optional(),
  }).optional(),
});
type WatchEvent = z.infer<typeof eventSchema>;
type RequestKind = 'form' | 'page' | 'permission';
const requestList = async (source: TelegramSource, route: string) =>
  telegramPendingRequests.safeParse(await readTelegramSessionData(source, route).catch(() => null)).data;


const QUIET_MS = 1500;
const RETRY_MS = [2000, 5000, 10000, 30000, 60000];
const STABLE_RECONCILE_MS = 5 * 60 * 1000;
const keyOf = (entry: TelegramSession) => JSON.stringify([entry.spaceId ?? null, entry.directory, entry.sessionId]);
const sessionIdOf = (event: WatchEvent) => event?.properties?.sessionID ?? event?.properties?.sessionId ?? event?.properties?.info?.sessionID;
const delayFor = (attempt: number) => RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)] ?? 60000;

export const createTelegramWatch = ({
  filePath, telegram, sourceFor, dispatchPending = async () => [],
  isGoalActive = async () => false,
  isPageWaiting = () => false,
  readSettings, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout,
  now = Date.now,
}: WatchOptions) => {
  const pending = new Map<string, WatchEntry>();
  const timers = new Map<string, NodeJS.Timeout>();
  const decisions = new Map<string, NodeJS.Timeout>();
  const eventRevisions = new Map<string, number>();
  let loaded: Promise<void> | null = null;
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
        const parsed = persistedEntrySchema.safeParse(item);
        if (parsed.success) pending.set(keyOf(parsed.data), parsed.data);
      }
    }).catch(async (error) => {
      if (hasErrorCode(error) && error.code === 'ENOENT') return;
      if (error instanceof SyntaxError || (hasErrorMessage(error) && error.message === 'Invalid Telegram watch data')) {
        const archived = filePath + '.corrupt-' + Date.now() + '-' + process.pid;
        await rename(filePath, archived);
        console.warn('[Telegram] damaged watch state was quarantined; awaiting reconciliation:', archived);
        return;
      }
      loaded = null;
      throw error;
    });
    return loaded;
  };
  const clear = (key: string) => {
    const timer = timers.get(key);
    if (timer) clearTimeoutImpl(timer);
    timers.delete(key);
  };
  const arm = (key: string, ms: number) => {
    if (stopped || !pending.has(key)) return;
    clear(key);
    const timer = setTimeoutImpl(() => {
      timers.delete(key);
      void check(key).catch((error) => {
        console.warn('[Telegram] completion verification failed:', hasErrorMessage(error) ? error.message : error);
        if (pending.has(key)) arm(key, 60000);
      });
    }, ms);
    timer.unref?.();
    timers.set(key, timer);
  };
  const attention = async (record: WatchEntry, source: TelegramSource) => {
    if (!source || !await telegram.hasSubscription(record.directory, record.sessionId)) return;
    for (const resource of ['form', 'permission']) {
      const url = '/api/session/' + encodeURIComponent(record.sessionId) + '/' + resource;
      const list = await requestList(source, url);
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!z.string().min(1).safeParse(item?.id).success) continue;
        const refreshed = await requestList(source, url);
        if (!Array.isArray(refreshed) || !refreshed.some((active) => active?.id === item.id)) continue;
        if (pending.get(keyOf(record)) !== record) return;
        await telegram.notify({ directory: record.directory, sessionId: record.sessionId,
          type: 'needs_input', eventKey: resource + ':' + item.id,
          canSend: async () => {
            if (stopped || pending.get(keyOf(record)) !== record) return false;
            const latest = await requestList(source, url);
            return Array.isArray(latest) && latest.some((value) => value?.id === item.id);
          },
        });
      }
    }
  };
  const activity = async (record: WatchEntry, source: TelegramSource): Promise<Activity> => {
    const probe = createSessionActivityProbe({ ...source, timeoutMs: 10000 });
    const statuses = await probe.fetchActiveSessionStatuses();
    if (!statuses) return { kind: 'unknown' };
    if (statuses[record.sessionId]) return { kind: 'working', reason: 'session' };
    const descendants = await probe.hasWorkingDescendants(record.sessionId, statuses, true);
    if (descendants === null) return { kind: 'unknown' };
    if (descendants) return { kind: 'working', reason: 'descendant' };
    const shells = await probe.hasRunningShells(record.directory);
    if (shells === null) return { kind: 'unknown' };
    if (shells) return { kind: 'working', reason: 'shell' };
    const blocking = await probe.hasBlockingRequests(record.sessionId, record.directory);
    if (blocking === null) return { kind: 'unknown' };
    if (blocking) return { kind: 'working', reason: 'request' };
    const dispatched = await dispatchPending(record.spaceId ?? null, record.sessionId);
    if (!Array.isArray(dispatched)) return { kind: 'unknown' };
    if (dispatched.some((entry) => entry.parentSessionId === record.sessionId)) {
      return { kind: 'working', reason: 'dispatch' };
    }
    const idle = await latestTelegramIdle(source, record.sessionId).catch(() => null);
    return idle ? { kind: 'idle', idle } : { kind: 'unknown' };
  };
  const check = async (key: string) => {
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
    const source = sourceFor(record.spaceId ?? null);
    if (source) await attention(record, source).catch((error) => {
      console.warn('[Telegram] input reconciliation failed:', hasErrorMessage(error) ? error.message : error);
    });
    if (pending.get(key) !== record || stopped) return;
    if (!record.armed) {
      const idle = source ? await latestTelegramIdle(source, record.sessionId).catch(() => null) : null;
      if (idle && record.baselineIdleId === undefined) record.baselineIdleId = idle.id;
      else if (idle && idle.id !== record.baselineIdleId) record.armed = true;
      await persist();
      if (!record.armed) { arm(key, STABLE_RECONCILE_MS); return; }
    }
    const goal = await isGoalActive(record.sessionId, record.spaceId ?? null).catch(() => null);
    if (goal !== false) {
      arm(key, 5000);
      return;
    }
    let state: Activity = { kind: 'unknown' };
    if (source) {
      try { state = await activity(record, source); } catch { void 0; }
    }
    if (source && state.kind === 'working' && state.reason !== 'shell') {
      if (!record.waitForNewIdle) {
        const previous = await latestTelegramIdle(source, record.sessionId).catch(() => null);
        record.requireNewIdle = previous?.id ?? null;
        record.waitForNewIdle = true;
      }
    }
    if (state.kind === 'idle') {
      const idle = state.idle;
      if (idle.outcome === 'interrupted') {
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
      await new Promise<void>((resolve) => { const timer = setTimeoutImpl(resolve, 500); timer.unref?.(); });
      if (pending.get(key) !== record || stopped) return;
      const confirmed: Activity = source ? await activity(record, source).catch((): Activity => ({ kind: 'unknown' })) : { kind: 'unknown' };
      if (confirmed.kind !== 'idle' || confirmed.idle.id !== idle.id) {
        record.attempt = (record.attempt || 0) + 1;
        await persist();
        arm(key, delayFor(record.attempt));
        return;
      }
      const canSend = async () => {
        if (stopped || pending.get(key) !== record) return false;
        const current: Activity = source ? await activity(record, source).catch((): Activity => ({ kind: 'unknown' })) : { kind: 'unknown' };
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
          arm(key, STABLE_RECONCILE_MS);
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
  const queue = async ({ sessionId, directory, spaceId = null }: TelegramSession) => {
    await load();
    if (!sessionId || !directory || !await telegram.hasSubscription(directory, sessionId)) return;
    const entry = { sessionId, directory, spaceId, attempt: 0, createdAt: now() };
    const key = keyOf(entry);
    const existing = pending.get(key);
    pending.set(key, existing ? { ...existing, armed: true, attempt: 0 } : { ...entry, armed: true });
    await persist();
    arm(key, QUIET_MS);
  };
  const track = async ({ sessionId, directory, spaceId = null }: TelegramSession) => {
    await load();
    const entry: WatchEntry = { sessionId, directory, spaceId, attempt: 0, createdAt: now(), armed: false };
    const source = sourceFor(spaceId);
    const idle = source ? await latestTelegramIdle(source, sessionId).catch(() => null) : null;
    if (idle) entry.baselineIdleId = idle.id;
    else if (source) {
      const page = await readTelegramSessionData(source, '/api/session/' + encodeURIComponent(sessionId) + '/message', { limit: '50', order: 'desc' }).catch(() => null);
      if (z.union([z.array(z.json()), z.object({ data: z.array(z.json()) })]).safeParse(page).success) entry.baselineIdleId = null;
    }
    const key = keyOf(entry);
    pending.set(key, entry);
    await persist();
    arm(key, 60000);
  };
  const cancel = async (sessionId: string, directory: string, spaceId: string | null = null) => {
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
      } catch { void 0; }
    }
    await persist();
  };
  const decision = (payload: WatchEvent, spaceId: string | null, kind: RequestKind, requestId?: string) => {
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
        const session = telegramSessionRecord.safeParse(await readTelegramSessionData(source, '/api/session/' + encodeURIComponent(sessionId)).catch(() => null)).data;
        if (!session || session.parentID || eventRevisions.get(key) !== revision ||
          !pending.has(keyOf({ sessionId, directory, spaceId }))) return;
        if (kind === 'page' && !isPageWaiting(sessionId, requestId)) return;
        if (kind === 'form' || kind === 'permission') {
          const resource = kind === 'form' ? 'form' : 'permission';
          const requests = await requestList(source, '/api/session/' + encodeURIComponent(sessionId) + '/' + resource);
          if (!Array.isArray(requests) || !requests.some((item) => item?.id === requestId)) return;
        }
        if (eventRevisions.get(key) !== revision ||
          !pending.has(keyOf({ sessionId, directory, spaceId })) ||
          (kind === 'page' && !isPageWaiting(sessionId, requestId))) return;
        await telegram.notify({ directory, sessionId, type: 'needs_input',
          eventKey: kind + ':' + requestId,
          canSend: async () => {
            if (eventRevisions.get(key) !== revision ||
              !pending.has(keyOf({ sessionId, directory, spaceId }))) return false;
            if (kind === 'page') return isPageWaiting(sessionId, requestId);
            const active = await requestList(source, '/api/session/' + encodeURIComponent(sessionId) + '/' + kind);
            return Array.isArray(active) && active.some((item) => item?.id === requestId);
          },
        });
      } catch (error) {
        console.warn('[Telegram] waiting-for-user notification failed:', hasErrorMessage(error) ? error.message : error);
      }
    }, 800);
    timer.unref?.();
    decisions.set(key, timer);
  };
  const settle = (payload: WatchEvent, spaceId: string | null, kind: RequestKind, requestId?: string) => {
    const sessionId = sessionIdOf(payload);
    const directory = payload.properties?.directory;
    if (!sessionId || !directory) return;
    const key = JSON.stringify([spaceId, directory, sessionId, kind, requestId]);
    const timer = decisions.get(key);
    if (timer) clearTimeoutImpl(timer);
    decisions.delete(key);
    eventRevisions.set(key, (eventRevisions.get(key) || 0) + 1);
  };
  const onEvent = (event: Parameters<typeof eventSchema.safeParse>[0], { spaceId = null }: { spaceId?: string | null } = {}) => {
    const parsed = eventSchema.safeParse(event);
    if (!parsed.success) return;
    let payload = parsed.data;
    const sessionId = sessionIdOf(payload);
    let directory = payload.properties?.directory;
    if (!directory && sessionId) {
      const matches = [...pending.values()].filter((entry) =>
        entry.sessionId === sessionId && (entry.spaceId ?? null) === spaceId);
      const match = matches[0];
      if (matches.length === 1 && match) {
        directory = match.directory;
        payload = { ...payload, properties: { ...payload.properties, directory } };
      }
    }
    if (sessionId && directory && payload.type === 'session.deleted') {
      const key = keyOf({ sessionId, directory, spaceId });
      pending.delete(key);
      clear(key);
      return (async () => {
        await load();
        pending.delete(key);
        clear(key);
        await persist();
        await telegram.unsubscribe(directory, sessionId);
        await cancel(sessionId, directory, spaceId);
      })().catch((error) => console.warn('[Telegram] session deletion cleanup failed:', hasErrorMessage(error) ? error.message : error));
    }
    if (sessionId && directory && payload.type === 'session.status' && payload.properties?.status?.type !== 'idle') {
      const key = keyOf({ sessionId, directory, spaceId });
      const previous = pending.get(key);
      if (previous) {
        pending.set(key, { ...previous, armed: false, baselineIdleId: previous.baselineIdleId });
        void persist().then(() => arm(key, 5000)).catch(() => {});
      }
    }
    if (sessionId && directory && payload.type === 'session.idle') {
      if (payload.properties?.aborted !== true) {
        void queue({ sessionId, directory, spaceId }).catch((error) => {
          console.warn('[Telegram] could not record idle candidate:', hasErrorMessage(error) ? error.message : error);
        });
      } else {
        const key = keyOf({ sessionId, directory, spaceId });
        const previous = pending.get(key);
        if (previous) {
          pending.set(key, { ...previous, armed: false, attempt: 0 });
          void persist().then(() => arm(key, 1000)).catch((error) => {
            console.warn('[Telegram] could not preserve interrupted checkpoint:', hasErrorMessage(error) ? error.message : error);
          });
        }
      }
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
    for (const item of await telegram.listSubscriptions()) {
      const key = keyOf(item);
      if (!pending.has(key)) await track(item);
    }
    reconcileAll();
  };
  const stop = () => {
    stopped = true;
    for (const key of timers.keys()) clear(key);
    for (const timer of decisions.values()) clearTimeoutImpl(timer);
    decisions.clear();
  };
  const checkpoints = async () => {
    await load();
    return [...pending.values()].map((item) => ({
      sessionId: item.sessionId, directory: item.directory, spaceId: item.spaceId ?? null,
      baselineIdleId: item.baselineIdleId ?? null, armed: item.armed === true,
      requireNewIdle: item.requireNewIdle ?? null,
    }));
  };
  return { start, stop, reconcileAll, onEvent, track, queue, cancel, checkpoints,
    pendingCount: () => pending.size };
};
