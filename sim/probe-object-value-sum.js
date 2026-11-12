#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * probe-object-value.js の出力(jsonl)の集計。
 *   node sim/probe-object-value-sum.js <dir|file...> [--by char]
 * 列: 勝率 / 対照(none)との差 / 大岩(同じマス選び)との差 = 効果の価値 / それを魔力に直した値（magicN の傾きで割る）。差は同じ seed の試合どうしの対の差で、±は標準誤差。
 */
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const byChar = argv.includes('--by');
const files = argv.filter((a) => !a.startsWith('--') && a !== 'char').flatMap((p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(p, f)) : [p]));
/** arm -> key(char|opp|k) -> outcomes[] */
const data = new Map();
const meta = new Map();
for (const f of files) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    const arm = r.arm;
    if (!data.has(arm)) { data.set(arm, new Map()); meta.set(arm, { placed: 0, work: 0, after: 0, total: 0, games: 0, objMagic: 0, objEffect: 0, ends: {} }); }
    data.get(arm).set(`${r.char}|${r.opp}`, r.outcomes.split(',').map(Number));
    const m = meta.get(arm);
    m.placed += r.placed; m.work += r.work; m.after += r.myTurnsAfter; m.total += r.myTurnsTotal; m.games += r.games; m.objMagic += r.objMagic; m.objEffect += r.objEffect;
    for (const [k, v] of Object.entries(r.ends)) m.ends[k] = (m.ends[k] || 0) + v;
}
/** a − b の対の差（共通のキーだけ）。filter はキャラの絞り込み */
function diff(a, b, filter) {
    const A = data.get(a), B = data.get(b);
    if (!A || !B) return null;
    const d = [];
    for (const [k, xs] of A) {
        if (filter && !k.startsWith(filter + '|')) continue;
        const ys = B.get(k);
        if (!ys) continue;
        for (let i = 0; i < Math.min(xs.length, ys.length); i++) d.push(xs[i] - ys[i]);
    }
    if (d.length === 0) return null;
    const mean = d.reduce((p, c) => p + c, 0) / d.length;
    const v = d.reduce((p, c) => p + (c - mean) ** 2, 0) / Math.max(1, d.length - 1);
    return { mean: mean * 100, se: Math.sqrt(v / d.length) * 100, n: d.length };
}
const wr = (a, filter) => {
    let s = 0, n = 0;
    for (const [k, xs] of data.get(a)) { if (filter && !k.startsWith(filter + '|')) continue; for (const x of xs) { s += x; n++; } }
    return n ? (100 * s) / n : NaN;
};
const fmt = (d) => (d ? `${d.mean >= 0 ? '+' : ''}${d.mean.toFixed(1)}±${d.se.toFixed(1)}` : '   -   ');
/** magicN の差から、原点を通る最小二乗の傾き（勝率pt / 魔力1） */
function slope(filter) {
    let sxy = 0, sxx = 0;
    for (const arm of data.keys()) {
        const m = /^magic(-?\d+)$/.exec(arm);
        if (!m) continue;
        const d = diff(arm, 'none', filter);
        if (!d) continue;
        const x = parseInt(m[1], 10);
        sxy += x * d.mean; sxx += x * x;
    }
    return sxx ? sxy / sxx : NaN;
}
function table(filter) {
    const sl = slope(filter);
    console.log(`\n## ${filter || '全体'}  対照の勝率 ${wr('none', filter).toFixed(1)}%  魔力1あたり ${sl.toFixed(2)}pt`);
    console.log('arm'.padEnd(20), 'WR'.padStart(6), 'vs none'.padStart(11), 'vs 大岩'.padStart(11), '魔力換算'.padStart(8), '稼働/試合'.padStart(8), '残存'.padStart(6));
    for (const arm of [...data.keys()].sort()) {
        if (arm === 'none') continue;
        const where = arm.split(':')[1];
        const dn = diff(arm, 'none', filter);
        const db = where && !arm.startsWith('boulder:') ? diff(arm, 'boulder:' + where, filter) : null;
        const m = meta.get(arm);
        const eff = db ? db.mean : /^magic/.test(arm) ? NaN : dn ? dn.mean : NaN;
        const alive = m.placed ? `${Math.round((100 * (m.ends.gameEnd || 0)) / m.placed)}%` : '';
        console.log(arm.padEnd(20), wr(arm, filter).toFixed(1).padStart(6), fmt(dn).padStart(11), fmt(db).padStart(11), (isFinite(eff / sl) ? (eff / sl).toFixed(1) : '').padStart(8), (m.placed ? (m.work / m.placed).toFixed(1) : '').padStart(8), alive.padStart(6));
    }
}
table();
if (byChar) {
    const chars = new Set();
    for (const k of data.get('none').keys()) chars.add(k.split('|')[0]);
    for (const c of chars) table(c);
}
