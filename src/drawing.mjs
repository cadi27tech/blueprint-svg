// System drawings as standalone SVG: one spec, two layouts (a column grid for wide screens, a single column for phones).
// The output has no scripts and no external references, so it renders inside an <img> tag, including on GitHub.
import { readFileSync } from 'node:fs';

export const THEME = {
  ground: '#0B2A5C', // Prussian sheet
  deep: '#061936', // node fill, zone label plate
  ink: '#070B12', // fill for nodes outside the system
  paper: '#E9EEF5', // labels
  muted: '#97A6BB', // frames of nodes outside the system
  sub: '#B4C3D8', // sub-labels
  draft: '#9CC3FF', // line work
  signal: '#FF8A2A', // live in production, and nothing else
};

const LAYOUT = {
  d: { W: 960, cols: 4, mx: 16, gx: 28, gy: 52, lw: 7.6, sw: 7, ch: 0 },
  m: { W: 360, cols: 1, mx: 10, gx: 0, gy: 40, lw: 7.6, sw: 7, ch: 44 },
};
export const KINDS = ['ext', 'sys', 'gate', 'out', 'live'];

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (v) => +v.toFixed(1);

/** Greedy word wrap to at most `max` characters a line (a single longer word keeps its own line). */
export const wrap = (s, max) => s.split(' ').reduce((ls, w) => {
  const l = ls[ls.length - 1];
  if (l !== undefined && `${l} ${w}`.length <= max) ls[ls.length - 1] = `${l} ${w}`; else ls.push(w);
  return ls;
}, []);

/**
 * Lay out and draw the body of a spec.
 * spec.nodes: [id, row, col, span, kind, label, sub?]   kinds: ext (outside the system, dashed), sys (built),
 *             gate (a person or a hard check, double frame), out (result), live (in production, signal lamp)
 * spec.edges: [from, to, label?, flags?]   flags: 'x' dashed, 'd' wide layout only
 * spec.zones: [label, [ids]]   dashed boundary around a group of nodes
 * spec.m:     node order for the phone layout (defaults to spec.nodes order)
 * spec.cols:  columns of the wide layout (default 4)
 * Wide-layout edges run down to the next row or across a row; anything else throws, so a drawing never ships with a
 * connector that crosses a box. On phones an edge that skips a node runs in a side channel on the right.
 */
export function layout(spec, mode = 'd') {
  const L = { ...LAYOUT[mode] };
  if (!L.W) throw new Error(`unknown mode "${mode}": use "d" or "m"`);
  if (mode === 'd' && spec.cols) L.cols = spec.cols;
  const name = spec.title || 'drawing';
  const nodes = spec.nodes.map(([id, r, c, span, kind, lab, sub]) => {
    if (!KINDS.includes(kind)) throw new Error(`${name}: node ${id} has unknown kind "${kind}"`);
    return { id, r, c, span, kind, lab, sub };
  });
  const by = Object.fromEntries(nodes.map((n) => [n.id, n]));
  if (Object.keys(by).length !== nodes.length) throw new Error(`${name}: duplicate node id`);
  const cw = (L.W - 2 * L.mx - L.ch - (L.cols - 1) * L.gx) / L.cols;
  for (const n of nodes) {
    if (mode === 'd' && n.c + n.span > L.cols) throw new Error(`${name}: node ${n.id} runs past column ${L.cols}`);
    n.w = mode === 'd' ? n.span * cw + (n.span - 1) * L.gx : cw;
    n.x = mode === 'd' ? L.mx + n.c * (cw + L.gx) : L.mx;
    n.ll = wrap(n.lab, Math.floor((n.w - 24) / L.lw));
    n.sl = n.sub ? wrap(n.sub.toUpperCase(), Math.floor((n.w - 24) / L.sw)) : [];
    n.h = 30 + (n.ll.length - 1) * 19 + (n.sl.length ? 18 + (n.sl.length - 1) * 14 : 0) + 14;
  }
  let H;
  const top = 30;
  if (mode === 'd') {
    const rows = Math.max(...nodes.map((n) => n.r)) + 1, rh = Array(rows).fill(0), ry = [];
    nodes.forEach((n) => { rh[n.r] = Math.max(rh[n.r], n.h); });
    rh.forEach((h, r) => { ry[r] = r ? ry[r - 1] + rh[r - 1] + L.gy : top; });
    nodes.forEach((n) => { n.y = ry[n.r]; n.h = rh[n.r]; n.t = n.r * 0.3 + n.c * 0.07; });
    H = ry[rows - 1] + rh[rows - 1] + 24;
  } else {
    const order = spec.m || nodes.map((n) => n.id);
    if (order.length !== nodes.length || new Set(order).size !== order.length || order.some((id) => !by[id])) {
      throw new Error(`${name}: m must list every node exactly once`);
    }
    let y = top;
    order.forEach((id, i) => { const n = by[id]; n.i = i; n.y = y; y += n.h + L.gy; n.t = i * 0.11; });
    H = y - L.gy + 24;
  }
  return { L, nodes, by, H, name };
}

