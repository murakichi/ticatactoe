// @ts-check
'use strict';
/*
 * コスト変更の前後比較用。テスト席の推奨デッキに --skill の札(idx)を1枚差し込み(末尾の札と入れ替え)、
 * その札(--name は engine.SKILLS のキー)の使用回数・使った試合の勝率・テスト席の勝率を測る。差し込まない対照群も同じ試合で測る。
 * 使い方: node sim/probe-cost.js --skill 62 --name leafToken --char you --opp giant --games 300 --seed 1
 */
const engine = require('./engine');
const ai = require('./ai');
const deckMod = require('./shared/deck');
const gearMod = require('./shared/gear');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const idx = parseInt(args.skill, 10);
const name = args.name;
const c1 = args.char || 'you';
const c2 = args.opp || 'giant';
const games = parseInt(args.games || '300', 10);
const seed0 = parseInt(args.seed || '1', 10);

let usedNow = 0;
let testSeat = -1;
const orig = engine.SKILLS[name];
engine.SKILLS[name] = function (s) {
    const before = s.magic[s.turn];
    const r = orig.apply(this, arguments);
    if (s.turn === testSeat && s.magic[s.turn] !== before) usedNow++;
    return r;
};

function run(withSkill) {
    let wins = 0, decided = 0, uses = 0, usedGames = 0, usedWins = 0, usedDecided = 0;
    for (let g = 0; g < games; g++) {
        const first = g % 2 === 0;
        const chars = first ? [c1, c2] : [c2, c1];
        const test = first ? 0 : 1;
        testSeat = test;
        usedNow = 0;
        const base = deckMod.recommendedDeck(c1);
        const deck = withSkill && !base.includes(idx) ? [...base.slice(0, -1), idx] : base;
        const s = engine.newGame({
            chars, rng: engine.makeRng(seed0 * 100003 + g),
            decks: chars.map((c, seat) => (seat === test ? deck : deckMod.recommendedDeck(c))),
            gears: chars.map((c) => gearMod.recommendedGears(c)),
        });
        let t = 0;
        while (!s.winner && t++ < 600) {
            const r = ai.makeMove(s, 'faithful');
            if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
            else if (!r.turnEnded) engine.SKILLS.charge(s);
        }
        const won = !!s.winner && engine.seatOf(s.winner) === test;
        if (s.winner) { decided++; if (won) wins++; }
        uses += usedNow;
        if (usedNow > 0) { usedGames++; if (s.winner) { usedDecided++; if (won) usedWins++; } }
    }
    return { wins, decided, uses, usedGames, usedWins, usedDecided };
}
const pct = (w, d) => (d ? (w / d * 100).toFixed(1) : '-') + '%';
const a = run(false), b = run(true);
console.log(`skill=${idx}(${name}) ${c1} vs ${c2} n=${games} | 対照 ${pct(a.wins, a.decided)} | 差し込み ${pct(b.wins, b.decided)} | 1試合あたり使用 ${(b.uses / games).toFixed(2)}回 使用試合率 ${(b.usedGames / games * 100).toFixed(0)}% その勝率 ${pct(b.usedWins, b.usedDecided)}`);
