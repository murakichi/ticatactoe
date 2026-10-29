#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * 推奨ギア同士（全席が RECOMMENDED_GEARS）のAI対戦で、キャラ別勝率がどう動くかを測る (issue #71)。
 * 8キャラ総当たり（ミラー含む64通り）。対照として全員ギアなしも同じ seed で測れる。
 *
 *   node sim/probe-recommended.js <gamesPerPair> <seed> <gear|none> [part total]
 *   例) node sim/probe-recommended.js 100 1 gear 0 4   # 64通りのうち 0 番目の1/4 だけ（4コア並列用）
 *
 * 出力: 1行のJSON（キャラ別の勝ち/負け/引き分け。先手/後手を別集計）。集計は --merge で。
 *   node sim/probe-recommended.js --merge a.jsonl b.jsonl ...
 */
const engine = require('./engine');
const ai = require('./ai');
const gear = require('./shared/gear');

if (process.argv[2] === '--merge') {
    const files = process.argv.slice(3);
    const agg = {};
    for (const f of files) {
        for (const line of require('fs').readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
            const r = JSON.parse(line);
            for (const [c, v] of Object.entries(r.chars)) {
                agg[c] = agg[c] || { w: 0, l: 0, d: 0, first: { w: 0, l: 0 }, second: { w: 0, l: 0 } };
                for (const k of ['w', 'l', 'd']) agg[c][k] += v[k];
                for (const side of ['first', 'second']) for (const k of ['w', 'l']) agg[c][side][k] += v[side][k];
            }
        }
    }
    for (const [c, v] of Object.entries(agg)) {
        const dec = v.w + v.l;
        console.log(`${c.padEnd(14)} ${(v.w / dec).toFixed(3)} ±${Math.sqrt(((v.w / dec) * (1 - v.w / dec)) / dec).toFixed(3)} n=${dec}  先手${(v.first.w / (v.first.w + v.first.l)).toFixed(3)} 後手${(v.second.w / (v.second.w + v.second.l)).toFixed(3)}`);
    }
    process.exit(0);
}

const games = parseInt(process.argv[2] || '100', 10);
const seed = parseInt(process.argv[3] || '1', 10);
const useGear = (process.argv[4] || 'gear') === 'gear';
const part = parseInt(process.argv[5] || '0', 10);
const total = parseInt(process.argv[6] || '1', 10);

const pairs = [];
for (const a of engine.CHARACTERS) for (const b of engine.CHARACTERS) pairs.push([a, b]);
const mine = pairs.filter((_, i) => i % total === part);

const res = {};
for (const c of engine.CHARACTERS) res[c] = { w: 0, l: 0, d: 0, first: { w: 0, l: 0 }, second: { w: 0, l: 0 } };

for (const [a, b] of mine) {
    if (a === b) continue; // ミラーは勝敗が相殺するので回さない
    for (let g = 0; g < games; g++) {
        const rng = engine.makeRng(seed * 1000003 + g * 7919 + a.length * 31 + b.length * 7 + a.charCodeAt(1) * 13 + b.charCodeAt(2));
        const chars = [a, b];
        const gears = useGear ? chars.map((c) => gear.recommendedGears(c)) : [[], []];
        const s = engine.newGame({ chars, gears, rng });
        let guard = 0;
        while (!s.winner && guard++ < 400) {
            const r = ai.makeMove(s, 'faithful');
            if (r.turnEnded) continue;
            if (r.move === null) break;
            const before = s.currentTurn;
            engine.placeMove(s, r.move);
            if (s.currentTurn === before) break;
        }
        const ws = s.winner ? engine.seatOf(s.winner) : -1;
        [[a, 0], [b, 1]].forEach(([c, seat]) => {
            const side = seat === 0 ? 'first' : 'second';
            if (ws === -1) res[c].d++;
            else if (ws === seat) { res[c].w++; res[c][side].w++; }
            else { res[c].l++; res[c][side].l++; }
        });
    }
}
console.log(JSON.stringify({ games, seed, useGear, part, total, chars: res }));