export function drawing(spec, mode = 'd') {
  const { L, nodes, by, H, name } = layout(spec, mode);
  const T = (t) => ` style="--t:${t.toFixed(2)}s"`;
  let chan = 0;
  const edges = (spec.edges || []).filter(([, , , fl = '']) => mode === 'd' || !fl.includes('d')).map(([a, b, lab = '', fl = '']) => {
    const A = by[a], B = by[b];
    if (!A || !B) throw new Error(`${name}: edge ${a} -> ${b} names a missing node`);
    let d, ex, ey, dir, lx, ly, anchor = 'middle';
    if (mode === 'm' && B.i !== A.i + 1) {
      const X = A.x + A.w + 12 + chan++ * 9, ay = A.y + A.h / 2, by2 = B.y + B.h / 2;
      d = `M${f1(A.x + A.w)} ${f1(ay)}H${f1(X)}V${f1(by2)}H${f1(B.x + B.w)}`; ex = B.x + B.w; ey = by2; dir = 'l'; lab = '';
    } else if (mode === 'm' || B.r > A.r) {
      if (mode === 'd' && B.r !== A.r + 1) throw new Error(`${name}: edge ${a} -> ${b} skips a row`);
      const lo = Math.max(A.x, B.x) + 18, hi = Math.min(A.x + A.w, B.x + B.w) - 18;
      if (lo <= hi) {
        const x = Math.min(Math.max(A.w <= B.w ? A.x + A.w / 2 : B.x + B.w / 2, lo), hi);
        d = `M${f1(x)} ${f1(A.y + A.h)}V${f1(B.y)}`; ex = x; ey = B.y; lx = x + 8; ly = (A.y + A.h + B.y) / 2 + 3; anchor = 'start';
      } else {
        const ax = A.x + A.w / 2, bx = B.x + B.w / 2, my = B.y - L.gy / 2;
        d = `M${f1(ax)} ${f1(A.y + A.h)}V${f1(my)}H${f1(bx)}V${f1(B.y)}`; ex = bx; ey = B.y; lx = (ax + bx) / 2; ly = my - 6;
      }
      dir = 'd';
    } else if (B.r === A.r) {
      const y = A.y + A.h / 2, right = B.x > A.x;
      d = right ? `M${f1(A.x + A.w)} ${f1(y)}H${f1(B.x)}` : `M${f1(A.x)} ${f1(y)}H${f1(B.x + B.w)}`;
      ex = right ? B.x : B.x + B.w; ey = y; dir = right ? 'r' : 'l'; lab = ''; // the gap between columns has no room for a label
    } else throw new Error(`${name}: edge ${a} -> ${b} points up`);
    const head = {
      d: `M${f1(ex - 4)} ${f1(ey - 7)}L${f1(ex)} ${f1(ey)}L${f1(ex + 4)} ${f1(ey - 7)}`,
      r: `M${f1(ex - 7)} ${f1(ey - 4)}L${f1(ex)} ${f1(ey)}L${f1(ex - 7)} ${f1(ey + 4)}`,
      l: `M${f1(ex + 7)} ${f1(ey - 4)}L${f1(ex)} ${f1(ey)}L${f1(ex + 7)} ${f1(ey + 4)}`,
    }[dir];
    const t = A.t + 0.35, dash = fl.includes('x');
    return `<path class="e ${dash ? 'x f' : 'd'}" d="${d}"${dash ? '' : ' pathLength="1"'}${T(t)}/><path class="a f" d="${head}"${T(t + 0.5)}/>${lab ? `<text class="el f" x="${f1(lx)}" y="${f1(ly)}" text-anchor="${anchor}"${T(t + 0.5)}>${esc(lab.toUpperCase())}</text>` : ''}`;
  }).join('');
  const zones = (spec.zones || []).map(([lab, ids]) => {
    const ns = ids.map((id) => by[id]);
    if (ns.some((n) => !n)) throw new Error(`${name}: zone "${lab}" names a missing node`);
    if (mode === 'm') { const ix = ns.map((n) => n.i); if (Math.max(...ix) - Math.min(...ix) !== ix.length - 1) return null; }
    const x0 = Math.min(...ns.map((n) => n.x)) - 10, y0 = Math.min(...ns.map((n) => n.y)) - 13;
    const x1 = Math.max(...ns.map((n) => n.x + n.w)) + 10, y1 = Math.max(...ns.map((n) => n.y + n.h)) + 13;
    const t = Math.min(...ns.map((n) => n.t));
    const text = lab.toUpperCase(), maxCh = Math.floor((x1 - x0 - 34) / 6.7);
    const tl = text.length > maxCh ? wrap(text, maxCh) : [text];
    const tw = Math.max(...tl.map((l) => l.length)) * 6.7 + 14, th = 16 + (tl.length - 1) * 12;
    const up = (tl.length - 1) * 12; // a wrapped label grows upward, into the gap above, never down over the first node
    return {
      box: `<rect class="z f" x="${f1(x0)}" y="${f1(y0)}" width="${f1(x1 - x0)}" height="${f1(y1 - y0)}"${T(t)}/>`,
      tag: `<g class="f"${T(t + 0.2)}><rect class="zb" x="${f1(x0 + 10)}" y="${f1(y0 - 8 - up)}" width="${f1(tw)}" height="${th}"/><text class="zl">${tl.map((l, k) => `<tspan x="${f1(x0 + 17)}" y="${f1(y0 + 3.5 - up + k * 12)}">${esc(l)}</tspan>`).join('')}</text></g>`,
    };
  }).filter(Boolean);
  const body = nodes.map((n) => {
    const r = (cls, k, extra = '') => `<rect class="${cls}" x="${f1(n.x + k)}" y="${f1(n.y + k)}" width="${f1(n.w - 2 * k)}" height="${f1(n.h - 2 * k)}"${extra}${T(n.t)}/>`;
    const tx = f1(n.x + 12);
    let y = n.y + 26;
    const lab = `<text class="l f"${T(n.t + 0.3)}>${n.ll.map((l, k) => `<tspan x="${tx}" y="${f1(y + k * 19)}">${esc(l)}</tspan>`).join('')}</text>`;
    y += (n.ll.length - 1) * 19 + 18;
    const sub = n.sl.length ? `<text class="s f"${T(n.t + 0.4)}>${n.sl.map((l, k) => `<tspan x="${tx}" y="${f1(y + k * 14)}">${esc(l)}</tspan>`).join('')}</text>` : '';
    const frame = n.kind === 'ext' ? r('r x f', 0) : r('r d', 0, ' pathLength="1"');
    const inner = n.kind === 'gate' ? r('r r2 d', 4, ' pathLength="1"') : '';
    const lamp = n.kind === 'live' ? `<circle class="lamp f" cx="${f1(n.x + n.w - 13)}" cy="${f1(n.y + 13)}" r="3.5"${T(n.t + 0.5)}/>` : '';
    return `<g class="k-${n.kind}">${r('bg f', 0)}${frame}${inner}${lamp}${lab}${sub}</g>`;
  }).join('');
  return { W: L.W, H, svg: `${zones.map((z) => z.box).join('')}${edges}${zones.map((z) => z.tag).join('')}${body}` };
}

