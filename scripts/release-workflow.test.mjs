import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
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
