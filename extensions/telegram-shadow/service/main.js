import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { createShadowJournal, parseShadowEvent } from './state.js';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN || '';
const dataDir = process.env.OPENCHAMBER_SERVICE_DATA_DIR;
if (!Number.isInteger(port) || port < 1 || port > 65535 || !token || !dataDir) {
  throw new Error('OpenChamber-managed port, service token and service data directory are required');
}
const journal = createShadowJournal({ filePath: path.join(dataDir, 'shadow-events-v1.json'), fs });
const reply = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
};
const authorized = (header) => {
  if (typeof header !== 'string') return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from('Bearer ' + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const readBounded = async (req) => {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) {
      const error = new Error('Session event exceeds shadow size limit');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};
const server = http.createServer(async (req, res) => {
  if (!authorized(req.headers.authorization)) return reply(res, 401, { error: 'unauthorized' });
  const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  if (req.method === 'GET' && pathname === '/health') return reply(res, 200, { ok: true });
  if (req.method === 'GET' && pathname === '/status') {
    try { return reply(res, 200, { ok: true, ...(await journal.status()) }); }
    catch { return reply(res, 500, { ok: false, error: 'shadow storage unavailable' }); }
  }
  if (req.method !== 'POST' || pathname !== '/session-events') return reply(res, 404, { error: 'not-found' });
  let event;
  try { event = parseShadowEvent(JSON.parse(await readBounded(req))); }
  catch (error) { return reply(res, error?.status === 413 ? 413 : 400, { error: 'invalid session event' }); }
  if (!event) return reply(res, 400, { error: 'invalid session event' });
  try {
    const result = await journal.record(event);
    return reply(res, 200, { ok: true, ...result });
  } catch {
    // SDK event delivery is at-most-once. Never claim persistence on a disk failure.
    return reply(res, 200, { ok: false, error: 'shadow journal write failed' });
  }
});
server.listen(port, '127.0.0.1');
