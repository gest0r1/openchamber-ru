import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import {
  isSeparatedRootWorktreeRuntime,
  worktreeExecutionHome,
  worktreeDataPath,
  makeWorktreeDirectory,
} from './worktree-execution-boundary.js';

const processOf = (uid, env) => ({
  platform: 'linux',
  getuid: () => uid,
  env,
});

test('separated root UI uses opencode data storage regardless of root XDG_DATA_HOME', () => {
  const env = {
    HOME: '/root',
    XDG_DATA_HOME: '/root/.local/share',
    OPENCHAMBER_ROOT_MODE: 'separated',
    OPENCHAMBER_EXECUTION_USER: 'opencode',
  };
  const root = processOf(0, env);
  assert.equal(isSeparatedRootWorktreeRuntime(root), true);
  assert.equal(worktreeExecutionHome(root), '/home/opencode');
  assert.equal(worktreeDataPath(root), '/home/opencode/.local/share/opencode');
});

test('ordinary user retains their own XDG_DATA_HOME', () => {
  const p = processOf(1000, {
    HOME: '/home/alice',
    XDG_DATA_HOME: '/var/tmp/alice-data',
    OPENCHAMBER_ROOT_MODE: 'separated',
    OPENCHAMBER_EXECUTION_USER: 'opencode',
  });
  assert.equal(isSeparatedRootWorktreeRuntime(p), false);
  assert.equal(worktreeDataPath(p), path.join('/var/tmp/alice-data', 'opencode'));
});

test('root UI refuses a different execution principal', () => {
  const p = processOf(0, { HOME: '/root', OPENCHAMBER_ROOT_MODE: 'separated', OPENCHAMBER_EXECUTION_USER: 'root' });
  assert.throws(() => worktreeDataPath(p), /ROOT_WORKTREE_EXECUTION_USER_INVALID/);
});

test('root mode refuses mkdir without the verified child-process boundary', async () => {
  if (process.getuid?.() !== 0) return;
  const before = {
    mode: process.env.OPENCHAMBER_ROOT_MODE,
    user: process.env.OPENCHAMBER_EXECUTION_USER,
    active: process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE,
  };
  const candidate = path.join('/tmp', 'openchamber-root-worktree-must-not-exist-' + process.pid);
  try {
    process.env.OPENCHAMBER_ROOT_MODE = 'separated';
    process.env.OPENCHAMBER_EXECUTION_USER = 'opencode';
    delete process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE;
    await assert.rejects(makeWorktreeDirectory(candidate, { leaf: true }), /ROOT_WORKTREE_CHILD_BOUNDARY_MISSING/);
  } finally {
    for (const [key, value] of [
      ['OPENCHAMBER_ROOT_MODE', before.mode],
      ['OPENCHAMBER_EXECUTION_USER', before.user],
      ['OPENCHAMBER_CHILD_BOUNDARY_ACTIVE', before.active],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
