#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * 帯電(雷霆の巫, #39)の機構レベルの計測。勝率ではなく「効いているか」を直接見る。
 *   node sim/probe-charge.js [games-per-side=100] [seed=1]
 *
 * 出力 (雷霆の巫 vs 各キャラ、先手/後手を合算):
 *  - 勝率 / 平均ターン / 引き分け(=着手候補が尽きて止まった)率
 *  - 1試合あたりの発火回数(byElec=雷霆の巫の着手で発火) / 相手の駒が受けたダメージ(dmgOpp) / 雷霆の巫の駒が受けたダメージ(dmgElec)
 *  - 帯電系スキルの使用回数/試合 (token=帯電トークン, dbl=帯電ダブルトークン, one=帯電付与, spread=帯電拡散, area=範囲帯電, rand=ランダム帯電, jam=ジャマー, jamZ=ジャマーでライフ0になった敵)
 *  - 手番ごとの平均 ⚡マス数 と 無敵(固まった自駒)数、⚡が1個以上盤上にあった手番の割合
 */
const engine = require('./engine');
const ai = require('./aiSelect');

const games = parseInt(process.argv[2] || '100', 10);
const baseSeed = parseInt(process.argv[3] || '1', 10);
const others = engine.CHARACTERS.filter((c) => c !== 'electrician').concat(['electrician']);

function play(hchar, cchar, seed) {
    const s = engine.newGame({ heartChar: hchar, circleChar: cchar, rng: engine.makeRng(seed) });
    let guard = 0, turnsSampled = 0, chargedCells = 0, frozen = 0, anyCharge = 0, stalled = false;
    while (!s.winner && guard++ < 400) {
        const r = ai.makeMove(s, 'faithful');
        if (r.turnEnded) continue;
        if (r.move === null) { stalled = true; break; }
        const before = s.currentTurn;
        engine.placeMove(s, r.move);
        if (s.currentTurn === before) { stalled = true; break; }
        // 着手後に盤面をサンプリング
        let c = 0, f = 0;
        for (const sq of s.board) {
            if (engine.chargeStacks(sq) > 0) { c++; if (engine.isShielded(s, sq)) f++; }
        }
        turnsSampled++; chargedCells += c; frozen += f; if (c > 0) anyCharge++;
    }
    return { s, turns: s.currentTurn, stalled, turnsSampled, chargedCells, frozen, anyCharge };
}

console.log(`# probe-charge  games/side=${games}  seed=${baseSeed}  poolSize=${engine.POOL_SIZE}\n`);
console.log('opp            winE   turns  stall  fires  byElec dmgOpp dmgElec | token dbl   one   spread area  rand  jam  jamZ  dsch | ⚡cells frozen ⚡有り手番%');
const total = { w: 0, l: 0 };
let vsOthers = { w: 0, l: 0 };
for (const opp of others) {
    let w = 0, l = 0, d = 0, turns = 0, stall = 0, n = 0;
    const st = { fires: 0, firesByElectrician: 0, dmgToOther: 0, dmgToElectrician: 0, chargeToken: 0, doubleChargeToken: 0, chargeOne: 0, chargeSpread: 0, chargeArea: 0, chargeRandom: 0, jammer: 0, jammerDmg: 0, jammerZeroed: 0, discharge: 0 };
    let cells = 0, frozen = 0, any = 0, sampled = 0;
    for (const electricFirst of [true, false]) {
        for (let g = 0; g < games; g++) {
            const seed = baseSeed * 100003 + g * 2 + (electricFirst ? 0 : 1);
            const h = electricFirst ? 'electrician' : opp;
            const c = electricFirst ? opp : 'electrician';
            const r = play(h, c, seed);
            const e = electricFirst ? engine.HEART : engine.CIRCLE;
            if (r.s.winner === e) w++; else if (r.s.winner) l++; else d++;
            turns += r.turns; stall += r.stalled ? 1 : 0; n++;
            for (const k of Object.keys(st)) st[k] += r.s.stats[k] || 0;
            cells += r.chargedCells; frozen += r.frozen; any += r.anyCharge; sampled += r.turnsSampled;
        }
    }
    total.w += w; total.l += l;
    if (opp !== 'electrician') { vsOthers.w += w; vsOthers.l += l; }
    const f = (x, k = 2) => (x / n).toFixed(k).padStart(5);
    console.log(
        `${opp.padEnd(14)} ${(w / (w + l || 1)).toFixed(3)}  ${f(turns, 1)}  ${(stall / n * 100).toFixed(1).padStart(4)}%` +
        `  ${f(st.fires)} ${f(st.firesByElectrician)} ${f(st.dmgToOther)} ${f(st.dmgToElectrician)} |` +
        ` ${f(st.chargeToken)} ${f(st.doubleChargeToken)} ${f(st.chargeOne)} ${f(st.chargeSpread)} ${f(st.chargeArea)} ${f(st.chargeRandom)} ${f(st.jammer)} ${f(st.jammerZeroed)} ${f(st.discharge, 3)} |` +
        `   ${(cells / sampled).toFixed(2).padStart(5)}  ${(frozen / sampled).toFixed(2).padStart(5)}   ${(any / sampled * 100).toFixed(0).padStart(4)}%`
    );
}
console.log(`\n雷霆の巫 対7キャラ勝率(ミラー除く): ${(vsOthers.w / (vsOthers.w + vsOthers.l)).toFixed(3)}  (n=${vsOthers.w + vsOthers.l})`);
console.log(`雷霆の巫 総合勝率(ミラー含む): ${(total.w / (total.w + total.l)).toFixed(3)}`);
