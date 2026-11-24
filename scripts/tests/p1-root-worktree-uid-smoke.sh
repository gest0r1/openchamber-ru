#!/usr/bin/env bash
# Disposable GitHub-hosted Linux VM only; real root/OpenCode UID boundary.
set -Eeuo pipefail

[[ "$RUNNER_ENVIRONMENT" == github-hosted ]] || {
  echo 'P1_UID_TEST_REQUIRES_GITHUB_RUNNER' >&2; exit 2;
}
if ! getent passwd opencode >/dev/null; then
  sudo useradd --create-home --shell /bin/bash opencode
fi
sudo -u opencode install -d -m 700 /home/opencode/projects
sudo -u opencode git init -b main /home/opencode/projects/p1-smoke-repo
sudo -u opencode git -C /home/opencode/projects/p1-smoke-repo config user.email opencode@example.invalid
sudo -u opencode git -C /home/opencode/projects/p1-smoke-repo config user.name smoke-test
sudo -u opencode git -C /home/opencode/projects/p1-smoke-repo -c commit.gpgsign=false commit --allow-empty -m initial
sudo install -d -o root -g root -m 700 /usr/local/lib/my-opencode
curl -fsSL \
  https://raw.githubusercontent.com/gest0r1/my-opencode/8c60f163a7ba1e92acf777801688567c1562300f/scripts/openchamber-child-boundary.cjs \
  -o "$RUNNER_TEMP/openchamber-child-boundary.cjs"
sudo install -o root -g root -m 644 "$RUNNER_TEMP/openchamber-child-boundary.cjs" \
  /usr/local/lib/my-opencode/openchamber-child-boundary.cjs
sudo install -o root -g root -m 600 /dev/null /root/p1-test-secret

sudo env \
  OPENCHAMBER_ROOT_MODE=separated \
  OPENCHAMBER_EXECUTION_USER=opencode \
  OPENCHAMBER_EXECUTION_UID="$(id -u opencode)" \
  OPENCHAMBER_EXECUTION_GID="$(id -g opencode)" \
  HOME=/root XDG_DATA_HOME=/root/.local/share \
  NODE_OPTIONS="--require /usr/local/lib/my-opencode/openchamber-child-boundary.cjs" \
  "$(command -v node)" --input-type=module - <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeWorktreeDirectory, worktreeDataPath } from './packages/web/server/lib/git/worktree-execution-boundary.ts';

assert.equal(process.getuid(), 0);
assert.equal(process.env.OPENCHAMBER_CHILD_BOUNDARY_ACTIVE, '1');
assert.equal(worktreeDataPath(), '/home/opencode/.local/share/opencode');

const repo = '/home/opencode/projects/p1-smoke-repo';
const parent = path.join(worktreeDataPath(), 'worktree', 'p1-smoke-project-id');
const leaf = path.join(parent, 'new-worktree');
await makeWorktreeDirectory(parent);
await makeWorktreeDirectory(leaf, { leaf: true });
const uid = Number(process.env.OPENCHAMBER_EXECUTION_UID);
assert.equal(fs.statSync(parent).uid, uid, 'parent directory must be owned by opencode');
assert.equal(fs.statSync(leaf).uid, uid, 'candidate directory must be owned by opencode');

execFileSync('git', ['-C', repo, 'worktree', 'add', '--no-checkout', '-b', 'p1-smoke-branch', leaf], { encoding: 'utf8' });
assert.equal(fs.statSync(path.join(leaf, '.git')).uid, uid, 'Git checkout metadata must be owned by opencode');
const branch = execFileSync('git', ['-C', leaf, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
assert.equal(branch, 'p1-smoke-branch');
assert.throws(() => execFileSync('/bin/cat', ['/root/p1-test-secret'], { stdio: 'pipe' }));
assert.throws(() => execFileSync('mkdir', ['-p', '/root/p1-should-not-exist'], { stdio: 'pipe' }));
assert.equal(fs.existsSync('/root/p1-should-not-exist'), false);
console.log('P1_ROOT_WORKTREE_REAL_UID_PASS');
NODE
