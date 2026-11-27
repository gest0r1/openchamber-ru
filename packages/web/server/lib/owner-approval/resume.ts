import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { z } from 'zod';
import { createSessionActivityProbe, type SessionActivityOptions } from '../opencode/session-activity.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import type { JsonObject } from '../shared/json-values.js';
import { callOwnerApprovalBroker } from './transport.js';

const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const continuation = z.object({
  request_id: z.string().regex(/^[a-f0-9]{32}$/),
  message_id: z.string().regex(/^msg_[a-f0-9]{32}$/),
  run_id: identity, pipeline_id: identity, stage: identity, session_id: identity,
  workspace: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(['plan.final_manifest.approve', 'owner.accept', 'plan.unfreeze', 'plan.unfreeze.abort']),
  current: z.literal(true), decision: z.literal('approved'),
});
const session = z.object({ id: identity, location: z.object({ directory: z.string() }), time: z.object({ archived: z.unknown().optional() }).optional() });
const synthetic = z.object({
  id: z.string(), sessionID: z.string(), type: z.literal('synthetic'),
  payload: z.object({ text: z.string(), description: z.string() }), delivery: z.literal('queue'),
});
const pending = z.object({ pending: z.array(continuation) });
const description = 'Pipeline owner decision';

interface ContinuationOptions extends SessionActivityOptions {
  broker?: typeof callOwnerApprovalBroker;
  isSessionArchived?: (sessionId: string) => boolean | Promise<boolean>;
}

const ownerApprovalContinuationMessage = (entry: Pick<z.infer<typeof continuation>, 'run_id' | 'pipeline_id' | 'stage' | 'operation'>): string => {
  const actions = {
    'plan.final_manifest.approve': 'Retry the paused PLAN approval step and verify the currently approved manifest.',
    'plan.unfreeze': 'Retry the paused PLAN unfreeze invocation using the approved scope.',
    'plan.unfreeze.abort': 'Retry the paused PLAN unfreeze cancellation and verify the currently approved scope.',
    'owner.accept': `Recheck the owner acceptance for ${entry.pipeline_id}/${entry.stage} and the current candidate SHA before continuing.`,
  };
  const action = actions[entry.operation];
  return `Owner approval is ready for RUN ${entry.run_id}. ${action} Continue this RUN in this session and do not enable Goal mode.`;
};

export async function reconcileOwnerApprovalContinuations({ buildOpenCodeUrl, getOpenCodeAuthHeaders, signal,
  fetchImpl = fetch, broker = callOwnerApprovalBroker, isSessionArchived }: ContinuationOptions) {
  const socket = '/run/my-opencode-approval/agent.sock';
  const { pending: entries } = pending.parse(await broker({ action: 'scan_continuations' }, socket));
  if (!entries.length) return;
  const activity = createSessionActivityProbe({ buildOpenCodeUrl, getOpenCodeAuthHeaders, signal, fetchImpl });
  const statuses = await activity.fetchActiveSessionStatuses();
  if (!statuses) return;
  const call = (route: string, body?: JsonObject) => {
    const timeout = AbortSignal.timeout(5000);
    return fetchImpl(buildOpenCodeUrl(route, ''), {
      method: body ? 'POST' : 'GET',
      headers: { ...getOpenCodeAuthHeaders(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : null,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  };
  for (const entry of entries) {
    if (signal?.aborted) return;
    if (statuses[entry.session_id] || await isSessionArchived?.(entry.session_id)) continue;
    const path = `/api/session/${encodeURIComponent(entry.session_id)}`;
    const sessionResponse = await call(path);
    if (!sessionResponse.ok) continue;
    const target = session.safeParse(unwrapOpenCodeResponse(await sessionResponse.json()));
    if (!target.success || target.data.id !== entry.session_id || target.data.time?.archived) continue;
    const directory = await realpath(target.data.location.directory).catch(() => null);
    if (!directory || createHash('sha256').update(directory).digest('hex') !== entry.workspace) continue;
    const [blocked, children, jobs] = await Promise.all([
      activity.hasBlockingRequests(entry.session_id, directory),
      activity.hasWorkingChildren(entry.session_id, statuses),
      activity.fetchRunningBackgroundJobs(entry.session_id),
    ]);
    if (blocked !== false || children !== false || !jobs || jobs.length > 0) continue;
    const text = ownerApprovalContinuationMessage(entry);
    const identity = { request_id: entry.request_id, session_id: entry.session_id, message_id: entry.message_id };
    const claim = z.object({ claimed: z.boolean() }).parse(await broker({ action: 'claim_continuation', ...identity }, socket));
    if (!claim.claimed) continue;
    const delivery = await call(`${path}/synthetic`, { id: entry.message_id, text, description, delivery: 'queue', resume: true });
    if (!delivery.ok) continue;
    const stored = synthetic.safeParse(unwrapOpenCodeResponse(await delivery.json()));
    if (!stored.success || stored.data.id !== entry.message_id || stored.data.sessionID !== entry.session_id
      || stored.data.payload.text !== text || stored.data.payload.description !== description) continue;
    await broker({ action: 'ack_continuation', ...identity }, socket);
  }
}

export function startOwnerApprovalContinuations(options: ContinuationOptions) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const tick = async () => {
    if (signal.aborted) return;
    const marker = await lstat('/etc/my-opencode/owner-broker-passkey').catch(() => null);
    if (marker?.isFile() && marker.uid === 0 && (marker.mode & 0o022) === 0) {
      await reconcileOwnerApprovalContinuations({ ...options, signal }).catch(() => undefined);
    }
    if (!signal.aborted) timer = setTimeout(() => void tick(), 5000).unref();
  };
  void tick();
  return { stop: () => { controller.abort(); clearTimeout(timer); } };
}
