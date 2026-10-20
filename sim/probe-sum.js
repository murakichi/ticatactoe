// @ts-check
'use strict';
// probe-ai.js の "RESULT {json}" 行を stdin から集計して、勝率と95%信頼区間を出す
const lines = require('fs').readFileSync(0, 'utf8').split('\n').filter((l) => l.startsWith('RESULT '));
const groups = {};
for (const l of lines) {
    const o = JSON.parse(l.slice(7));
    const key = `${o.mode} ${o.chars.join(' vs ')} A[${JSON.stringify(o.flagsA)} ${o.modA}] B[${JSON.stringify(o.flagsB)} ${o.modB}]`;
    const g = groups[key] || (groups[key] = { mode: o.mode, A: { w: 0, l: 0, d: 0 }, B: { w: 0, l: 0, d: 0 } });
    for (const k of ['A', 'B']) if (o[k]) for (const f of ['w', 'l', 'd']) g[k][f] += o[k][f];
}
const wr = (t) => { const n = t.w + t.l; return { p: n ? t.w / n : NaN, n, se: n ? Math.sqrt((t.w / n) * (1 - t.w / n) / n) : NaN }; };
for (const [key, g] of Object.entries(groups)) {
    const a = wr(g.A);
    if (g.mode === 'h2h') {
        console.log(`${key}\n  A勝率 ${(a.p * 100).toFixed(1)}% ±${(1.96 * a.se * 100).toFixed(1)} (n=${a.n}, 引分${g.A.d})  W${g.A.w} L${g.A.l}`);
    } else {
        const b = wr(g.B);
        const d = a.p - b.p, se = Math.sqrt(a.se ** 2 + b.se ** 2);
        console.log(`${key}\n  A ${(a.p * 100).toFixed(1)}% (n=${a.n})  B ${(b.p * 100).toFixed(1)}% (n=${b.n})  差(A-B) ${(d * 100).toFixed(1)}pt ±${(1.96 * se * 100).toFixed(1)}  ${Math.abs(d) > 1.96 * se ? (d > 0 ? '有意に向上' : '有意に低下') : '誤差内'}`);
    }
}
