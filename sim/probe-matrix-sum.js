// @ts-check
'use strict';
/*
 * probe-matrix.js の "MATRIX {json}" を stdin から集計し、設定(pool, flags)ごとにキャラ別の総合勝率（ミラー除く）と勝率行列を出す。
 * 複数設定を並べて比較する: node sim/probe-matrix-sum.js < raw.txt
 */
const lines = require('fs').readFileSync(0, 'utf8').split('\n').filter((l) => l.startsWith('MATRIX '));
const cfgs = {};
for (const ln of lines) {
    const o = JSON.parse(ln.slice(7));
    const key = `pool=${o.pool} flags=${JSON.stringify(o.flags)}`;
    const c = cfgs[key] || (cfgs[key] = { cells: {}, chars: new Set() });
    c.chars.add(o.a); c.chars.add(o.b);
    const k = `${o.a}|${o.b}`;
    const e = c.cells[k] || (c.cells[k] = { w: 0, l: 0, d: 0 });
    e.w += o.w; e.l += o.l; e.d += o.d;
}
const pct = (w, l) => (w + l ? (w / (w + l)) * 100 : NaN);
const out = {};
for (const [key, c] of Object.entries(cfgs)) {
    const chars = [...c.chars];
    const total = {};
    for (const x of chars) total[x] = { w: 0, l: 0 };
    const get = (a, b) => {
        const e = c.cells[`${a}|${b}`];
        if (e) return e;
        const r = c.cells[`${b}|${a}`];
        return r ? { w: r.l, l: r.w, d: r.d } : { w: 0, l: 0, d: 0 };
    };
    for (const a of chars) for (const b of chars) if (a !== b) { const e = get(a, b); total[a].w += e.w; total[a].l += e.l; }
    out[key] = { chars, total, get };
}
const keys = Object.keys(out);
for (const key of keys) {
    const { chars, total, get } = out[key];
    console.log(`\n== ${key}`);
    console.log('総合勝率(ミラー除く): ' + chars.map((x) => `${x} ${pct(total[x].w, total[x].l).toFixed(1)}%`).join(' / '));
    console.log('行列(行キャラの対列キャラ勝率%):');
    console.log('            ' + chars.map((x) => x.slice(0, 5).padStart(6)).join(''));
    for (const a of chars) console.log(a.slice(0, 11).padEnd(12) + chars.map((b) => (a === b ? '   -  ' : pct(get(a, b).w, get(a, b).l).toFixed(0).padStart(5) + ' ')).join(''));
}
if (keys.length >= 2) {
    console.log('\n== 総合勝率の差 (' + keys[1] + ' − ' + keys[0] + ')');
    const A = out[keys[0]], B = out[keys[1]];
    console.log(A.chars.map((x) => `${x} ${(pct(B.total[x].w, B.total[x].l) - pct(A.total[x].w, A.total[x].l)).toFixed(1)}pt`).join(' / '));
}
