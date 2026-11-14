import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(new URL('./main.js', import.meta.url));
const token = 'test-only-service-token';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const unusedPort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const port = socket.address().port;
    socket.close((error) => error ? reject(error) : resolve(port));
  });
});

async function launch(t, { corrupt = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-telegram-http-'));
  const statePath = path.join(dir, 'shadow-events-v1.json');
  if (corrupt) await fs.writeFile(statePath, '{broken', { mode: 0o600 });
  const port = await unusedPort();
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      OPENCHAMBER_SERVICE_PORT: String(port),
      OPENCHAMBER_SERVICE_TOKEN: token,
      OPENCHAMBER_SERVICE_DATA_DIR: dir,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-2048); });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit').catch(() => {}), sleep(1000)]);
    }
    await fs.rm(dir, { recursive: true, force: true });
  });
  const url = 'http://127.0.0.1:' + port;
  const call = (route, init = {}, authorized = true) => fetch(url + route, {
    ...init,
    headers: { ...(authorized ? { Authorization: 'Bearer ' + token } : {}),
      ...init.headers },
  });
  let ready = false;
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error('Telegram shadow service exited before ready: ' + stderr);
    try {
      const response = await call('/health');
      if (response.status === 200) { ready = true; break; }
    } catch { /* service not listening yet */ }
    await sleep(25);
  }
  assert.equal(ready, true, 'service /health must become ready: ' + stderr);
  return { call, statePath, url };
}

const event = {
  v: 1,
  requestId: 'req-1',
  event: {
    id: 'evt-1',
    type: 'turn-finished',
    at: 1730000000000,
    session: { id: 'ses-1', parentId: null },
    project: { directory: '/project' },
    linked: [],
  },
};
const post = (call, body) => call('/session-events', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('service handles SDK metadata over authenticated loopback and persists no transcript or credentials', async (t) => {
  const { call, url, statePath } = await launch(t);
  assert.equal((await fetch(url + '/health')).status, 401);
  assert.equal((await call('/health', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal((await call('/health')).status, 200);
  assert.equal((await post(call, { ...event, v: 2 })).status, 400);
  const withContent = { ...event, content: { reply: 'sensitive reply' }, botToken: 'sensitive credential' };
  const first = await post(call, withContent);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true, recorded: true, duplicate: false });
  const replay = await post(call, withContent);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { ok: true, recorded: false, duplicate: true });
  const status = await (await call('/status')).json();
  assert.deepEqual(status, { ok: true, version: 1, observed: 1, rootEvents: 1, deliveryEnabled: false });
  const disk = await fs.readFile(statePath, 'utf8');
  assert.equal(disk.includes('sensitive'), false);
  assert.equal(disk.includes(token), false);
  assert.equal((await fs.stat(statePath)).mode & 0o777, 0o600);
});

test('service refuses to claim durable success on a corrupt shadow journal', async (t) => {
  const { call, statePath } = await launch(t, { corrupt: true });
  const result = await post(call, event);
  assert.equal(result.status, 200); // SDK contract: failures are {ok:false,error}; status alone is not the ACK.
  assert.deepEqual(await result.json(), { ok: false, error: 'shadow journal write failed' });
  assert.equal((await call('/status')).status, 500);
  assert.equal(await fs.readFile(statePath, 'utf8'), '{broken');
});
