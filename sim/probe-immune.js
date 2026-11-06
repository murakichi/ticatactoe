// @ts-check
'use strict';
/* 使い方: node sim/probe-immune.js 200 5 （雷霆の⚡付き自陣コマに、敵の手番中に⚡以外のエフェクトが新しく付く経路の監査）
 * 敵の手番の前後で、⚡付き(休眠でない)雷霆のコマの効果を比べ、増えた効果と直前に撃たれたスキルを数える。 */
const engine = require('./engine');
const ai = require('./aiDriver');
const deckMod = require('./shared/deck'), gearMod = require('./shared/gear');
const games = parseInt(process.argv[2] || '200', 10), seed0 = parseInt(process.argv[3] || '5', 10);
const foes = ['cryomancer', 'pyromancer', 'poisoner', 'witch', 'yinYangMaster', 'giant', 'magician', 'tactician', 'necromancer'];
const counts = {};
const used = [];
const SK = engine.SKILLS;
for (const k of Object.keys(SK)) { const f = SK[k]; SK[k] = function (s) { used.push(k); return f.apply(this, arguments); }; }
const raw = (s) => s.board.map((sq) => (sq.player && engine.seatOf(sq.player) === 0 && sq.effects.some((e) => e.effect === '⚡') ? sq.effects.map((e) => e.effect).filter((e) => e !== '⚡').sort().join('') : null));
const snap = (s) => s.board.map((sq) => (sq.player && engine.seatOf(sq.player) === 0 && sq.effects.some((e) => e.effect === '⚡') && !sq.effects.some((e) => e.effect === '❄' || e.effect === '🔥') ? sq.effects.map((e) => e.effect).filter((e) => e !== '⚡').sort().join('') : null));
for (let g = 0; g < games; g++) {
    const foe = foes[g % foes.length];
    const chars = ['electrician', foe];
    const s = engine.newGame({ chars, rng: engine.makeRng(seed0 * 100003 + g), decks: chars.map((c) => deckMod.recommendedDeck(c)), gears: chars.map((c) => gearMod.recommendedGears(c)) });
    let t = 0;
    while (!s.winner && t++ < 400) {
        const seat = s.turn;
        const before = snap(s);
        used.length = 0;
        const r = ai.makeMove(s, 'faithful');
        if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
        else if (!r.turnEnded) engine.SKILLS.charge(s);
        if (seat === 1) {
            const after = raw(s);
            after.forEach((a, i) => {
                if (a === null || before[i] === null) return;
                if (a !== before[i] && a.length > before[i].length) {
                    const key = `${foe}: +${a.replace(before[i], '') || a} via [${[...new Set(used)].join(',') || '着手'}]`;
                    counts[key] = (counts[key] || 0) + 1;
                }
            });
        }
    }
}
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(v, k));
if (!Object.keys(counts).length) console.log('(none)');
