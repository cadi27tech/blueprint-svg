#!/usr/bin/env node
// Render spec files to SVG: <name>.svg (wide layout) and <name>-m.svg (phone layout) per spec.
//   node bin/blueprint.mjs examples/*.json --out examples [--sans font.woff2] [--mono font.woff2]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { sheet } from '../src/drawing.mjs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? undefined : args.splice(i, 2)[1]; };
const out = opt('--out'), sans = opt('--sans'), mono = opt('--mono');
if (!args.length) { console.error('usage: blueprint <spec.json>... [--out dir] [--sans file.woff2] [--mono file.woff2]'); process.exit(2); }
const fonts = sans || mono ? { sans, mono } : undefined;
for (const file of args) {
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const dir = out || dirname(file), name = basename(file, '.json');
  mkdirSync(dir, { recursive: true });
  for (const [mode, suffix] of [['d', ''], ['m', '-m']]) {
    const p = join(dir, `${name}${suffix}.svg`);
    writeFileSync(p, sheet(spec, { mode, fonts }));
    console.log(`wrote ${p}`);
  }
}
