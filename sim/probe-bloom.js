#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * 毒使い×毒花 (毒を自陣に盛ってバッズを得て、ミアズマで敵に送る) の勝率を測る。
 * 毒使いの席だけにギアを付け、相手は毎試合ランダムなキャラ(ギアなし)。先手/後手を半々。
 *   node sim/probe-bloom.js <games> <seed> <gear|none> [extraGear]
 *   BLOOM_AI=0 で毒使いの毒花専用行動を無効化（装備だけの効果を測る対照）
 */
const engine = require('./engine');
const ai = require('./aiDriver');

const games = parseInt(process.argv[2] || '200', 10);
const seed = parseInt(process.argv[3] || '1', 10);
const gears = (process.argv[4] || 'none') === 'none' ? [] : process.argv[4].split(',');
const others = engine.CHARACTERS.filter((c) => c !== 'poisoner');
let w = 0, l = 0, d = 0, turns = 0;
const stats = {};
const pickRng = engine.makeRng(seed * 7919 + 13);
for (let g = 0; g < games; g++) {
    const opp = others[Math.floor(pickRng() * others.length)];
    const seat = g % 2;
    const chars = seat === 0 ? ['poisoner', opp] : [opp, 'poisoner'];
    const gs = [[], []];
    gs[seat] = gears;
    const s = engine.newGame({ chars, gears: gs, rng: engine.makeRng(seed * 1000003 + g * 7919 + 17) });
    let guard = 0;
    while (!s.winner && guard++ < 400) {
        const r = ai.makeMove(s, 'faithful');
        if (r.turnEnded) continue;
        if (r.move === null) break;
        const before = s.currentTurn;
        engine.placeMove(s, r.move);
        if (s.currentTurn === before) break;
    }
    turns += s.currentTurn;
    if (!s.winner) d++; else if (engine.seatOf(s.winner) === seat) w++; else l++;
    for (const [k, v] of Object.entries(s.stats)) stats[k] = (stats[k] || 0) + v;
}
const dec = w + l;
console.log(JSON.stringify({ gears, bloomAI: process.env.BLOOM_AI !== '0', games, seed, winRate: +(w / dec).toFixed(3), se: +Math.sqrt((w / dec) * (1 - w / dec) / dec).toFixed(3), draws: d, avgTurns: +(turns / games).toFixed(1), toxicBloom: stats.toxicBloom || 0 }));
