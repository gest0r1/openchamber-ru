import { z } from 'zod';
import { createSessionActivityProbe, type SessionActivityOptions } from '../opencode/session-activity.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';

export type TelegramSession = { sessionId: string; directory: string; spaceId?: string | null | undefined };
export type TelegramSource = SessionActivityOptions & { fetchImpl: NonNullable<SessionActivityOptions['fetchImpl']> };
export type TelegramSourceFor = (spaceId: string | null) => TelegramSource | null;
export type DispatchPending = (spaceId: string | null, sessionId: string) => Promise<readonly { parentSessionId: string }[] | null>;
export type TelegramGoalActive = (sessionId: string, spaceId: string | null) => Promise<boolean | null>;
type CompletionProof = { kind: 'unknown' | 'working' | 'idle'; reason: string; title: string | null; idle?: IdleRecord };
type ProofOptions = { sourceFor: TelegramSourceFor; isGoalActive: TelegramGoalActive; dispatchPending: DispatchPending };
export const telegramSessionRecord = z.object({
  id: z.string(), parentID: z.string().nullish(), location: z.object({ directory: z.string() }).optional(),
  title: z.string().optional(),
});
const idleRecord = z.object({ type: z.literal('idle'), id: z.string().min(1), outcome: z.enum(['succeeded', 'failed', 'interrupted']) });
const messagePage = z.union([z.array(z.json()), z.object({ data: z.array(z.json()) }).transform((value) => value.data)]);
export const telegramPendingRequests = z.array(z.object({ id: z.string().min(1) }));
export type IdleRecord = Pick<z.infer<typeof idleRecord>, 'id' | 'outcome'>;

export const readTelegramSessionData = async (source: TelegramSource, route: string, query?: Record<string, string>) => {
  const url = source.buildOpenCodeUrl(route, '');
  const params = new URLSearchParams(query);
  const response = await source.fetchImpl(params.size ? `${url}?${params}` : url, {
    method: 'GET',
    headers: { accept: 'application/json', ...source.getOpenCodeAuthHeaders() },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('OpenCode read unavailable');
  return unwrapOpenCodeResponse(await response.json());
};
export const latestTelegramIdle = async (source: TelegramSource, sessionId: string): Promise<IdleRecord | null> => {
  const page = await readTelegramSessionData(source, '/api/session/' + encodeURIComponent(sessionId) + '/message',
    { limit: '1', order: 'desc', type: 'idle' });
  const parsed = messagePage.safeParse(page);
  if (!parsed.success) return null;
  for (const item of parsed.data) {
    const record = idleRecord.safeParse(item);
    if (record.success) return { id: record.data.id, outcome: record.data.outcome };
  }
  return null;
};

export const createSessionCompletionProof = ({ sourceFor, isGoalActive, dispatchPending }: ProofOptions) => async ({
  sessionId, directory, spaceId = null,
}: TelegramSession) => {
  const unavailable = { kind: 'unknown', reason: 'read-unavailable', title: null } as const;
  const source = sourceFor(spaceId);
  if (!source || !sessionId || !directory) return unavailable;
  let record;
  try {
    record = telegramSessionRecord.safeParse(await readTelegramSessionData(source, '/api/session/' + encodeURIComponent(sessionId))).data;
  }
  catch { return unavailable; }
  const title = record?.title?.trim() ? record.title.slice(0, 200) : null;
  const result = (kind: 'unknown' | 'working' | 'idle', reason: string, idle?: IdleRecord) => {
    const response: CompletionProof = { kind, reason, title };
    if (idle) response.idle = idle;
    return response;
  };
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
    const idle = await latestTelegramIdle(source, sessionId);
    if (!idle) return result('unknown', 'idle-unavailable');
    if (idle.outcome === 'interrupted') return result('unknown', 'interrupted');
    return result('idle', 'terminal-idle', idle);
  } catch {
    return result('unknown', 'read-unavailable');
  }
};
