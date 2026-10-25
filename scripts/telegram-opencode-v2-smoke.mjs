/**
 * Smoke test against an actual OpenCode v2 server, not a mocked HTTP fixture.
 * Runs on an ephemeral CI runner without a model/provider or Telegram token.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createSessionActivityProbe } from '../packages/web/server/lib/opencode/session-activity.js';
import { createTelegramWatch } from '../packages/web/server/lib/notifications/telegram-watch.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pickPort = () => new Promise((resolve, reject) => {
  const socket = createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const { port } = socket.address();
    socket.close(() => resolve(port));
  });
});

const root = await mkdtemp(join(tmpdir(), 'openchamber-telegram-real-opencode-'));
const workspace = join(root, 'project');
const statePath = join(root, 'telegram-watch.json');
const password = randomBytes(24).toString('hex');
const binary = process.env.OPENCODE_SMOKE_BINARY;
assert.ok(binary, 'OPENCODE_SMOKE_BINARY must be the pinned OpenCode v2 executable');
let child = null;
let watch = null;
let restoredWatch = null;
let serverOutput = '';
try {
  await mkdir(workspace, { recursive: true });
  const port = await pickPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const auth = 'Basic ' + Buffer.from('opencode:' + password).toString('base64');
  child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: workspace,
    env: {
      ...process.env,
      OPENCODE_SERVER_PASSWORD: password,
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_DATA_HOME: join(root, 'data'),
      XDG_CACHE_HOME: join(root, 'cache'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-4000);
    });
  }
  const api = async (path, options = {}) => {
    const headers = { authorization: auth, accept: 'application/json', ...options.headers };
    if (options.body) headers['content-type'] = 'application/json';
    const response = await fetch(baseUrl + path, {
      ...options, headers, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`OpenCode ${path}: HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return response.status === 204 ? null : response.json();
  };

  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`OpenCode exited early: ${serverOutput}`);
    try {
      await api('/api/info');
      ready = true;
      break;
    } catch { await sleep(300); }
  }
  assert.ok(ready, `OpenCode v2 server did not start: ${serverOutput}`);
  const source = {
    buildOpenCodeUrl: (path) => baseUrl + path,
    getOpenCodeAuthHeaders: () => ({ authorization: auth }),
    fetchImpl: fetch,
  };
  const probe = createSessionActivityProbe(source);
  const statuses = await probe.fetchActiveSessionStatuses();
  assert.ok(statuses && typeof statuses === 'object' && !Array.isArray(statuses),
    'Real /api/session/active must be a readable status map');

  const rootResult = await api('/api/session', { method: 'POST', body: JSON.stringify({
    title: 'Telegram live API smoke parent', location: { directory: workspace },
  }) });
  const parent = rootResult?.data ?? rootResult;
  assert.ok(parent?.id, 'OpenCode must create a parent session');
  const childResult = await api('/api/session', { method: 'POST', body: JSON.stringify({
    title: 'Telegram live API smoke child', parentID: parent.id,
  }) });
  const descendant = childResult?.data ?? childResult;
  assert.equal(descendant?.parentID, parent.id, 'OpenCode must persist real session lineage');

  assert.equal(await probe.hasWorkingDescendants(parent.id, { [descendant.id]: { type: 'running' } }, true), true,
    'Live session ancestry must block premature parent completion');
  assert.equal(await probe.hasWorkingDescendants(parent.id, {}, true), false,
    'An empty active map must not contain working descendants');
  assert.equal(await probe.hasRunningShells(parent.id, workspace), false,
    'Real /api/shell should return no running job on clean session');
  assert.equal(await probe.hasBlockingRequests(parent.id, workspace), false,
    'Real forms/permissions should be readable and initially empty');

  const remoteUnavailable = createSessionActivityProbe({
    ...source,
    fetchImpl: async () => { throw new Error('OpenCode disconnected'); },
  });
  assert.equal(await remoteUnavailable.fetchActiveSessionStatuses(), null,
    'Connectivity loss must remain unknown');
  assert.equal(await remoteUnavailable.hasWorkingDescendants(parent.id, {
    [descendant.id]: { type: 'running' },
  }, true), null, 'Unreadable lineage must not be treated as complete');

  let notifications = 0;
  const telegram = {
    hasSubscription: async () => true,
    listSubscriptions: async () => [],
    notify: async () => { notifications += 1; return true; },
  };
  const options = {
    filePath: statePath, telegram, sourceFor: () => source,
    dispatchPending: async () => [],
    isGoalActive: async () => false,
    readSettings: async () => ({ telegramEnabled: true }),
  };
  watch = createTelegramWatch(options);
  await watch.start();
  await watch.queue({ directory: workspace, sessionId: parent.id });
  await sleep(2600);
  assert.equal(notifications, 0, 'An empty real session must not generate a false idle notification');
  assert.equal(watch.pendingCount(), 1, 'Unknown completion must remain scheduled for retry');
  watch.stop();
  watch = null;
  assert.ok(JSON.parse(await readFile(statePath, 'utf8')).pending.length > 0,
    'The completion checkpoint must survive a restart');
  restoredWatch = createTelegramWatch(options);
  await restoredWatch.start();
  assert.equal(restoredWatch.pendingCount(), 1);
  await sleep(1800);
  assert.equal(notifications, 0, 'Restart must not invent a completed turn');
  console.log('PASS: real OpenCode v2 session API, descendant lineage, shell, requests, unknown and Telegram-watch restart');
} finally {
  watch?.stop();
  restoredWatch?.stop();
  if (child?.pid && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(1500)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(root, { recursive: true, force: true });
}
