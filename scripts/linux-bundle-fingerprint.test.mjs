import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'linux-bundle-fingerprint.mjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function commit(root, message) {
  git(root, 'add', '.');
  git(root, 'commit', '-m', message);
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'linux-bundle-fingerprint-'));
  git(root, 'init');
  git(root, 'config', 'user.email', 'ci@example.invalid');
  git(root, 'config', 'user.name', 'CI');
  write(root, 'package.json', '{"private":true}\n');
  write(root, 'bun.lock', 'lock-v1\n');
  write(root, 'packages/ui/package.json', '{"name":"ui"}\n');
  write(root, 'packages/ui/src/view.ts', 'export const value = 1;\n');
  write(root, 'packages/ui/src/view.test.ts', 'test("value",()=>{});\n');
  write(root, 'packages/electron/package.json', '{"name":"electron"}\n');
  write(root, '.github/workflows/integration-linux-bundle.yml', 'name: bundle\n');
  commit(root, 'initial');
  return root;
}

function fingerprint(root, ref = 'HEAD') {
  return execFileSync(process.execPath, [script, '--ref', ref], { cwd: root, encoding: 'utf8' }).trim();
}

test('test-only changes do not rebuild the Linux runtime bundle', () => {
  const root = fixture();
  const before = fingerprint(root);
  write(root, 'packages/ui/src/view.test.ts', 'test("value changed",()=>{});\n');
  commit(root, 'test only');
  assert.equal(fingerprint(root), before);
});

test('runtime source changes change the fingerprint', () => {
  const root = fixture();
  const before = fingerprint(root);
  write(root, 'packages/ui/src/view.ts', 'export const value = 2;\n');
  commit(root, 'runtime source');
  assert.notEqual(fingerprint(root), before);
});

test('bundle workflow and workspace package manifests are fingerprint inputs', () => {
  const root = fixture();
  const initial = fingerprint(root);
  write(root, '.github/workflows/integration-linux-bundle.yml', 'name: bundle-v2\n');
  commit(root, 'workflow');
  const workflowChanged = fingerprint(root);
  assert.notEqual(workflowChanged, initial);

  write(root, 'packages/electron/package.json', '{"name":"electron","version":"2"}\n');
  commit(root, 'workspace manifest');
  assert.notEqual(fingerprint(root), workflowChanged);
});
