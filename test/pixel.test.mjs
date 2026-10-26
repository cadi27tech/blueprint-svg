import test from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, pixels, pixelWord } from '../index.mjs';

test('every glyph is 7 rows of one width, drawn only with # and .', () => {
  for (const [ch, g] of Object.entries(GLYPHS)) {
    assert.equal(g.length, 7, `${ch}: rows`);
    assert.ok(g.every((r) => r.length === g[0].length), `${ch}: ragged rows`);
    assert.ok(g.every((r) => /^[#.]+$/.test(r)), `${ch}: stray character`);
    assert.ok(g.some((r) => r.includes('#')), `${ch}: blank glyph`);
  }
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') assert.ok(GLYPHS[ch], `missing ${ch}`);
});

test('width: glyph widths plus one column between letters, three for a space', () => {
  assert.equal(pixels('A').width, 5);
  assert.equal(pixels('AI').width, 5 + 1 + 3);
  assert.equal(pixels('A A').width, 5 + 1 + 3 + 5);
  assert.equal(pixels('adrian').width, pixels('ADRIAN').width, 'case-insensitive');
});

test('pixel count equals the lit cells of the glyphs', () => {
  const lit = (ch) => GLYPHS[ch].join('').split('#').length - 1;
  assert.equal(pixels('AC').pixels.length, lit('A') + lit('C'));
  const { svg } = pixelWord('AC', { size: 4 });
  assert.equal((svg.match(/<rect /g) || []).length, lit('A') + lit('C'));
});

test('unknown characters throw instead of leaving a gap', () => {
  assert.throws(() => pixels('A?'), /no glyph for "\?"/);
});

test('stagger adds a delay per pixel, size scales the grid', () => {
  const plain = pixelWord('I', { size: 2 }), staggered = pixelWord('I', { size: 2, stagger: 11 });
  assert.ok(!plain.svg.includes('--d'));
  assert.ok(staggered.svg.includes('--d:'));
  assert.equal(plain.width, 6);
  assert.equal(plain.height, 14);
});
