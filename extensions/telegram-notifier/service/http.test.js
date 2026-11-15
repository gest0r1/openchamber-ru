import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./main.js', import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close((e) => e ? reject(e) : resolve(p)); });
});
test('host-run notifier receives SDK event without reading bot messages or credentials', async (t) => {
  const port = await freePort();
  const token = 'test-notifier-token';
  const host = net.createServer((socket) => { socket.end(); });
  await new Promise((resolve) => host.listen(0, '127.0.0.1', resolve));
  t.after(() => host.close());
  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, OPENCHAMBER_SERVICE_PORT: String(port),
      OPENCHAMBER_SERVICE_TOKEN: token,
      OPENCHAMBER_HOST_CALLBACK_URL: 'http://127.0.0.1:' + host.address().port },
    stdio: 'ignore',
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM'); await Promise.race([once(child, 'exit').catch(() => {}), sleep(1500)]);
    }
  });
  const url = 'http://127.0.0.1:' + port;
  const call = (path, body, authorized = true) => fetch(url + path, {
    method: body ? 'POST' : 'GET',
    headers: { ...(authorized ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let alive = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await call('/health')).status === 200) { alive = true; break; } }
    catch { /* wait for isolated service startup */ }
    await sleep(20);
  }
  assert.equal(alive, true);
  assert.equal((await call('/health', undefined, false)).status, 401);
  const event = { v: 1, requestId: 'r1', event: { id: 'e1', type: 'turn-finished',
    session: { id: 'ses_1', parentId: null }, project: { directory: '/repo' } } };
  assert.deepEqual(await (await call('/session-events', event)).json(), { ok: true });
  assert.equal((await call('/session-events', { ...event, v: 99 })).status, 400);
  const status = await (await call('/status')).json();
  assert.equal(status.ok, true);
  assert.ok(typeof status.sweeps === 'number');
});
