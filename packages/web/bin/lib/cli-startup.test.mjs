import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'vitest';

const moduleUrl = new URL('./cli-startup.js', import.meta.url).href;
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-startup-'));
  const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
  const launcher = path.join(bin, 'openchamber'); fs.writeFileSync(launcher, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'systemctl'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STARTUP_TEST_LOG"\nexit 0\n', { mode: 0o755 });
  const dropDir = path.join(root, '.config/systemd/user/openchamber.service.d'); fs.mkdirSync(dropDir, { recursive: true });
  fs.writeFileSync(path.join(dropDir, '95-my-opencode-env.conf'), '# managed-by: my-opencode\n[Service]\n');
  fs.writeFileSync(path.join(dropDir, '10-user.conf'), '[Service]\nEnvironment=KEEP=1\n');
  return { root, bin, launcher, dropDir };
}
function enable(f, launcher = f.launcher, startService = true) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import {enableStartupService} from ${JSON.stringify(moduleUrl)}; enableStartupService({host:'127.0.0.1',port:3000,envSnapshot:false,uiPassword:'test-password',startService:${startService}});`], {
    encoding: 'utf8', env: { ...process.env, HOME: f.root, OPENCHAMBER_DATA_DIR: path.join(f.root, 'data'), PATH: `${f.bin}:${process.env.PATH}`, STARTUP_TEST_LOG: path.join(f.root, 'calls'), OPENCHAMBER_STARTUP_LAUNCHER: launcher, OPENCHAMBER_MIGRATE_MANAGED_STARTUP: '1' },
  });
}
test('native startup keeps stable launcher and user dropins and restarts enabled service', () => {
  const f = fixture();
  try {
    const result = enable(f); assert.equal(result.status, 0, result.stderr);
    const unit = fs.readFileSync(path.join(f.root, '.config/systemd/user/openchamber.service'), 'utf8');
    assert.ok(unit.includes(`ExecStart="${f.launcher}" "serve"`));
    assert.ok(!fs.existsSync(path.join(f.dropDir, '95-my-opencode-env.conf')));
    assert.equal(fs.readFileSync(path.join(f.dropDir, '10-user.conf'), 'utf8'), '[Service]\nEnvironment=KEEP=1\n');
    const calls = fs.readFileSync(path.join(f.root, 'calls'), 'utf8');
    assert.match(calls, /--user daemon-reload\n--user enable openchamber.service\n--user restart openchamber.service/);
    const env = fs.readFileSync(path.join(f.root, 'data/startup.env'), 'utf8');
    assert.match(env, /OPENCHAMBER_UI_PASSWORD/); assert.doesNotMatch(env, /STARTUP_TEST_LOG|GITHUB_TOKEN/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test('invalid launcher cannot mutate managed or user state', () => {
  const f = fixture();
  try { assert.notEqual(enable(f, 'relative/launcher').status, 0); assert.ok(fs.existsSync(path.join(f.dropDir, '95-my-opencode-env.conf'))); assert.ok(!fs.existsSync(path.join(f.root, 'calls'))); }
  finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test('native no-start enables without restarting', () => {
  const f = fixture();
  try { const r = enable(f, f.launcher, false); assert.equal(r.status, 0, r.stderr); assert.doesNotMatch(fs.readFileSync(path.join(f.root, 'calls'), 'utf8'), /restart/); }
  finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
