#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * ギア向けのAI戦略が「ギアの価値」なのか「戦略そのものの強さ」なのかを切り分ける対照実験。
 * 同じキャラ構成・乱数で、装備側の席に次の4通りを与え、装備側の勝率を比べる。
 *   gear+ai    : ギアを持ち、戦略も使う
 *   gear       : ギアを持つだけ（戦略なし）
 *   ai         : ギアは持たず、戦略だけ使う（対照）
 *   none       : どちらもなし
 *   gear+ai と ai の差 = ギア自体の価値 / ai と none の差 = 戦略だけの価値（ギアに関係なく強い）
 *   node sim/probe-control.js <gear> <games> <seed> <gear+ai|gear|ai|none> [char]
 *   char を指定すると、装備側の席のキャラをそのキャラに固定する（相手は毎試合ランダム）
 */
// 戦略の無効化は ai.js を読み込む前に環境変数で行う（ai.js は読み込み時に EL_AI を読む）
if (['gear', 'none'].includes(process.argv[5] || 'none')) { process.env.EL_AI = '0'; process.env.GEAR_AI = '0'; process.env.TK_AI = '0'; }
const engine = require('./engine');
const ai = require('./aiDriver');

const gearId = process.argv[2];
const games = parseInt(process.argv[3] || '300', 10);
const seed = parseInt(process.argv[4] || '1', 10);
const mode = process.argv[5] || 'none';
const hasGear = mode === 'gear+ai' || mode === 'gear';
const useAi = mode === 'gear+ai' || mode === 'ai';
const fixedChar = process.argv[6];
let w = 0, l = 0, d = 0, turns = 0;
const pickRng = engine.makeRng(seed * 7919 + 13);
for (let g = 0; g < games; g++) {
    const chars = [0, 1].map(() => engine.CHARACTERS[Math.floor(pickRng() * engine.CHARACTERS.length)]);
    const seat = g % 2;
    if (fixedChar) chars[seat] = fixedChar;
    const gears = [[], []];
    const forceAi = [[], []];
    if (hasGear) gears[seat] = [gearId];
    if (useAi && !hasGear) forceAi[seat] = [gearId];
    const s = engine.newGame({ chars, gears, forceAi, rng: engine.makeRng(seed * 1000003 + g * 7919 + 17) });
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
}
const dec = w + l;
console.log(JSON.stringify({ gear: gearId, char: fixedChar || 'random', mode, games, seed, winRate: +(w / dec).toFixed(3), se: +Math.sqrt((w / dec) * (1 - w / dec) / dec).toFixed(3), draws: d, avgTurns: +(turns / games).toFixed(1) }));
