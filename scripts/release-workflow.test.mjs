import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const workflowPath = fileURLToPath(new URL('../.github/workflows/release.yml', import.meta.url));
const workflow = yaml.parse(fs.readFileSync(workflowPath, 'utf8'));

test('publication requires successful release creation and every platform dependency', () => {
  assert.equal(workflow.jobs['combine-electron-manifests'], undefined);
  assert.equal(workflow.jobs['publish-electron-linux'], undefined);
  assert.deepEqual(workflow.jobs['finalize-release'].needs, [
    'create-release', 'build-desktop-electron-windows', 'build-desktop-electron-linux', 'package-web', 'mobile-release',
  ]);
  // Failures, cancellation, an existing release and dry-run must never publish a partial release.
  assert.equal(workflow.jobs['finalize-release'].if,
    "${{ !cancelled() && !failure() && needs.create-release.result == 'success' && github.event.inputs.dry_run != 'true' }}");
  for (const job of ['build-desktop-electron-windows', 'build-desktop-electron-linux', 'package-web']) {
    assert.equal(workflow.jobs[job].needs, 'create-release');
  }
});

const identityStep = workflow.jobs['authorize-release'].steps.find(step => step.id === 'identity');
for (const [state, expectedStatus, expectedProceed] of [
  ['draft', 0, 'true'], ['published', 0, 'false'], ['missing', 0, 'true'], ['unavailable', 1, null],
]) {
  test(`release authorization handles ${state} through the executable workflow`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-contract-'));
    try {
      for (const file of ['package.json', 'packages/web/package.json', 'packages/electron/package.json', '.github/release-request.json']) {
        const target = path.join(dir, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify({ version: '2.1.1' }));
      }
      fs.writeFileSync(path.join(dir, 'gh'), `#!/bin/bash
case "$RELEASE_STATE" in
  draft) echo '{"draft":true}' ;;
  published) echo '{"draft":false}' ;;
  missing) echo 'gh: Not Found (HTTP 404)' >&2; exit 1 ;;
  unavailable) echo 'gh: Service Unavailable (HTTP 503)' >&2; exit 1 ;;
esac
`, { mode: 0o755 });
      const output = path.join(dir, 'outputs');
      const result = spawnSync('bash', ['-c', identityStep.run], {
        cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`,
          RELEASE_STATE: state, EVENT_NAME: 'workflow_run', SOURCE_SHA: 'a'.repeat(40),
          INPUT_VERSION: '', REF_NAME: 'main', GITHUB_OUTPUT: output, GITHUB_REPOSITORY: 'owner/repo' },
      });
      assert.equal(result.status, expectedStatus, result.stderr);
      const outputs = fs.readFileSync(output, 'utf8');
      if (expectedProceed) assert.match(outputs, new RegExp(`proceed=${expectedProceed}`));
      else assert.doesNotMatch(outputs, /proceed=/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