/** @font-face rule with the font file embedded, so the SVG keeps its type inside an <img>. */
export const fontFace = (family, file, weight = '400') =>
  `@font-face{font-family:'${family}';font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(file).toString('base64')}) format('woff2')}`;

export function css(theme = THEME, { sans = "'Instrument Sans',system-ui,'Segoe UI',sans-serif", mono = "'IBM Plex Mono',ui-monospace,Consolas,monospace", faces = '' } = {}) {
  const c = theme;
  return `${faces}
.bg{fill:${c.deep};fill-opacity:.82}.k-ext .bg{fill:${c.ink};fill-opacity:.7}
.r{fill:none;stroke:${c.draft};stroke-width:1.2}.k-ext .r{stroke:${c.muted}}.r.x{stroke-dasharray:5 4}.r2{stroke-width:.8;opacity:.75}
.k-out .r{stroke:${c.paper};stroke-width:1.6}.k-live .r{stroke:${c.signal}}.lamp{fill:${c.signal}}
.l{font:500 15px ${sans};fill:${c.paper}}.s{font:400 10.5px ${mono};letter-spacing:.06em;fill:${c.sub}}
.e,.a{fill:none;stroke:${c.draft};stroke-width:1.2}.e.x{stroke-dasharray:4 4}
.el{font:400 9px ${mono};letter-spacing:.08em;fill:${c.draft}}
.z{fill:${c.draft};fill-opacity:.03;stroke:${c.draft};stroke-width:1;stroke-dasharray:2 5}.zb{fill:${c.deep}}
.zl{font:400 9.5px ${mono};letter-spacing:.1em;fill:${c.draft}}
.tag{font:400 10px ${mono};letter-spacing:.14em;fill:${c.draft}}.tag2{font:400 10px ${mono};letter-spacing:.14em;fill:${c.muted}}
.d{stroke-dasharray:1;stroke-dashoffset:0;animation:draw 1.1s cubic-bezier(.2,.7,0,1) var(--t) backwards}
.f{animation:fade .7s ease var(--t) backwards}
@keyframes draw{from{stroke-dashoffset:1}}@keyframes fade{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.d,.f{animation:none}}`;
}

