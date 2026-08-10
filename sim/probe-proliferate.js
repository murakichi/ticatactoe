#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * 増殖(ループ召喚)が「終息するか」を直接測る統制実験。
 *
 *   node sim/probe-proliferate.js [n=60]
 *
 * なぜ勝率(metrics)ではなくこれを測るのか:
 *   AI が増殖を撃つのは1手番あたり約4%しかないため、勝率にはほとんどシグナルが乗らない
 *   (metrics --games 8 で魔法使い +0.018 ＝ 誤差範囲)。一方で懸念の本体は
 *   「維持コストをバッズ収入が上回り、ループが終わらなくなる」という*機構*なので、
 *   最初に払える手番で強制発動させ、**ループが何回続いたか(peak)**を直接見るほうが
 *   低分散かつ少ない試行数で決着する。
 *
 * 読み方:
 *   cap到達% が 0 なら、ループは必ず維持コスト切れで終息している(＝暴走していない)。
 *   meanPeak のキャラ間差が、そのキャラの魔力経済と増殖のシナジーの強さ。
 *   cast% は「最初に払える手番」までに到達した割合で、コスト修正(軍師+2/毒使い+1)を
 *   受けるキャラは低く出る。強さではなく発動しやすさの指標。
 */

const engine = require('./engine');
const ai = require('./ai');

const N = parseInt(process.argv[2] || '60', 10);
const MAX = engine.PROLIFERATE.maxStacks;

/** 片側だけ強制発動させて1試合流し、ループの最大到達回数を返す */
function run(me, opp, seed, meIsHeart) {
    const rng = engine.makeRng(seed);
    const s = engine.newGame({
        heartChar: meIsHeart ? me : opp,
        circleChar: meIsHeart ? opp : me,
        rng,
    });
    const active = () => (meIsHeart ? s.heartProliferate : s.circleProliferate);
    const count = () => (meIsHeart ? s.heartProliferateCount : s.circleProliferateCount);

    let casted = false, peak = 0, guard = 0;
    while (!s.winner && guard++ < 400) {
        // 最初に払える自分の手番で強制発動 (AI のゲートを迂回した統制条件)
        if (s.heartTurn === meIsHeart && !casted && !active()) {
            const cost = engine.calculateCost(s, engine.skillCosts.onClickProliferate);
            if (engine.curMagic(s) >= cost) {
                engine.SKILLS.proliferate(s);
                casted = true;
            }
        }
        const r = ai.makeMove(s, 'faithful');
        if (active()) peak = Math.max(peak, count());
        if (r.turnEnded) continue;
        if (r.move === null) break;
        const before = s.currentTurn;
        engine.placeMove(s, r.move);
        if (active()) peak = Math.max(peak, count());
        if (s.currentTurn === before) break; // 不正手で進まない場合の保険
    }
    return { casted, peak };
}

console.log(`# 増殖ループ終息テスト  n=${N}/側  maxStacks=${MAX}  cost=${engine.skillCosts.onClickProliferate}`);
console.log(['char'.padEnd(15), 'cast%', 'meanPeak', 'cap到達%', 'peak分布(0..' + MAX + ')'].join(' '));

const rows = [];
for (const c of engine.CHARACTERS) {
    let casts = 0, sum = 0, capped = 0;
    const hist = Array(MAX + 1).fill(0);
    for (let g = 0; g < N; g++) {
        for (const asHeart of [true, false]) {
            const r = run(c, 'you', 77000 + g * 977 + (asHeart ? 1 : 2), asHeart);
            if (!r.casted) continue;
            casts++;
            sum += r.peak;
            hist[Math.min(r.peak, MAX)]++;
            if (r.peak >= MAX) capped++;
        }
    }
    const mean = casts ? sum / casts : 0;
    const capPct = casts ? (100 * capped) / casts : 0;
    rows.push({ c, mean, capPct });
    console.log(
        c.padEnd(15),
        `${((100 * casts) / (N * 2)).toFixed(0).padStart(4)}%`,
        mean.toFixed(2).padStart(8),
        `${capPct.toFixed(1).padStart(7)}%`,
        ` ${hist.join('/')}`
    );
}

const mg = rows.find((r) => r.c === 'magician');
const others = rows.filter((r) => r.c !== 'magician');
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`\n魔法使い meanPeak ${mg.mean.toFixed(2)} vs 他平均 ${avg(others.map((r) => r.mean)).toFixed(2)}`);
console.log(`cap到達率 最大 ${Math.max(...rows.map((r) => r.capPct)).toFixed(1)}%  (0% なら全ループが維持コスト切れで終息)`);
