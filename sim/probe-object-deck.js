#!/usr/bin/env node
// @ts-check
'use strict';
/*
 * オブジェクト（や解体）を『推奨デッキの最後の札と入れ替えて』AI に使わせたときの勝率の変化。AI が自分で引いて・払って・置く。
 * probe-object-value.js（無料で置く＝価値）の検算で、コストとAIの置き方の両方が妥当なら、入れ替えで勝率は下がらない。
 *
 *   node sim/probe-object-deck.js --add 127 --chars you,keysmith --opps electrician,tactician --games 100 --seed 1 [--oppAdd 114] [--out f.jsonl]
 *   --add     テスト席のデッキの末尾から入れ替える札（idx をカンマ区切り。'none' で入れ替えなし）
 *   --oppAdd  相手のデッキにも入れる札（解体 114 など。対策を握った相手を作る）
 * 出力: (char, opp) ごとの1行 JSON。base は --add なし（--oppAdd はあり）の同じ seed の結果。
 */
const engine = require('./engine');
const drv = require('./aiDriver');
const deckMod = require('./shared/deck');
const gearMod = require('./shared/gear');
const fs = require('fs');
const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].slice(2)] = process.argv[i + 1];
const idxs = (v) => (!v || v === 'none' ? [] : v.split(',').map(Number));
const add = idxs(args.add), oppAdd = idxs(args.oppAdd);
const chars = (args.chars || 'you').split(','), opps = (args.opps || 'tactician').split(',');
const games = parseInt(args.games || '100', 10), seed0 = parseInt(args.seed || '1', 10);
const swap = (deck, cards) => { const d = deck.filter((x) => !cards.includes(x)); return [...d.slice(0, deck.length - cards.length), ...cards]; };
function run(c, o, mine) {
    const out = []; let built = 0, skills = 0;
    for (let g = 0; g < games; g++) {
        const me = g % 2;
        const cs = me ? [o, c] : [c, o];
        const decks = cs.map((x, i) => swap(deckMod.recommendedDeck(x), i === me ? mine : oppAdd));
        const s = engine.newGame({ chars: cs, rng: engine.makeRng(seed0 * 100003 + g), decks, gears: cs.map((x) => gearMod.recommendedGears(x)) });
        s.aiFlags = cs.map(() => ({}));
        let n = 0;
        while (!s.winner && n++ < 400) drv.playTurn(s);
        for (const [k, v] of Object.entries(s.stats || {})) { if (k === 'objectPlaced') built += v; if (/^objectSkill_/.test(k)) skills += v; }
        out.push(s.winner ? (engine.seatOf(s.winner) === me ? 1 : 0) : 0.5);
    }
    return { out, built, skills };
}
for (const c of chars) for (const o of opps) {
    if (c === o) continue;
    const b = run(c, o, []), v = run(c, o, add);
    const d = v.out.map((x, i) => x - b.out[i]);
    const mean = d.reduce((p, x) => p + x, 0) / d.length;
    const se = Math.sqrt(d.reduce((p, x) => p + (x - mean) ** 2, 0) / Math.max(1, d.length - 1) / d.length);
    const wr = (a) => (100 * a.reduce((p, x) => p + x, 0) / a.length).toFixed(1);
    const r = { add: args.add || 'none', oppAdd: args.oppAdd || 'none', char: c, opp: o, games, base: +wr(b.out), with: +wr(v.out), diff: +(100 * mean).toFixed(1), se: +(100 * se).toFixed(1), built: v.built, objSkills: v.skills, d: d.join(',') };
    const line = JSON.stringify(r);
    if (args.out) fs.appendFileSync(args.out, line + '\n');
    console.log(line.replace(/,"d":.*$/, '}'));
}