/**
 * A finished sheet: ground, 24-unit grid, frame, drawing number top left, revision top right, and the drawing.
 * options: { mode: 'd' | 'm', theme, fonts: { sans, mono } (paths to .woff2 files to embed) }
 */
export function sheet(spec, { mode = 'd', theme = THEME, fonts } = {}) {
  const { W, H, svg } = drawing(spec, mode);
  const band = 30, HH = f1(H + band);
  const title = spec.title || 'System drawing';
  const dwg = spec.dwg || 'DWG';
  const left = mode === 'm' ? dwg : `${dwg}  /  ${title.toUpperCase()}`;
  const faces = fonts ? `${fonts.sans ? fontFace('BS', fonts.sans, '400 700') : ''}${fonts.mono ? fontFace('BM', fonts.mono) : ''}` : '';
  const style = css(theme, fonts ? { faces, sans: `'BS',system-ui,sans-serif`, mono: `'BM',ui-monospace,Consolas,monospace` } : {});
  const label = esc(`System drawing: ${title}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${HH}" width="${W}" height="${HH}" role="img" aria-label="${label}"><title>${label}</title><style>${style}</style>`
    + `<defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="${theme.draft}" stroke-opacity=".07"/></pattern></defs>`
    + `<rect width="${W}" height="${HH}" fill="${theme.ground}"/><rect width="${W}" height="${HH}" fill="url(#grid)"/>`
    + `<rect x="3.5" y="3.5" width="${W - 7}" height="${f1(HH - 7)}" fill="none" stroke="${theme.draft}" stroke-opacity=".45"/>`
    + `<text class="tag" x="16" y="22">${esc(left)}</text><text class="tag2" x="${W - 16}" y="22" text-anchor="end">${esc(spec.rev || '')}</text>`
    + `<g transform="translate(0 ${band - 8})">${svg}</g></svg>`;
}
