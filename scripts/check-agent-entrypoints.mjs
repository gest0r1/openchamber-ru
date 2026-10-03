import fs from 'node:fs';
const guide = fs.readFileSync('CLAUDE.md', 'utf8');
if (!guide.includes('[AGENTS.md](AGENTS.md)') || guide.length > 500) throw Error('CLAUDE.md must route to canonical AGENTS.md');
if (!fs.readFileSync('AGENTS.md', 'utf8').includes('Instruction Order')) throw Error('Canonical agent guide is missing');
console.log('agent entrypoints: PASS');
