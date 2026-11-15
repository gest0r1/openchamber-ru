/**
 * Read-only completion proof for approved SDK notification services.
 * This is an observation, not a promise that a future send is atomic with
 * OpenCode. Every failed/ambiguous read yields "unknown", never "idle".
 */
import { createSessionActivityProbe } from '../opencode/session-activity.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';

const OUTCOMES = new Set(['succeeded', 'failed', 'interrupted']);
const read = async (source, route, query) => {
  const url = source.buildOpenCodeUrl(route, '');
  const params = new URLSearchParams(query);
  const response = await source.fetchImpl(params.size ? url + '?' + params : url, {
    method: 'GET',
    headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('OpenCode read unavailable');
  return unwrapOpenCodeResponse(await response.json());
};
const latestIdle = async (source, sessionId) => {
  const page = await read(source, '/api/session/' + encodeURIComponent(sessionId) + '/message',
    { limit: '1', order: 'desc', type: 'idle' });
  const records = Array.isArray(page) ? page : page?.data;
  if (!Array.isArray(records)) return null;
  const record = records.find((item) => item?.type === 'idle' && typeof item.id === 'string'
    && item.id.length > 0 && OUTCOMES.has(item.outcome));
  return record ? { id: record.id, outcome: record.outcome } : null;
};

export const createSessionCompletionProof = ({ sourceFor, isGoalActive, dispatchPending }) => async ({
  sessionId, directory, spaceId = null,
}) => {
  const unknown = { kind: 'unknown', reason: 'read-unavailable', title: null };
  const source = sourceFor(spaceId);
  if (!source || typeof sessionId !== 'string' || !sessionId || typeof directory !== 'string' || !directory) return unknown;
  let record;
  try { record = await read(source, '/api/session/' + encodeURIComponent(sessionId)); }
  catch { return unknown; }
  const title = typeof record?.title === 'string' && record.title.trim() ? record.title.slice(0, 200) : null;
  const result = (kind, reason, idle) => ({
    kind, reason, title, ...(idle ? { idle } : {}),
  });
  // Do not allow a caller to probe another directory or a child as a root.
  if (record?.id !== sessionId || record?.location?.directory !== directory || record.parentID) {
    return result('unknown', 'scope-mismatch');
  }
  try {
    const goal = await isGoalActive(sessionId, spaceId);
    if (goal === null || goal === undefined) return result('unknown', 'goal-unavailable');
    if (goal) return result('working', 'goal');
    const probe = createSessionActivityProbe({ ...source, timeoutMs: 10000 });
    const statuses = await probe.fetchActiveSessionStatuses();
    if (!statuses) return result('unknown', 'status-unavailable');
    if (statuses[sessionId]) return result('working', 'session');
    const descendants = await probe.hasWorkingDescendants(sessionId, statuses, true);
    if (descendants === null) return result('unknown', 'descendants-unavailable');
    if (descendants) return result('working', 'descendant');
    const shells = await probe.hasRunningShells(directory);
    if (shells === null) return result('unknown', 'shells-unavailable');
    if (shells) return result('working', 'shell');
    const blocking = await probe.hasBlockingRequests(sessionId, directory);
    if (blocking === null) return result('unknown', 'requests-unavailable');
    if (blocking) return result('working', 'request');
    const pending = await dispatchPending(spaceId, sessionId);
    if (!Array.isArray(pending)) return result('unknown', 'dispatch-unavailable');
    if (pending.some((item) => item?.parentSessionId === sessionId)) return result('working', 'dispatch');
    const idle = await latestIdle(source, sessionId);
    if (!idle) return result('unknown', 'idle-unavailable');
    if (idle.outcome === 'interrupted') return result('unknown', 'interrupted');
    return result('idle', 'terminal-idle', idle);
  } catch {
    return result('unknown', 'read-unavailable');
  }
};
