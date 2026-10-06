import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const version = JSON.parse(read('packages/electron/package.json')).opencodeCli.version;
if (!/^2\.\d+\.\d+$/.test(version)) throw Error('Electron must use an exact OpenCode v2 pin');
for (const file of ['package.json', 'packages/ui/package.json', 'packages/web/package.json', 'packages/vscode/package.json']) {
  const manifest = JSON.parse(read(file));
  for (const section of ['dependencies', 'devDependencies']) {
    for (const name of ['@opencode/client', '@opencode/schema', '@opencode/protocol']) {
      const pin = manifest[section]?.[name];
      if (pin !== undefined && pin !== version) throw Error(`${file}: ${name} differs from ${version}`);
    }
  }
}
const dockerPin = read('Dockerfile').match(/@opencode\/cli@(2\.\d+\.\d+)/)?.[1];
if (dockerPin !== version) throw Error(`Docker CLI differs from ${version}`);
const lock = read('bun.lock');
for (const name of ['client', 'schema', 'protocol']) {
  const pattern = new RegExp(`"@opencode/${name}": \\["@opencode/${name}@([^"\\s]+)"`);
  if (lock.match(pattern)?.[1] !== version) throw Error(`Locked @opencode/${name} differs from ${version}`);
}
for (const match of lock.matchAll(/"@opencode\/(?:client|schema|protocol)": "(2\.\d+\.\d+)"/g)) {
  if (match[1] !== version) throw Error(`Lockfile dependency differs from ${version}`);
}
if (process.argv[2] === '--expected') {
  if (process.argv[3] !== version) throw Error(`Distribution expects ${process.argv[3]}, OpenChamber pins ${version}`);
} else if (process.argv.length > 2) throw Error('Usage: node scripts/check-opencode-pins.mjs [--expected VERSION]');
console.log(`PASS: OpenChamber OpenCode pins ${version}`);
