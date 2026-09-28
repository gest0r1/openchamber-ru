import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

test('release workflows are x64-only and never purge repository-wide artifacts', () => {
  const release = read('.github/workflows/release.yml');
  const windows = read('.github/workflows/release-desktop-win.yml');
  const smoke = read('.github/workflows/release-desktop-smoke.yml');

  for (const [name, source] of [['release', release], ['windows', windows], ['smoke', smoke]]) {
    assert.doesNotMatch(source, /arm64|aarch64/i, `${name} must not schedule ARM desktop builds`);
    assert.doesNotMatch(source, /repos\/\$GH_REPO\/actions\/artifacts\?per_page=100/,
      `${name} must not delete repository-wide artifacts`);
  }

  assert.match(release, /actions\/runs\/\$GITHUB_RUN_ID\/artifacts\?per_page=100/);
  assert.equal(existsSync(path.join(root, '.github/workflows/build-macos-arm64-dmg.yml')), false);

  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts?.['release:test:arm'], undefined);
  assert.doesNotMatch(read('scripts/test-release-build.sh'), /arm64|aarch64/i);
});

test('Linux exact-SHA workflow reuses verified bundles without Actions artifact storage', () => {
  const linux = read('.github/workflows/integration-linux-bundle.yml');
  assert.match(linux, /scripts\/linux-bundle-fingerprint\.mjs/);
  assert.match(linux, /bundle_source_sha/);
  assert.match(linux, /bundle_fingerprint/);
  assert.match(linux, /Reusing verified x64 bundle/);
  assert.doesNotMatch(linux, /actions\/upload-artifact/);
  assert.doesNotMatch(linux, /actions\/download-artifact/);
  assert.doesNotMatch(linux, /\n\s+paths:\n/);
});

test('Windows PR delivery smoke verifies installer without retaining a large Actions artifact', () => {
  const smoke = read('.github/workflows/integration-windows-desktop-smoke.yml');
  assert.match(smoke, /Check generated installer and checksum/);
  assert.doesNotMatch(smoke, /actions\/upload-artifact/);
});

test('production release uploads the x64 Linux AppImage directly to the GitHub Release', () => {
  const release = read('.github/workflows/release.yml');
  assert.match(release, /Upload validated x64 Linux files directly to release/);
  assert.doesNotMatch(release, /linux-release-arm64|latest-linux-arm64|latest-arm64\.yml/);
  assert.doesNotMatch(release, /publish-electron-linux:/);
});
