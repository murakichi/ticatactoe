// @ts-check
'use strict';
/*
 * sim の AI の判断(スキル・着手)を JSON に書き出す。同じ入力を本番 AIPlayer.ts に流して一致を確かめるための材料
 * (本番側は `DIFF_FILES=a.json,b.json npx react-scripts test --watchAll=false src/components/game/aiParity.probe.test.ts`)。
 * sim と本番のずれの原因探しに使う(issue #180)。ギアなし・陰陽師相手の2人戦。席0が相手キャラ側の判断を記録する。
 * 使い方: node sim/probe-parity.js <キャラ> <試合数> <出力.json>
 * 注意: 魔法使い・ネクロマンサーなど AI が追加の状態(降霊の残数・割引計画など)を使うキャラは、入力が足りず一致しない(本物のずれではない)。
 */
const engine = require('./engine'), ai = require('./ai'), deckMod = require('./deck');
const [, , opp = 'tactician', gamesArg = '30', out] = process.argv;
if (!out) { console.error('使い方: node sim/probe-parity.js <キャラ> <試合数> <出力.json>'); process.exit(1); }
const G = parseInt(gamesArg, 10);
const rows = [];
let curRec = null;
for (const n of Object.keys(engine.SKILLS)) {
    const o = engine.SKILLS[n];
    engine.SKILLS[n] = function (st) { const b = st.magic[st.turn]; const r = o.apply(this, arguments); if (curRec && st.magic[st.turn] !== b) curRec.skills.push(n); return r; };
}
for (let g = 0; g < G; g++) {
    const first = g % 2 === 0, chars = first ? ['yinYangMaster', opp] : [opp, 'yinYangMaster'], test = first ? 0 : 1;
    const rng = engine.makeRng(29 * 100003 + g);
    const s = engine.newGame({ chars, rng, decks: chars.map((c) => deckMod.variedAIDeck(c, rng)), gears: chars.map(() => []) });
    s.aiFlags = chars.map(() => ({}));
    let t = 0;
    while (!s.winner && t++ < 600) {
        let rec = null;
        if (s.turn !== test) {
            rec = { board: JSON.parse(JSON.stringify(s.board)), life: s.life, me: engine.SYMBOLS[s.turn], oppSym: engine.SYMBOLS[test], oppChar: opp, placements: s.placements, turn: s.currentTurn,
                magic: s.magic[s.turn], seatMagic: s.magic.slice(), hand: s.skills.slice(), tokenUsed: !!s.usedTokenThisTurn, costs: { ...engine.costsOf(s) }, judge: engine.judgeDayCost(s), assault: engine.totalAssaultCost(s), skills: [] };
            curRec = rec;
        }
        const r = ai.makeMove(s, 'faithful');
        if (rec) { rec.move = r.move; rec.turnEnded = r.turnEnded; rows.push(rec); curRec = null; }
        if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move); else if (!r.turnEnded) engine.SKILLS.charge(s);
    }
}
require('fs').writeFileSync(out, JSON.stringify(rows));
console.log(`${opp}: ${rows.length} 判断を ${out} に書き出した`);
