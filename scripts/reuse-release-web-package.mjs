import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export function validatePackageManifest(manifest, { source, fingerprint, version }) {
  if (manifest.schema_version !== 1 || manifest.platform !== 'linux-x64' || manifest.source_sha !== source
    || manifest.runtime_fingerprint !== fingerprint || manifest.openchamber_version !== version
    || !/^[a-f0-9]{40}$/.test(manifest.package_source_sha ?? '')
    || manifest.package_tag !== `v2-web-package-${manifest.package_source_sha}`
    || manifest.asset !== `openchamber-web-${manifest.package_source_sha}.tgz`
    || !/^[a-f0-9]{64}$/.test(manifest.sha256 ?? '')) throw Error('Invalid exact-SHA web package manifest');
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const { SOURCE_SHA: source, VERSION: version, GITHUB_REPOSITORY: repository } = process.env;
  if (!/^[a-f0-9]{40}$/.test(source ?? '') || !/^\d+\.\d+\.\d+$/.test(version ?? '') || !repository) throw Error('Invalid release identity');
  const output = path.resolve('packages/web');
  const temp = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || '/tmp', 'release-web-'));
  const gh = (...args) => execFileSync('gh', args, { stdio: 'pipe' });
  try {
    gh('release', 'download', `v2-web-package-${source}`, '--repo', repository, '--pattern', 'manifest.json', '--dir', temp);
    const fingerprint = execFileSync('node', ['scripts/web-package-fingerprint.mjs'], { encoding: 'utf8' }).trim();
    const manifest = validatePackageManifest(JSON.parse(fs.readFileSync(path.join(temp, 'manifest.json'), 'utf8')), { source, fingerprint, version });
    gh('release', 'download', manifest.package_tag, '--repo', repository, '--pattern', manifest.asset, '--dir', temp);
    const bytes = fs.readFileSync(path.join(temp, manifest.asset));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw Error('Web package checksum mismatch');
    fs.copyFileSync(path.join(temp, manifest.asset), path.join(output, `openchamber-web-${version}.tgz`));
    console.log(`Reused verified web package ${manifest.package_source_sha} for ${source}`);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
