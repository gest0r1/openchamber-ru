import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./finalize-latest-yml.mjs', import.meta.url));

const manifest = (architecture) => `version: 1.2.3
files:
  - url: OpenChamber-1.2.3-win-${architecture}.exe
    sha512: ${architecture}-checksum
    size: 123
releaseDate: '2026-07-30T00:00:00.000Z'
`;

const createFixture = ({ includeX64 = true } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-latest-yml-'));
  const artifacts = path.join(root, 'artifacts');
  const output = path.join(root, 'output');
  if (includeX64) {
    fs.mkdirSync(path.join(artifacts, 'latest-yml-x86_64-pc-windows-msvc'), { recursive: true });
    fs.writeFileSync(path.join(artifacts, 'latest-yml-x86_64-pc-windows-msvc', 'latest.yml'), manifest('x64'));
  } else {
    fs.mkdirSync(artifacts, { recursive: true });
  }
  fs.mkdirSync(output);
  return { root, artifacts, output };
};

const environment = ({ artifacts, output }) => ({
  ...process.env,
  LATEST_YML_DIR: artifacts,
  RUNNER_TEMP: output,
  GH_REPO: 'openchamber/openchamber',
  OPENCHAMBER_VERSION: '1.2.3',
});

test('writes the x64 Windows update channel only', (context) => {
  const fixture = createFixture();
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  execFileSync(process.execPath, [script], { env: environment(fixture) });

  const x64 = fs.readFileSync(path.join(fixture.output, 'latest.yml'), 'utf8');
  assert.match(x64, /win-x64\.exe/);
  assert.equal(fs.existsSync(path.join(fixture.output, 'latest-arm64.yml')), false);
});

test('fails when the required x64 Windows update manifest is missing', (context) => {
  const fixture = createFixture({ includeX64: false });
  context.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [script], { env: environment(fixture), encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /x64 Windows update manifest is required/);
});
