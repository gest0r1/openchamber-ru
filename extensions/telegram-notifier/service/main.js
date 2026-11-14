import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createNotifierReconciler } from './reconcile.js';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';
const callback = process.env.OPENCHAMBER_HOST_CALLBACK_URL ?? '';
if (!Number.isInteger(port) || port < 1 || port > 65535 || !token || !callback) {
  throw new Error('This service must run through the approved OpenChamber SDK host');
}
const call = async (method, input) => {
  const response = await fetch(callback.replace(/[/]+$/, '') + '/service/call', {
    method: 'POST',
    headers: { 'authorization': 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ method, input }), signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok || !result || typeof result !== 'object' || !('result' in result)) {
    throw new Error('The SDK host rejected a Telegram notification operation');
  }
  return result.result;
};
const host = {
  subscriptions: () => call('telegram.subscriptions', {}),
  completion: (entry) => call('sessions.completion', {
    sessionId: entry.sessionId, directory: entry.directory,
    ...(entry.spaceId ? { spaceId: entry.spaceId } : {}),
  }),
  deliver: (entry) => call('telegram.deliver', entry),
};
const notifier = createNotifierReconciler({ host, onError: () => {
  // No secrets, user messages or destination identifiers in logs.
  console.warn('[telegram-notifier] a subscription could not be reconciled; retrying');
} });
let debounce = null;
const schedule = () => {
  if (debounce) return;
  debounce = setTimeout(() => {
    debounce = null;
    void notifier.reconcile().catch(() => {
      console.warn('[telegram-notifier] host unavailable; scheduled retry remains active');
    });
  }, 1200);
  debounce.unref?.();
};
const authorized = (header) => {
  if (typeof header !== 'string') return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from('Bearer ' + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const reply = (res, status, value) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
};
const readBody = async (request) => {
  const chunks = []; let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 64_000) throw new Error('Event too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};
const server = http.createServer(async (req, res) => {
  if (!authorized(req.headers.authorization)) return reply(res, 401, { error: 'unauthorized' });
  const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  if (req.method === 'GET' && pathname === '/health') return reply(res, 200, { ok: true });
  if (req.method === 'GET' && pathname === '/status') return reply(res, 200, { ok: true, ...notifier.status() });
  if (req.method !== 'POST' || pathname !== '/session-events') return reply(res, 404, { error: 'not-found' });
  let event;
  try { event = await readBody(req); }
  catch { return reply(res, 400, { error: 'invalid event' }); }
  if (event?.v !== 1 || typeof event?.requestId !== 'string' ||
      typeof event?.event?.session?.id !== 'string' ||
      !(event.event.session.parentId === null || typeof event.event.session.parentId === 'string')) {
    return reply(res, 400, { error: 'invalid event' });
  }
  // Even a dropped event is harmless: the periodic full snapshot catches up.
  if (event.event.session.parentId === null) schedule();
  return reply(res, 200, { ok: true });
});
server.listen(port, '127.0.0.1');
const tick = setInterval(schedule, 60_000);
tick.unref?.();
schedule();
process.on('SIGTERM', () => { clearInterval(tick); if (debounce) clearTimeout(debounce); server.close(); });
