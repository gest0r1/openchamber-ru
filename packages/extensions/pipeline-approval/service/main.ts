import { createServer, type ServerResponse } from 'node:http';
import { lstat, readFile } from 'node:fs/promises';
import { createServiceHost } from '@openchamber/sdk';
import { z } from 'zod';
import { callOwnerApprovalBroker } from '../../../web/server/lib/owner-approval/transport.js';
import { approvalOrigin, checkpointPage, type panelResponse } from '../shared.js';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN;
const socket = '/run/my-opencode-approval/agent.sock';
const policy = '/etc/my-opencode/owner-broker-passkey';
const pendingSessions = z.object({ sessions: z.array(z.string()) });
if (!port || !token) throw new Error('Missing extension service configuration');

const host = createServiceHost({ env: process.env });
const marked = new Set<string>();

async function getApprovalOrigin() {
  const info = await lstat(policy);
  if (!info.isFile() || info.uid !== 0 || (info.mode & 0o022) !== 0) throw new Error('Untrusted owner approval configuration');
  return approvalOrigin.parse((await readFile(policy, 'utf8')).trim());
}

async function readPage(before: number) {
  return checkpointPage.parse(await callOwnerApprovalBroker({ action: 'list_checkpoints', before }, socket));
}

type PanelResult = ReturnType<typeof panelResponse.parse>;

const json = (response: ServerResponse, code: number, body: PanelResult | { error: string } | { ok: true }) => {
  response.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
};

async function updateMarks() {
  await getApprovalOrigin();
  const { sessions } = pendingSessions.parse(await callOwnerApprovalBroker({ action: 'list_pending_sessions' }, socket));
  const pending = new Set(sessions);
  for (const sessionId of marked) {
    if (pending.has(sessionId)) continue;
    await host.setMark({ sessionId }, null);
    marked.delete(sessionId);
  }
  for (const sessionId of pending) {
    if (marked.has(sessionId)) continue;
    await host.setMark({ sessionId }, { icon: 'shield-check', tone: 'warning', text: 'Pipeline Approval' });
    marked.add(sessionId);
  }
}

async function pollMarks() {
  await updateMarks().catch(() => undefined);
  setTimeout(() => void pollMarks(), 15_000).unref();
}

createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { error: 'unauthorized' });
  if (request.method !== 'GET') return json(response, 405, { error: 'method' });
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') return json(response, 200, { ok: true });
  if (url.pathname !== '/checkpoints') return json(response, 404, { error: 'route' });
  const before = Number(url.searchParams.get('before') ?? 0);
  if (!Number.isSafeInteger(before) || before < 0) return json(response, 400, { error: 'cursor' });
  try {
    const origin = await getApprovalOrigin();
    return json(response, 200, { origin, ...await readPage(before) });
  } catch {
    return json(response, 503, { error: 'approval_unavailable' });
  }
}).listen(port, '127.0.0.1', () => void pollMarks());
