import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('web fingerprint reads a Git tree larger than the default 1 MiB subprocess buffer', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'oc-fingerprint-buffer-'));
  try {
    const records = Array.from({ length: 12000 }, (_, index) => ({
      mode: '100644',
      sha: index.toString(16).padStart(40, '0'),
      path: `packages/ui/src/buffer-fixture/${index.toString().padStart(6, '0')}-${'long'.repeat(15)}.ts`,
    }));
    const output = records.map(({ mode, sha, path: p }) => `${mode} blob ${sha}\t${p}\0`).join('');
    assert.ok(Buffer.byteLength(output) > 1024 * 1024);
    const git = path.join(dir, 'git');
    writeFileSync(git, `#!/usr/bin/env node
process.stdout.write(${JSON.stringify(output)});
`);
    chmodSync(git, 0o755);
    const sorted = records.sort((a, b) => a.path.localeCompare(b.path));
    const expected = createHash('sha256');
    expected.update('openchamber-v2-web-package-fingerprint-v1\0');
    for (const entry of sorted) {
      for (const value of [entry.mode, entry.path, entry.sha]) {
        expected.update(value);
        expected.update('\0');
      }
    }
    const script = fileURLToPath(new URL('./web-package-fingerprint.mjs', import.meta.url));
    const actual = execFileSync(process.execPath, [script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH },
    }).trim();
    assert.equal(actual, expected.digest('hex'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
