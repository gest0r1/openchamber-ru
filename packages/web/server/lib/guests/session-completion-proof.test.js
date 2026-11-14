import { describe, expect, test, vi } from 'vitest';
import { createSessionCompletionProof } from './session-completion-proof.js';

const setup = (changes = {}) => {
  const directory = '/test/project';
  const body = new Map([
    ['/api/session/ses_root', { data: { id: 'ses_root', title: 'Current title', parentID: null, location: { directory } } }],
    ['/api/session/active', { data: {} }],
    ['/api/session', { data: [], cursor: {} }],
    ['/api/shell', { data: [] }],
    ['/api/session/ses_root/form', { data: [] }],
    ['/api/session/ses_root/permission', { data: [] }],
    ['/api/session/ses_root/message', { data: [{ id: 'msg_idle', type: 'idle', outcome: 'succeeded' }] }],
  ]);
  for (const [k, v] of Object.entries(changes.responses ?? {})) body.set(k, v);
  const source = {
    buildOpenCodeUrl: (p) => 'http://localhost' + p,
    getOpenCodeAuthHeaders: () => ({}),
    fetchImpl: vi.fn(async (url) => {
      const pathname = new URL(url).pathname;
      const response = body.get(pathname);
      return response === undefined ? new Response('', { status: 503 }) : Response.json(response);
    }),
  };
  const isGoalActive = vi.fn(async () => changes.goal ?? false);
  const dispatchPending = vi.fn(async () => changes.dispatch ?? []);
  const verify = createSessionCompletionProof({
    sourceFor: () => changes.noSource ? null : source,
    isGoalActive, dispatchPending,
  });
  return { verify: (input = {}) => verify({ sessionId: 'ses_root', directory, ...input }), source };
};

describe('read-only SDK completion proof', () => {
  test('returns terminal idle only after all barriers are proven clear', async () => {
    const { verify, source } = setup();
    expect(await verify()).toEqual({
      kind: 'idle', reason: 'terminal-idle', title: 'Current title',
      idle: { id: 'msg_idle', outcome: 'succeeded' },
    });
    expect(source.fetchImpl.mock.calls.map(([url]) => new URL(url).pathname))
      .toContain('/api/shell');
  });
  test('an active root stays working', async () => {
    expect(await setup({ responses: { '/api/session/active': { data: { ses_root: { type: 'busy' } } } } }).verify())
      .toMatchObject({ kind: 'working', reason: 'session' });
  });
  test('a running detached shell blocks even if its owner is unknown', async () => {
    const { verify } = setup({ responses: { '/api/shell': { data: [{
      status: 'running', command: 'do work', metadata: null, time: { started: 1 },
    }] } } });
    expect(await verify()).toMatchObject({ kind: 'working', reason: 'shell' });
  });
  test('pending dispatch blocks completion', async () => {
    expect(await setup({ dispatch: [{ parentSessionId: 'ses_root' }] }).verify())
      .toMatchObject({ kind: 'working', reason: 'dispatch' });
  });
  test('goal mode blocks completion', async () => {
    expect(await setup({ goal: true }).verify()).toMatchObject({ kind: 'working', reason: 'goal' });
  });
  test('failed child reads never count as no children', async () => {
    expect(await setup({ responses: { '/api/session/active': { data: { ses_child: {} } } } }).verify())
      .toMatchObject({ kind: 'unknown' });
  });
  test('unreadable shell or unresolved sources fail closed', async () => {
    expect(await setup({ responses: { '/api/shell': { data: null } } }).verify())
      .toMatchObject({ kind: 'unknown', reason: 'shells-unavailable' });
    expect(await setup({ noSource: true }).verify()).toMatchObject({ kind: 'unknown' });
  });
  test('scope mismatch cannot be used to probe unrelated folders', async () => {
    expect(await setup().verify({ directory: '/other' }))
      .toMatchObject({ kind: 'unknown', reason: 'scope-mismatch' });
  });
  test('interrupted idle does not announce completion', async () => {
    expect(await setup({ responses: { '/api/session/ses_root/message': {
      data: [{ id: 'msg_i', type: 'idle', outcome: 'interrupted' }],
    } } }).verify()).toMatchObject({ kind: 'unknown', reason: 'interrupted' });
  });
});
