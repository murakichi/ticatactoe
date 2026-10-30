// @ts-check
'use strict';
/*
 * スキルの使いどころの反事実: AI がスキルを使った手番ごとに、同じ局面を複製して
 *   (A) AI の計画どおりスキルを使う  (B) スキルを使わず着手だけ(playPlaceOnly)
 * の2通りで、その後を本番AI同士で K 回(乱数違い)続け、その席の勝率を比べる。差 = A - B。
 * スキル別・キャラ別に集計すると、使うほうが得か(差>0)、損か(差<0)が分かる。
 * 近似: (B) は「スキルを使わずに最善の着手をする」。スキルを使った手番の着手も AI の計画どおり(スキル前の盤面で決めた着手)。
 * 使い方: node sim/probe-skilluse.js --chars tactician,you --games 20 --seed 1 --rollouts 10 --every 2
 *   chars は 'AIの席のキャラ,相手のキャラ'。測るのは両席のスキル使用(--seat both)か片方(--seat 0|1、既定 both)。
 */
const engine = require('./engine');
const driver = require('./aiDriver');
const aiTurn = require('./shared/aiTurn');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; }
const [c1, c2] = (args.chars || 'you,you').split(',');
const games = parseInt(args.games || '10', 10), seed0 = parseInt(args.seed || '1', 10), K = parseInt(args.rollouts || '10', 10), every = parseInt(args.every || '2', 10);
const IGNORE = new Set(['aiReplan', 'onClickShuffle']);
const CMP = args.cmp || 'none'; // none: スキルなし(着手だけ)と比べる / ban: その札を手札から外した、AIの次善の計画と比べる
const idxOfKey = {};
for (const e of require('./shared/deck').SKILL_CATALOG) idxOfKey[e.costKey] = e.idx;

// 計画の記録（手番ごとに空にする）
let plans = [];
const origPlan = aiTurn.planAITurn;
aiTurn.planAITurn = function () { const p = origPlan.apply(this, arguments); plans.push(p); return p; };
const skillsOf = (ps) => {
    const out = [];
    for (const p of ps) {
        const list = p.kind === 'queue' ? p.steps.filter((x) => typeof x === 'string') : p.kind === 'direct' ? p.skills : p.kind === 'reroll' ? p.steps.filter((x) => typeof x === 'string') : [];
        for (const sk of list) if (typeof sk === 'string' && sk.startsWith('onClick') && !IGNORE.has(sk)) out.push(sk);
    }
    return out;
};

function deepClone(x) {
    if (x === null || typeof x !== 'object') return x;
    if (x instanceof Set) return new Set([...x].map(deepClone));
    if (x instanceof Map) return new Map([...x].map(([k, v]) => [k, deepClone(v)]));
    if (Array.isArray(x)) return x.map(deepClone);
    const o = {};
    for (const k of Object.keys(x)) o[k] = deepClone(x[k]);
    return o;
}
/** 局面 snap の手番で firstTurn(c) を行い、あとは本番AI同士で続けたときの seat の勝ち点(勝ち1・引分/未決0.5) */
function rollout(snap, seat, firstTurn, k) {
    const c = deepClone(snap);
    c.rng = engine.makeRng(9000 + k);
    plans = [];
    firstTurn(c);
    let n = 0;
    while (!c.winner && n++ < 300) driver.playTurn(c);
    return c.winner ? (engine.seatOf(c.winner) === seat ? 1 : 0) : 0.5;
}

const samples = [];
const t0 = Date.now();
let tick = 0;
for (let g = 0; g < games; g++) {
    const s = engine.newGame({ chars: [c1, c2], rng: engine.makeRng(seed0 * 100003 + g) });
    let n = 0;
    while (!s.winner && n++ < 300) {
        const seat = s.turn;
        const snap = deepClone(s);
        plans = [];
        driver.playTurn(s);
        const skills = skillsOf(plans);
        if (skills.length === 0 || s.winner && false) continue;
        if (args.seat !== undefined && args.seat !== 'both' && String(seat) !== args.seat) continue;
        if (++tick % every !== 0) continue;
        let a = 0, b = 0;
        const banned = {}; // スキル名 -> その札を手札から外したときの勝ち点の合計
        const uniq = [...new Set(skills)];
        for (let k = 0; k < K; k++) {
            a += rollout(snap, seat, (c) => driver.playTurn(c), k);
            if (CMP === 'ban') {
                for (const sk of uniq) {
                    const idx = idxOfKey[sk];
                    if (idx === undefined) continue; // 手札の札ではない(ロックなど)
                    banned[sk] = (banned[sk] || 0) + rollout(snap, seat, (c) => { c.skills = c.skills.filter((i) => i !== idx); driver.playTurn(c); }, k);
                }
            } else b += rollout(snap, seat, (c) => driver.playPlaceOnly(c), k);
        }
        const bans = {};
        for (const sk of Object.keys(banned)) bans[sk] = banned[sk] / K;
        samples.push({ g, n, seat, char: s.chars[seat], skills, a: a / K, b: b / K, bans });
    }
}

// 集計: スキル別（そのスキルを含む手番）と、スキルが1つだけの手番
const agg = {};
const add = (key, d) => { const e = (agg[key] ||= { n: 0, sum: 0, sq: 0 }); e.n++; e.sum += d; e.sq += d * d; };
for (const x of samples) {
    if (CMP === 'ban') { for (const sk of Object.keys(x.bans)) add(sk, x.a - x.bans[sk]); continue; }
    const d = x.a - x.b;
    for (const sk of new Set(x.skills)) add(sk, d);
    if (x.skills.length === 1) add('ONLY:' + x.skills[0], d);
    add('ALL', d);
}
const rows = Object.entries(agg).map(([k, e]) => { const m = e.sum / e.n; const sd = Math.sqrt(Math.max(e.sq / e.n - m * m, 0)); return { skill: k, n: e.n, meanDiffPt: Math.round(m * 1000) / 10, sePt: e.n > 1 ? Math.round(sd / Math.sqrt(e.n - 1) * 1000) / 10 : null }; }).sort((p, q) => q.n - p.n);
console.log(JSON.stringify({ chars: [c1, c2], cmp: CMP, games, rollouts: K, every, secs: Math.round((Date.now() - t0) / 1000), samples: samples.length, rows }, null, 1));
