// @ts-check
'use strict';
/* 使い方: node sim/probe-attrition.js 200 5 （電気使い対氷室。リーチを作った手番の割合と、氷室の絶対零度の頻度・魔力の関係） */
// 消耗戦の仮説: 電気使いが毎手番リーチを作れた試合ほど、氷室の魔力が貯まらず絶対零度が撃たれにくいか。
const engine = require('./engine');
const ai = require('./aiDriver');
const deckMod = require('./shared/deck'), gearMod = require('./shared/gear');
const { geometryForCells } = require('./shared/boardGeometry');
const games = parseInt(process.argv[2] || '300', 10), seed0 = parseInt(process.argv[3] || '5', 10);
const hasReach = (board, sym) => geometryForCells(board.length).winLines.some((line) => {
    const mine = line.filter((i) => board[i].player === sym).length;
    const others = line.filter((i) => board[i].player && board[i].player !== sym).length;
    const empty = line.filter((i) => !board[i].player).length;
    return mine === 3 && others === 0 && empty === 1;
});
const rows = [];
let glacierCount = 0;
const origGlacier = engine.SKILLS.glacier;
engine.SKILLS.glacier = function (s) { glacierCount++; return origGlacier.apply(this, arguments); };
for (let g = 0; g < games; g++) {
    const first = g % 2 === 0;
    const chars = first ? ['electrician', 'cryomancer'] : ['cryomancer', 'electrician'];
    const test = first ? 0 : 1, foe = 1 - test;
    const opts = { chars, rng: engine.makeRng(seed0 * 100003 + g) };
    opts.decks = chars.map((c) => deckMod.recommendedDeck(c));
    opts.gears = chars.map((c) => gearMod.recommendedGears(c));
    const s = engine.newGame(opts);
    glacierCount = 0;
    let reachTurns = 0, myTurns = 0, foeMagicSum = 0, foeTurns = 0, t = 0;
    while (!s.winner && t++ < 600) {
        const seat = s.turn;
        if (seat === foe) { foeMagicSum += s.magic[foe]; foeTurns++; }
        const r = ai.makeMove(s, 'faithful');
        if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
        else if (!r.turnEnded) engine.SKILLS.charge(s);
        if (seat === test) { myTurns++; if (hasReach(s.board, engine.SYMBOLS[test])) reachTurns++; }
    }
    const won = s.winner && engine.seatOf(s.winner) === test;
    rows.push({ reachTurns, myTurns, rate: myTurns ? reachTurns / myTurns : 0, glacier: glacierCount, foeMag: foeTurns ? foeMagicSum / foeTurns : 0, won: !!won, decided: !!s.winner });
}
const grp = (f) => { const a = rows.filter(f); const n = a.length || 1; return { n: a.length, glacier: (a.reduce((x, r) => x + (r.glacier > 0 ? 1 : 0), 0) / n * 100).toFixed(0) + '%', foeMag: (a.reduce((x, r) => x + r.foeMag, 0) / n).toFixed(1), win: (a.filter((r) => r.decided).length ? a.filter((r) => r.won).length / a.filter((r) => r.decided).length * 100 : 0).toFixed(0) + '%' }; };
console.log('games', games, '全体', JSON.stringify(grp(() => true)));
console.log('リーチを作った手番の割合 高い(>=25%)', JSON.stringify(grp((r) => r.rate >= 0.25)));
console.log('リーチを作った手番の割合 低い(<25%)', JSON.stringify(grp((r) => r.rate < 0.25)));
console.log('リーチ手番が0の試合', JSON.stringify(grp((r) => r.reachTurns === 0)));
console.log('リーチ手番が2以上の試合', JSON.stringify(grp((r) => r.reachTurns >= 2)));
