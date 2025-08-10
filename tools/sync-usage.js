#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Source USAGE.md candidates (prefer local fte2 path if exists)
const candidates = [
  process.env.FTE2_USAGE || '/Users/vedmalex/work/fte2/USAGE.md'
];

function readFirstExisting(paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    } catch {}
  }
  return null;
}

function main() {
  const content = readFirstExisting(candidates);
  if (!content) {
    console.error('USAGE.md source not found. Set FTE2_USAGE env or adjust script.');
    process.exit(1);
  }
  const dst = path.join(__dirname, '..', 'USAGE.md');
  fs.writeFileSync(dst, content, 'utf8');
  console.log('USAGE.md synced from:', candidates.find(fs.existsSync));
}

main();
