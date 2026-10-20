// @ts-check
'use strict';
/*
 * キャラ間の勝率行列用: 1ペア分を回して "MATRIX {json}" を出す（集計は probe-matrix-sum.js）。
 * 使い方: SIM_POOL_SIZE=30 node sim/probe-matrix.js --a giant --b necromancer --games 200 --seed 1 [--flags useNew=1]
 * --decks 1 で全席が推奨デッキから手札を引く（本番と同じ）。--adeck 0,1,... で a 側だけデッキを差し替える。
 * 試合ごとに先手を入れ替え、a 側の勝敗を数える。--flags は両席に同じ設定を渡す（AI の設定そのものを切り替える用）。
 */
const engine = require('./engine');
const ai = require('./ai');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const flags = {};
if (args.flags) for (const kv of args.flags.split(',')) { const [k, v] = kv.split('='); flags[k] = Number.isNaN(Number(v)) ? v : Number(v); }
const games = parseInt(args.games || '100', 10);
const seed0 = parseInt(args.seed || '1', 10);
let w = 0, l = 0, d = 0;
for (let g = 0; g < games; g++) {
    const aFirst = g % 2 === 0;
    const chars = aFirst ? [args.a, args.b] : [args.b, args.a];
    const decks = args.decks ? (args.adeck ? chars.map((c, i) => (i === (aFirst ? 0 : 1) ? args.adeck.split(',').map(Number) : null)) : true) : undefined;
    const s = engine.newGame({ chars, rng: engine.makeRng(seed0 * 100003 + g), decks });
    s.aiFlags = chars.map(() => flags);
    let t = 0;
    while (!s.winner && t++ < 600) {
        const r = ai.makeMove(s, 'faithful');
        if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
        else if (!r.turnEnded) engine.SKILLS.charge(s);
    }
    if (!s.winner) d++;
    else if (engine.seatOf(s.winner) === (aFirst ? 0 : 1)) w++;
    else l++;
}
console.log('MATRIX ' + JSON.stringify({ a: args.a, b: args.b, pool: engine.POOL_SIZE, flags, w, l, d }));
