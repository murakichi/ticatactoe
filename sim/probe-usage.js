// @ts-check
'use strict';
/*
 * AI が各スキルを何回撃つか（1試合あたり）と、撃った試合の勝率を数える。
 * 使い方: node sim/probe-usage.js --chars cryomancer,you --games 200 --seed 1 [--skills glacier,inferno,...] [--deck 0,3,..] [--gears a,b] [--size N]
 * --deck / --gears はテスト席（chars[0]）の設定。省略時は従来どおり（デッキなし=0..POOL_SIZE から引く・ギアなし）。相手は推奨デッキ・推奨ギア（--deck を使うときだけ）。
 * 席0/席1を交互に先手にし、キャラ構成 chars[0]=テスト席。skill 名は engine.SKILLS のキー。
 */
const engine = require('./engine');
const ai = require('./ai');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const [c1, c2] = (args.chars || 'you,you').split(',');
const games = parseInt(args.games || '100', 10);
const seed0 = parseInt(args.seed || '1', 10);
const names = args.skills ? args.skills.split(',') : Object.keys(engine.SKILLS);
const flags = {};
if (args.flags) for (const kv of args.flags.split(',')) { const [k, v] = kv.split('='); flags[k] = Number.isNaN(Number(v)) ? v : Number(v); }

// SKILLS をラップして、手番席ごとの使用回数を数える
const used = { 0: {}, 1: {} };
let curUsed = null;
for (const n of names) {
    const orig = engine.SKILLS[n];
    engine.SKILLS[n] = function (s) {
        const before = s.magic[s.turn];
        const r = orig.apply(this, arguments);
        // 不発（魔力が減っていない・効果なし）は数えない: 魔力が減ったときだけ使用とみなす（刈り入れ前夜は魔力が増えるので別扱い）
        if (curUsed && (s.magic[s.turn] !== before || n === 'harvestEve')) curUsed[n] = (curUsed[n] || 0) + 1;
        return r;
    };
}
const agg = {}; // skill -> { uses, gamesUsed, winsWhenUsed, gamesWhenUsed }
let testWins = 0, testGames = 0, total = 0;
for (let g = 0; g < games; g++) {
    const first = g % 2 === 0;
    const chars = first ? [c1, c2] : [c2, c1];
    const test = first ? 0 : 1;
    const opts = { chars, rng: engine.makeRng(seed0 * 100003 + g), size: args.size ? parseInt(args.size, 10) : undefined };
    if (args.deck || args.gears) {
        // テスト席にだけ指定のデッキ/ギア、相手は推奨（デッキを使う試合ではデッキ方式の手札になる）
        const deckMod = require('./deck'), gearMod = require('./gear');
        opts.decks = chars.map((c, seat) => (seat === test && args.deck ? args.deck.split(',').map(Number) : deckMod.recommendedDeck(c)));
        opts.gears = chars.map((c, seat) => (seat === test && args.gears ? (args.gears === 'none' ? [] : args.gears.split(',')) : gearMod.recommendedGears(c)));
    }
    const s = engine.newGame(opts);
    s.aiFlags = chars.map((_, seat) => (seat === test ? flags : {}));
    const mine = {};
    let t = 0;
    while (!s.winner && t++ < 600) {
        curUsed = s.turn === test ? mine : {};
        const r = ai.makeMove(s, 'faithful');
        curUsed = s.turn === test ? mine : {};
        if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
        else if (!r.turnEnded) engine.SKILLS.charge(s);
    }
    const won = s.winner && engine.seatOf(s.winner) === test;
    total++;
    if (s.winner) { testGames++; if (won) testWins++; }
    for (const [n, c] of Object.entries(mine)) {
        const a = agg[n] || (agg[n] = { uses: 0, gamesUsed: 0, wins: 0, decided: 0 });
        a.uses += c; a.gamesUsed++;
        if (s.winner) { a.decided++; if (won) a.wins++; }
    }
}
console.log(`${c1} vs ${c2} games=${games} flags=${JSON.stringify(flags)} 勝率(テスト席) ${(testWins / testGames * 100).toFixed(1)}%`);
for (const [n, a] of Object.entries(agg).sort((x, y) => y[1].uses - x[1].uses)) {
    console.log(`  ${n.padEnd(16)} 1試合あたり ${(a.uses / total).toFixed(2)}回  使った試合 ${(a.gamesUsed / total * 100).toFixed(0)}%  その勝率 ${a.decided ? (a.wins / a.decided * 100).toFixed(0) : '-'}%`);
}
