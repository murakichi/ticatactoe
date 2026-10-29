#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * キャラごとに「頑健以外」のギアの組を探す（推奨ギアの選び直し用）。
 * 相手は毎試合ランダムなキャラで、現状の推奨ギア(RECOMMENDED_GEARS)を全員が装備＝実際のAI戦に近い条件。
 * 比較は必ず同じ枠数（あなた=3、他=2）でそろえる。単体は絞り込み専用で、結果の判断には使わない。
 *
 *   node sim/probe-select.js <char> [games1=150] [games2=200] [games3=400] [seed=1] [--with-sturdy]
 *   段階1: 候補ギア1つ+（残りの枠は現状の推奨のうち頑健以外）…ではなく、1ギア単体を上位6つ選ぶ絞り込み
 *   段階2: 上位6つの全ペア(あなたは上位ペア+3つ目の候補)を比較
 *   段階3: 段階2の上位3組と「現状の推奨」を、それぞれ多めの試合で比べ直す
 *   --with-sturdy: 頑健も候補に入れる（頑健を含む組との比較用）
 */
const engine = require('./engine');
const ai = require('./ai');
const gear = require('./shared/gear');

const char = process.argv[2];
const g1 = parseInt(process.argv[3] || '150', 10);
const g2 = parseInt(process.argv[4] || '200', 10);
const g3 = parseInt(process.argv[5] || '400', 10);
const seed = parseInt(process.argv[6] || '1', 10);
const withSturdy = process.argv.includes('--with-sturdy');
const slots = gear.gearSlotsFor(char);
const candidates = gear.GEAR_IDS.filter((g) => withSturdy || g !== 'sturdy');

function winRate(set, games, seedOffset) {
    let w = 0, l = 0;
    const pickRng = engine.makeRng(seed * 7919 + seedOffset);
    for (let g = 0; g < games; g++) {
        const opp = engine.CHARACTERS[Math.floor(pickRng() * engine.CHARACTERS.length)];
        const seat = g % 2;
        const chars = seat === 0 ? [char, opp] : [opp, char];
        const gears = chars.map((c, i) => (i === seat ? set : gear.recommendedGears(c)));
        const s = engine.newGame({ chars, gears, rng: engine.makeRng(seed * 1000003 + g * 7919 + seedOffset) });
        let guard = 0;
        while (!s.winner && guard++ < 400) {
            const r = ai.makeMove(s, 'faithful');
            if (r.turnEnded) continue;
            if (r.move === null) break;
            const before = s.currentTurn;
            engine.placeMove(s, r.move);
            if (s.currentTurn === before) break;
        }
        if (s.winner) { if (engine.seatOf(s.winner) === seat) w++; else l++; }
    }
    return w + l ? w / (w + l) : 0;
}
const fmt = (x) => x.toFixed(3);

// 段階1: 単体で絞り込み（枠は1つ。他の組と直接は比べない）
const singles = candidates.map((g) => ({ set: [g], wr: winRate([g], g1, 1) })).sort((a, b) => b.wr - a.wr);
const top = singles.slice(0, 6).map((x) => x.set[0]);
// 段階2: 上位6つの全ペア（あなたは上位ペア+残りから3つ目を足す）
let sets = [];
for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) sets.push([top[i], top[j]]);
let ranked = sets.map((set) => ({ set, wr: winRate(set, g2, 2) })).sort((a, b) => b.wr - a.wr);
if (slots === 3) {
    const best = ranked[0].set;
    ranked = candidates.filter((g) => !best.includes(g)).map((g) => ({ set: [...best, g], wr: winRate([...best, g], g2, 3) })).sort((a, b) => b.wr - a.wr);
}
// 段階3: 上位3組と現状の推奨を多めの試合で比べ直す
const current = gear.recommendedGears(char);
const finalists = [...ranked.slice(0, 3).map((x) => x.set), current].map((set) => ({ set, wr: winRate(set, g3, 4) }));
console.log(JSON.stringify({
    char, slots, seed, withSturdy,
    singles: singles.map((x) => `${x.set[0]}:${fmt(x.wr)}`),
    stage2: ranked.slice(0, 6).map((x) => `${x.set.join('+')}:${fmt(x.wr)}`),
    finalists: finalists.map((x) => `${x.set.join('+')}:${fmt(x.wr)}`),
    games: { g1, g2, g3 },
}));
