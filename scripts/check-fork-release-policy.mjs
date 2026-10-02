#!/usr/bin/env node
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const release = read('.github/workflows/release.yml');
const smoke = read('.github/workflows/release-desktop-smoke.yml');
const mobile = read('.github/workflows/mobile-release.yml');
const updater = read('packages/electron/updater-feed.mjs');

const requireText = (text, pattern, label) => {
  if (!pattern.test(text)) throw new Error(`missing fork release contract: ${label}`);
};
const forbidText = (text, pattern, label) => {
  if (pattern.test(text)) throw new Error(`forbidden fork release contract: ${label}`);
};

requireText(release, /^  package-web:/m, 'web tarball packaging job');
requireText(release, /target: x86_64-pc-windows-msvc/, 'Windows x64 target');
requireText(release, /artifact_arch: x86_64/, 'Linux x64 target');
requireText(release, /build_android: true/, 'Android release enabled');
requireText(release, /build_ios: false/, 'iOS release disabled');
requireText(release, /needs: \[create-release, build-desktop-electron-windows, build-desktop-electron-linux, publish-electron-linux, package-web, combine-electron-manifests, mobile-release\]/, 'final release dependency set');

forbidText(release, /\baarch64\b|\barm64\b/i, 'ARM release target');
forbidText(release, /macos|latest-mac/i, 'macOS release target');
forbidText(release, /bun publish|NPM_TOKEN|publish-npm/, 'npm publication');
forbidText(release, /blacksmith/i, 'external release runner');
forbidText(smoke, /\baarch64\b|\barm64\b|build_macos|build-macos|blacksmith/i, 'unsupported desktop smoke target');
requireText(smoke, /target: x86_64-pc-windows-msvc/, 'Windows smoke x64');
requireText(smoke, /artifact_arch: x86_64/, 'Linux smoke x64');
requireText(mobile, /android-release:[\s\S]*?runs-on: ubuntu-24\.04/, 'Android GitHub-hosted runner');

requireText(updater, /owner: 'gest0r1'/, 'fork updater owner');
requireText(updater, /repo: 'openchamber-ru'/, 'fork updater repository');

console.log('fork release policy: PASS');
