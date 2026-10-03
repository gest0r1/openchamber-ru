import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, root), 'utf8');

test('V2 release uses x64 targets, direct uploads and guarded publication', () => {
  for (const name of ['release.yml', 'release-desktop-smoke.yml']) {
    const source = read('.github/workflows/' + name);
    assert.doesNotMatch(source, /arm64|aarch64/i);
    if (name === 'release.yml') assert.doesNotMatch(source, /actions\/(?:upload|download)-artifact/);
    assert.doesNotMatch(source, /actions\/artifacts\?per_page=100/);
  }
  const release = read('.github/workflows/release.yml');
  assert.match(release, /needs.create-release.result == 'success'/);
  assert.match(release, /reuse-release-web-package.mjs/);
  assert.match(release, /Publish validated Linux release files/);
  assert.match(release, /build_android: true/);
  for (const name of ['integration-linux-bundle.yml', 'integration-windows-desktop-smoke.yml', 'release-desktop-win.yml', 'build-macos-arm64-dmg.yml']) {
    assert.equal(existsSync(fileURLToPath(new URL('.github/workflows/' + name, root))), false);
  }
  assert.equal(JSON.parse(read('package.json')).scripts?.['release:test:arm'], undefined);
});

test('Windows keeps directory selection and desktop shortcuts', () => {
  const nsis = JSON.parse(read('packages/electron/package.json')).build.nsis;
  assert.equal(nsis.oneClick, false);
  assert.equal(nsis.allowToChangeInstallationDirectory, true);
  assert.equal(nsis.createDesktopShortcut, true);
  assert.equal(nsis.createStartMenuShortcut, true);
});

