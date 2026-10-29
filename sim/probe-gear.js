#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * ギア単体の強さを測る。2人戦・faithful AI・キャラは毎試合ランダム。
 * 片方の席だけにギアを1つ持たせ、先手/後手を半々にして、装備側の勝率（引き分け除く）を出す。
 * 何も付けない同条件の対照群（席0にだけ「付けたつもり」で同じ乱数）と比べるため、--baseline で無装備も測れる。
 *
 *   node sim/probe-gear.js <games> <seed> [gearId,gearId,...|all|baseline]
 *   例) node sim/probe-gear.js 400 1 sturdy,ironLock
 *
 * 出力は1ギアにつき1行のJSON。4コアなら引数を分けて並列に走らせる。
 */
const engine = require('./engine');
const ai = require('./aiSelect');
const gear = require('./shared/gear');

const games = parseInt(process.argv[2] || '200', 10);
const seed = parseInt(process.argv[3] || '1', 10);
const spec = process.argv[4] || 'all';
const targets = spec === 'all' ? gear.GEAR_IDS : spec.split(',');

function play(chars, gears, rng) {
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
    return s;
}

for (const id of targets) {
    let w = 0, l = 0, d = 0, turns = 0;
    const stats = {};
    const pickRng = engine.makeRng(seed * 7919 + 13);
    for (let g = 0; g < games; g++) {
        const chars = [0, 1].map(() => engine.CHARACTERS[Math.floor(pickRng() * engine.CHARACTERS.length)]);
        const equippedSeat = g % 2; // 先手/後手を半々に
        const gears = [[], []];
        if (id !== 'baseline') gears[equippedSeat] = [id];
        const rng = engine.makeRng(seed * 1000003 + g * 7919 + 17);
        const s = play(chars, gears, rng);
        turns += s.currentTurn;
        if (!s.winner) d++;
        else if (engine.seatOf(s.winner) === equippedSeat) w++;
        else l++;
        for (const [k, v] of Object.entries(s.stats)) stats[k] = (stats[k] || 0) + v;
    }
    const decided = w + l;
    const wr = decided ? w / decided : null;
    const se = decided ? Math.sqrt((wr * (1 - wr)) / decided) : null;
    console.log(JSON.stringify({ gear: id, games, seed, winRate: wr == null ? null : +wr.toFixed(3), se: se == null ? null : +se.toFixed(3), draws: d, avgTurns: +(turns / games).toFixed(1), stats }));
}
