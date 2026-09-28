import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'install-linux-integration-bundle.sh');

function write(file, content, mode) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  if (mode) chmodSync(file, mode);
}

test('schema v3 installs reused bundle under bundle_source_sha', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'openchamber-bundle-install-'));
  const bundle = path.join(tmp, 'bundle');
  const pkg = path.join(bundle, 'package');
  const sourceSha = 'a'.repeat(40);
  const bundleSha = 'b'.repeat(40);
  const version = '1.18.31';

  write(path.join(pkg, 'package.json'), JSON.stringify({
    dependencies: { '@opencode-ai/sdk': version },
  }));
  write(path.join(pkg, 'packages/web/package.json'), JSON.stringify({
    dependencies: { '@opencode-ai/sdk': version },
  }));
  write(path.join(pkg, 'packages/web/bin/cli.js'), 'console.log("1.24.2");\n');
  write(path.join(pkg, 'packages/sdk/dist/index.js'), 'export const ok = true;\n');
  write(path.join(pkg, 'opencode-cli/node_modules/.bin/opencode'), `#!/bin/sh\necho ${version}\n`, 0o755);

  const asset = `openchamber-integration-linux-x64-${bundleSha}.tar.gz`;
  const archive = path.join(tmp, asset);
  execFileSync('tar', ['-C', bundle, '-czf', archive, 'package']);
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  const manifest = path.join(tmp, 'manifest.json');
  writeFileSync(manifest, JSON.stringify({
    schema_version: 3,
    platform: 'linux-x64',
    source_sha: sourceSha,
    bundle_source_sha: bundleSha,
    bundle_tag: `linux-bundle-${bundleSha}`,
    asset,
    sha256: digest,
    opencode_version: version,
    bundle_fingerprint: 'c'.repeat(64),
  }, null, 2));

  const prefix = path.join(tmp, 'prefix');
  execFileSync('bash', [script, archive, manifest, prefix], { stdio: 'pipe' });

  assert.equal(realpathSync(path.join(prefix, 'current')), path.join(prefix, 'releases', bundleSha));
  assert.equal(realpathSync(path.join(prefix, 'bin/opencode')), path.join(prefix, 'releases', bundleSha, 'opencode-cli/node_modules/.bin/opencode'));
  assert.equal(readFileSync(path.join(prefix, 'releases', bundleSha, 'packages/sdk/dist/index.js'), 'utf8'), 'export const ok = true;\n');
});
