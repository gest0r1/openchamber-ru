import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePackageManifest } from './reuse-release-web-package.mjs';
test('release package reuse binds source, fingerprint, version and immutable asset identity', () => {
 const source='a'.repeat(40), packageSource='b'.repeat(40), fingerprint='c'.repeat(64);
 const valid={schema_version:1,platform:'linux-x64',source_sha:source,package_source_sha:packageSource,package_tag:`v2-web-package-${packageSource}`,asset:`openchamber-web-${packageSource}.tgz`,sha256:'d'.repeat(64),runtime_fingerprint:fingerprint,openchamber_version:'2.1.0'};
 const expected={source,fingerprint,version:'2.1.0'};
 assert.equal(validatePackageManifest(valid,expected),valid);
 for (const key of ['source_sha','runtime_fingerprint','openchamber_version','sha256','asset','package_tag','platform']) assert.throws(()=>validatePackageManifest({...valid,[key]:'wrong'},expected),/Invalid/);
});
