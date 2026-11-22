
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareRootGuestService, removeRootGuestServiceData } from './root-service-runtime.js';

test('root UI mirrors code and preserves mutable guest data under a genuinely unprivileged UID', async (t) => {
  if (process.getuid?.() !== 0) return t.skip('real-root CI required');
  const pw = spawnSync('id', ['-u', 'nobody'], { encoding: 'utf8' });
  if (pw.status !== 0) return t.skip('nobody unavailable');
  const uid = Number(pw.stdout.trim());
  const gid = Number(spawnSync('id', ['-g', 'nobody'], {encoding:'utf8'}).stdout.trim());
  assert.ok(uid > 0 && gid > 0);
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'root-guest-boundary-'));
  await fs.chmod(home, 0o755);
  try {
    const source = path.join(home, 'owner-private-package');
    const root = path.join(home, 'isolated');
    const original = path.join(home, 'owner-private-data');
    await fs.mkdir(source, {mode:0o700});
    await fs.mkdir(original, {mode:0o700});
    await fs.writeFile(path.join(source, 'index.js'), 'console.log("service v1")\n',{mode:0o600});
    await fs.writeFile(path.join(original, 'existing.txt'), 'previous sessions/data preserved\n',{mode:0o600});
    const initial = await prepareRootGuestService({guestId:'example', packageRoot:source, entry:'index.js', dataDir:original}, {root,uid,gid});
    assert.ok(initial.entry.startsWith(root));
    assert.equal(await fs.readFile(path.join(initial.dataDir,'existing.txt'),'utf8'),'previous sessions/data preserved\n');
    // The unprivileged process cannot read the owner source but can execute the
    // mirrored code, access only its own writable data, and cannot edit package.
    const safe = spawnSync('node',[initial.entry],{uid,gid,encoding:'utf8'});
    assert.equal(safe.status,0,safe.stderr);
    assert.match(safe.stdout,/service v1/);
    const secret = spawnSync('cat',[path.join(source,'index.js')],{uid,gid,encoding:'utf8'});
    assert.notEqual(secret.status,0);
    const write = spawnSync('sh',['-c','printf updated > "$1"','sh',path.join(initial.dataDir,'session.txt')],{uid,gid,encoding:'utf8'});
    assert.equal(write.status,0,write.stderr);
    const alter = spawnSync('sh',['-c','echo compromised >> "$1"','sh',initial.entry],{uid,gid,encoding:'utf8'});
    assert.notEqual(alter.status,0);
    await fs.writeFile(path.join(source,'index.js'),'console.log("service v2")\n');
    const later = await prepareRootGuestService({guestId:'example',packageRoot:source,entry:'index.js',dataDir:original},{root,uid,gid});
    const updated = spawnSync('node',[later.entry],{uid,gid,encoding:'utf8'});
    assert.match(updated.stdout,/service v2/);
    assert.equal(await fs.readFile(path.join(later.dataDir,'session.txt'),'utf8'),'updated');
    await assert.rejects(
      prepareRootGuestService({guestId:'../escape',packageRoot:source,entry:'index.js',dataDir:original},{root,uid,gid}),
      /ROOT_GUEST_INVALID_ID/
    );
    await fs.symlink('/etc/passwd',path.join(source,'bad-link'));
    await assert.rejects(
      prepareRootGuestService({guestId:'example',packageRoot:source,entry:'index.js',dataDir:original},{root,uid,gid}),
      /ROOT_GUEST_SOURCE_UNSAFE/
    );
    await fs.rm(path.join(source,'bad-link'));
    await removeRootGuestServiceData('example',{root});
    assert.equal(fssync.existsSync(later.dataDir),false);
    assert.equal(fssync.existsSync(original),true,'root data remains for rollback');
  } finally {
    await fs.rm(home,{recursive:true,force:true});
  }
});
