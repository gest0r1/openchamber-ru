import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { reconcileOwnerApprovalContinuations } from './resume.js';

const sessionId = 'ses_original';
const sessionPath = `/api/session/${sessionId}`;
const messageId = `msg_${'a'.repeat(32)}`;

async function fixture({ busy = false, workspaceMismatch = false, wrongMessage = false } = {}) {
  const directory = await realpath(process.cwd());
  const entry = {
    request_id: 'b'.repeat(32), message_id: messageId, run_id: 'run', pipeline_id: 'app', stage: 'accept', session_id: sessionId,
    workspace: createHash('sha256').update(workspaceMismatch ? '/' : directory).digest('hex'),
    current: true, decision: 'approved', operation: 'owner.accept',
  };
  const broker = vi.fn(async ({ action }) => {
    if (action === 'scan_continuations') return { pending: [entry] };
    if (action === 'claim_continuation') return { claimed: true };
    if (action === 'ack_continuation') return { ok: true };
    throw new Error('unexpected broker action');
  });
  const fetchImpl = vi.fn(async (raw, options) => {
    switch (new URL(raw).pathname) {
      case '/api/session/active': return Response.json({ data: busy ? { [sessionId]: 'busy' } : {} });
      case sessionPath: return Response.json({ data: { id: sessionId, location: { directory } } });
      case '/api/experimental/job':
      case `${sessionPath}/form`:
      case `${sessionPath}/permission`: return Response.json({ data: [] });
      case `${sessionPath}/synthetic`: {
        const { id, text, description, delivery } = JSON.parse(options.body);
        return Response.json({ data: { id, sessionID: wrongMessage ? 'ses_other' : sessionId,
          type: 'synthetic', payload: { text, description }, delivery } });
      }
      default: throw new Error(`unexpected request ${raw}`);
    }
  });
  return { entry, broker, fetchImpl, reconcile: () => reconcileOwnerApprovalContinuations({ broker, fetchImpl,
    buildOpenCodeUrl: (path) => `http://127.0.0.1${path}`, getOpenCodeAuthHeaders: () => ({}) }) };
}

describe('owner continuation', () => {
  it('uses a stable queued wake on the original session and only acknowledges exact delivery', async () => {
    const { entry, broker, fetchImpl, reconcile } = await fixture();
    await reconcile();
    const posted = fetchImpl.mock.calls.find(([url]) => url.endsWith('/synthetic'));
    expect(posted[0]).toBe(`http://127.0.0.1${sessionPath}/synthetic`);
    expect(JSON.parse(posted[1].body)).toMatchObject({ id: messageId, delivery: 'queue', resume: true });
    expect(broker.mock.calls.map(([request]) => request.action)).toEqual(['scan_continuations', 'claim_continuation', 'ack_continuation']);
    expect(broker.mock.lastCall[0]).toEqual({ action: 'ack_continuation', request_id: entry.request_id, session_id: sessionId, message_id: messageId });
  });

  it.each([{ busy: true }, { workspaceMismatch: true }])('does not deliver to an ineligible session (%j)', async (options) => {
    const { broker, fetchImpl, reconcile } = await fixture(options);
    await reconcile();
    expect(broker.mock.calls).toHaveLength(1);
    expect(fetchImpl.mock.calls.some(([url]) => url.endsWith('/synthetic'))).toBe(false);
  });

  it('keeps the continuation pending when the synthetic response does not match', async () => {
    const { broker, reconcile } = await fixture({ wrongMessage: true });
    await reconcile();
    expect(broker.mock.calls.map(([request]) => request.action)).toEqual(['scan_continuations', 'claim_continuation']);
  });
});
