import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { layout, drawing, sheet, wrap } from '../index.mjs';

const base = () => ({
  title: 'T', dwg: 'DWG T-1', rev: 'REV 1',
  nodes: [
    ['a', 0, 0, 1, 'ext', 'Source', 'outside'],
    ['b', 0, 1, 1, 'sys', 'Worker', 'built'],
    ['c', 1, 1, 2, 'gate', 'Approval', 'a person'],
    ['d', 2, 0, 2, 'live', 'Live', 'in production'],
  ],
  edges: [['a', 'b'], ['b', 'c', 'checked'], ['c', 'd']],
  zones: [['Boundary', ['b', 'c']]],
  m: ['a', 'b', 'c', 'd'],
});

test('every node is drawn once, with its kind, in both layouts', () => {
  for (const mode of ['d', 'm']) {
    const { svg } = drawing(base(), mode);
    assert.equal((svg.match(/<g class="k-/g) || []).length, 4, mode);
    for (const k of ['ext', 'sys', 'gate', 'live']) assert.ok(svg.includes(`class="k-${k}"`), `${mode}: ${k}`);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), `${mode}: a coordinate did not compute`);
  }
});

test('gates get a double frame, live nodes a lamp, outside nodes a dashed frame', () => {
  const { svg } = drawing(base(), 'd');
  assert.equal((svg.match(/class="r r2 d"/g) || []).length, 1);
  assert.equal((svg.match(/class="lamp f"/g) || []).length, 1);
  assert.equal((svg.match(/class="r x f"/g) || []).length, 1);
});

test('wide-layout edges may only go down one row or across a row', () => {
  const skip = base(); skip.edges.push(['a', 'd']);
  assert.throws(() => drawing(skip, 'd'), /skips a row/);
  const up = base(); up.edges.push(['d', 'a']);
  assert.throws(() => drawing(up, 'd'), /points up/);
  // On phones the same edge is legal: it runs in the side channel.
  assert.doesNotThrow(() => drawing(skip, 'm'));
});

test('bad specs fail loud', () => {
  const missing = base(); missing.edges.push(['a', 'zz']);
  assert.throws(() => drawing(missing, 'd'), /missing node/);
  const kind = base(); kind.nodes[0][4] = 'nope';
  assert.throws(() => layout(kind, 'd'), /unknown kind/);
  const dup = base(); dup.nodes.push(['a', 3, 0, 1, 'sys', 'Again']);
  assert.throws(() => layout(dup, 'd'), /duplicate node id/);
  const order = base(); order.m = ['a', 'b', 'c'];
  assert.throws(() => layout(order, 'm'), /every node exactly once/);
  const wide = base(); wide.nodes[3][3] = 5;
  assert.throws(() => layout(wide, 'd'), /runs past column/);
  const zone = base(); zone.zones = [['Z', ['a', 'zz']]];
  assert.throws(() => drawing(zone, 'd'), /zone "Z" names a missing node/);
});

test('labels wrap inside their box', () => {
  const s = base();
  s.nodes[1][5] = 'A deliberately long label that has to wrap over several lines to fit';
  for (const mode of ['d', 'm']) {
    const { nodes } = layout(s, mode);
    for (const n of nodes) {
      const max = Math.floor((n.w - 24) / 7.6);
      for (const line of n.ll) assert.ok(line.length <= max || !line.includes(' '), `${mode} ${n.id}: "${line}" over ${max}`);
    }
  }
  assert.deepEqual(wrap('one two three', 7), ['one two', 'three']);
});

test('rows share a height, and the phone layout stacks in the m order', () => {
  const d = layout(base(), 'd');
  assert.equal(d.by.a.h, d.by.b.h);
  assert.ok(d.by.c.y > d.by.b.y + d.by.b.h);
  const m = layout(base(), 'm');
  const ys = base().m.map((id) => m.by[id].y);
  assert.deepEqual([...ys].sort((x, y) => x - y), ys);
});

test('output is deterministic, escapes text, and honours reduced motion', () => {
  const s = base();
  s.nodes[0][5] = 'R&D <lab> "quoted"';
  const a = sheet(s), b = sheet(s);
  assert.equal(a, b);
  assert.ok(a.includes('R&amp;D &lt;lab&gt; &quot;quoted&quot;'));
  assert.ok(a.includes('prefers-reduced-motion:reduce'));
  assert.ok(!/<script|href="http/.test(a), 'a sheet must not script or fetch anything');
});

test('committed examples match what the code renders now', () => {
  const dir = new URL('../examples/', import.meta.url);
  const specs = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(specs.length >= 2);
  for (const f of specs) {
    const spec = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    const name = f.replace(/\.json$/, '');
    assert.equal(readFileSync(new URL(`${name}.svg`, dir), 'utf8'), sheet(spec, { mode: 'd' }), `${name}.svg is stale: npm run examples`);
    assert.equal(readFileSync(new URL(`${name}-m.svg`, dir), 'utf8'), sheet(spec, { mode: 'm' }), `${name}-m.svg is stale: npm run examples`);
  }
});

test('a wrapped zone label stays above the first node of its zone', () => {
  const spec = base();
  spec.zones = [['A boundary label long enough to wrap onto a second line in the phone layout', ['b', 'c']]];
  for (const mode of ['d', 'm']) {
    const { nodes } = layout(spec, mode);
    const top = Math.min(...nodes.filter((n) => ['b', 'c'].includes(n.id)).map((n) => n.y));
    const zl = drawing(spec, mode).svg.match(/<text class="zl">(.*?)<\/text>/)[1];
    const lines = [...zl.matchAll(/y="([\d.]+)"/g)].map((m) => +m[1]);
    if (mode === 'm') assert.ok(lines.length > 1, 'the label wraps on phones');
    for (const y of lines) assert.ok(y < top, `${mode}: label line at ${y} runs into the node at ${top}`);
  }
});
