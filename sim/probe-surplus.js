// @ts-check
'use strict';
/*
 * 魔力に余裕があるときの使い方: 使い切る/温存する のどちらかが常に最適とは限らないので、局面の区分ごとに最良の腕を見る。
 * 魔力が MIN 以上ある手番ごとに、同じ局面を複製して 4 通りのその後を、本番AI同士の K 回の実戦(乱数違い)で比べる:
 *   save   : スキルを使わず着手だけ（魔力を残す）
 *   current: 今の AI の計画どおり
 *   dig    : 先に引き直しを最大 2 回してから、今の AI の計画（余った魔力で札を探す）
 *   charge : 着手せずチャージ（魔力をためる。極端な温存）
 * 区分 = 魔力の量 × 局面の進み(手番数)。区分ごとに各腕の勝率と、current との差(SE つき)を出す。
 * 使い方: node sim/probe-surplus.js --chars tactician,you --games 30 --seed 1 --rollouts 6 --min 6 --every 1 --prod
 */
const engine = require('./engine');
const driver = require('./aiDriver');
const gearMod = require('./shared/gear');
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; }
const CH = (args.chars || 'you,you').split(',');
const games = parseInt(args.games || '20', 10), seed0 = parseInt(args.seed || '1', 10), K = parseInt(args.rollouts || '6', 10);
const MIN = parseInt(args.min || '6', 10), every = parseInt(args.every || '1', 10), PROD = !!args.prod;
const seatUnder = parseInt(args.seat || '0', 10);

function deepClone(x) {
    if (x === null || typeof x !== 'object') return x;
    if (x instanceof Set) return new Set([...x].map(deepClone));
    if (x instanceof Map) return new Map([...x].map(([k, v]) => [k, deepClone(v)]));
    if (Array.isArray(x)) return x.map(deepClone);
    const o = {};
    for (const k of Object.keys(x)) o[k] = deepClone(x[k]);
    return o;
}
const ARMS = {
    save: (c) => driver.playPlaceOnly(c),
    current: (c) => driver.playTurn(c),
    dig: (c) => { for (let i = 0; i < 2; i++) { if (engine.curMagic(c) >= engine.costsOf(c).onClickShuffle + 1) engine.shuffleHand(c); } driver.playTurn(c); },
    charge: (c) => engine.SKILLS.charge(c),
};
function rollout(snap, seat, arm, k) {
    const c = deepClone(snap);
    c.rng = engine.makeRng(9000 + k);
    ARMS[arm](c);
    let n = 0;
    while (!c.winner && n++ < 300) driver.playTurn(c);
    return c.winner ? (engine.seatOf(c.winner) === seat ? 1 : 0) : 0.5;
}
const magicBin = (m) => (m < 10 ? '06-09' : m < 15 ? '10-14' : m < 25 ? '15-24' : '25+');
const phaseBin = (n) => (n <= 10 ? '序盤(~10手)' : n <= 26 ? '中盤(~26手)' : '終盤(27手~)');

const samples = [];
const t0 = Date.now();
let tick = 0;
for (let g = 0; g < games; g++) {
    const s = PROD ? engine.newGame({ chars: CH, rng: engine.makeRng(seed0 * 100003 + g), decks: true, gears: CH.map((c) => gearMod.recommendedGears(c)) }) : engine.newGame({ chars: CH, rng: engine.makeRng(seed0 * 100003 + g) });
    let n = 0;
    while (!s.winner && n++ < 300) {
        const seat = s.turn;
        const m = engine.curMagic(s);
        if (seat === seatUnder && m >= MIN && ++tick % every === 0) {
            const snap = deepClone(s);
            const row = { char: s.chars[seat], magic: m, turn: n, vals: {} };
            for (const arm of Object.keys(ARMS)) { let v = 0; for (let k = 0; k < K; k++) v += rollout(snap, seat, arm, k); row.vals[arm] = v / K; }
            samples.push(row);
        }
        driver.playTurn(s);
    }
}

// 区分ごとの集計
const bins = {};
for (const x of samples) {
    const key = `${magicBin(x.magic)} / ${phaseBin(x.turn)}`;
    (bins[key] ||= []).push(x);
}
const stat = (xs, arm) => { const v = xs.map((x) => x.vals[arm]); const m = v.reduce((a, b) => a + b, 0) / v.length; return m; };
const diffStat = (xs, arm) => { const d = xs.map((x) => x.vals[arm] - x.vals.current); const m = d.reduce((a, b) => a + b, 0) / d.length; const sd = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(d.length - 1, 1)); return { m, se: sd / Math.sqrt(d.length) }; };
if (samples.length) bins['ALL(全区分)'] = samples; // 組(キャラ×対面)全体の合算
const rows = Object.entries(bins).map(([key, xs]) => {
    const row = { bin: key, n: xs.length };
    for (const arm of Object.keys(ARMS)) { row[arm] = Math.round(stat(xs, arm) * 1000) / 10; if (arm !== 'current') { const d = diffStat(xs, arm); row[arm + '_diff'] = Math.round(d.m * 1000) / 10; row[arm + '_se'] = Math.round(d.se * 1000) / 10; } }
    return row;
}).sort((a, b) => a.bin.localeCompare(b.bin));
console.log(JSON.stringify({ chars: CH, games, rollouts: K, min: MIN, secs: Math.round((Date.now() - t0) / 1000), samples: samples.length, rows }, null, 1));
