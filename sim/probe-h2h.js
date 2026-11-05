// @ts-check
'use strict';
/*
 * 本番AIの新旧を同キャラ(または指定キャラ)で対戦させる paired A/B。AI は sim/aiDriver.js と同じ形(makeMove)のモジュールを 2 つ渡す。
 * 使い方: node sim/probe-h2h.js --chars you,you --games 100 --seed 1 --modA aiDriver.js --modB aiDriver.old.js
 *   --prod を付けると本番と同じ設定（全席が推奨デッキ・推奨ギア）。付けないとデッキなし・ギアなし（手札が全札からランダム）。
 *   旧版の用意: git show <旧コミット>:sim/shared/AIPlayer.js > sim/shared/AIPlayer.old.js（aiTurn も同様）、
 *   sed で aiDriver.js の require を '.old' に替えた sim/aiDriver.old.js を作る（gen-sim-shared.js は sim/shared を作り直すので、再生成後に取り直す）。
 * 先手は試合ごとに入れ替える。結果は最後に RESULT の JSON 1行（A=modA 側の勝/敗/分）。
 */
const path = require('path');
const engine = require('./engine');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; }
const load = (m) => require(path.resolve(__dirname, m));
const modA = load(args.modA || 'aiDriver.js'), modB = load(args.modB || 'aiDriver.old.js');
const [c1, c2] = (args.chars || 'you,you').split(',');
const games = parseInt(args.games || '100', 10), seed0 = parseInt(args.seed || '1', 10);
const size = args.size ? parseInt(args.size, 10) : undefined;
const maxTurns = 600;
const PROD = !!args.prod; // --prod: 本番と同じく、全席が推奨デッキ・推奨ギア（省略するとデッキなし=手札が全札からランダム、ギアなし）
const gearMod = require('./shared/gear');

function play(chars, mods, seed) {
    const s = PROD ? engine.newGame({ chars, rng: engine.makeRng(seed), size, decks: true, gears: chars.map((c) => gearMod.recommendedGears(c)) }) : engine.newGame({ chars, rng: engine.makeRng(seed), size });
    let g = 0;
    while (!s.winner && g++ < maxTurns) {
        const r = mods[s.turn].makeMove(s, 'faithful');
        if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
        else if (!r.turnEnded) engine.SKILLS.charge(s);
    }
    return s.winner ? engine.seatOf(s.winner) : -1;
}
const t = { w: 0, l: 0, d: 0 };
for (let g = 0; g < games; g++) {
    const aFirst = g % 2 === 0;
    const winner = play(aFirst ? [c1, c2] : [c2, c1], aFirst ? [modA, modB] : [modB, modA], seed0 * 100003 + g);
    const aSeat = aFirst ? 0 : 1;
    if (winner === -1) t.d++; else if (winner === aSeat) t.w++; else t.l++;
}
console.log('RESULT ' + JSON.stringify({ chars: [c1, c2], games, seed: seed0, modA: args.modA || 'aiDriver.js', modB: args.modB || 'aiDriver.old.js', A: t }));
