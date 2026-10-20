// @ts-check
'use strict';
/*
 * AI の paired A/B 検証。同じシード・同じ席順で「AI-A」と「AI-B」を対戦させ、勝率と信頼区間を出す。
 * 使い方:
 *   node sim/probe-ai.js --chars cryomancer,you --games 200 --seed 1 [--flagsA k=v,k2=v] [--flagsB k=v] [--modA ai.js] [--modB ai.base.js] [--mode h2h|vs]
 * h2h: A と B が同じ盤で対戦（席は交互に先手）。chars = 'A のキャラ,B のキャラ'
 * vs : A と B がそれぞれ「ベースライン AI(modB・flagsなし)」を相手に同じキャラ構成で対戦し、A 側の勝率の差を見る
 *      （chars = 'テスト対象キャラ,相手キャラ'。A 設定でのテスト対象勝率 − B 設定でのテスト対象勝率）
 * 結果は最後に JSON 1行（集計用）と人が読める要約を出す。
 */
const path = require('path');
const engine = require('./engine');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1';
}
const parseFlags = (str) => {
    const o = {};
    if (!str) return o;
    for (const kv of str.split(',')) { const [k, v] = kv.split('='); o[k] = v === undefined ? true : v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v); }
    return o;
};
const load = (m) => require(path.resolve(__dirname, m || 'ai.js'));
const modA = load(args.modA), modB = load(args.modB);
const flagsA = parseFlags(args.flagsA), flagsB = parseFlags(args.flagsB);
const [c1, c2] = (args.chars || 'you,you').split(',');
const games = parseInt(args.games || '100', 10);
const seed0 = parseInt(args.seed || '1', 10);
const mode = args.mode || 'h2h';
const maxTurns = 600;

/** mods[seat] / flags[seat] で席ごとのAIを切り替えて1試合。勝者の席(なければ -1)を返す */
function play(chars, mods, flags, seed, size) {
    const s = engine.newGame({ chars, rng: engine.makeRng(seed), size });
    s.aiFlags = flags;
    let g = 0;
    while (!s.winner && g++ < maxTurns) {
        const r = mods[s.turn].makeMove(s, 'faithful');
        if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move);
        else if (!r.turnEnded) engine.SKILLS.charge(s);
    }
    return s.winner ? engine.seatOf(s.winner) : -1;
}

const tally = () => ({ w: 0, l: 0, d: 0 });
const add = (t, seat, testSeat) => { if (seat === -1) t.d++; else if (seat === testSeat) t.w++; else t.l++; };
const out = { chars: [c1, c2], mode, games, seed: seed0, flagsA, flagsB, modA: args.modA || 'ai.js', modB: args.modB || 'ai.js' };
const size = args.size ? parseInt(args.size, 10) : undefined;

if (mode === 'h2h') {
    // A=c1 の席 / B=c2 の席。試合ごとに先手を入れ替える
    const t = tally();
    for (let g = 0; g < games; g++) {
        const aFirst = g % 2 === 0;
        const chars = aFirst ? [c1, c2] : [c2, c1];
        const mods = aFirst ? [modA, modB] : [modB, modA];
        const flags = aFirst ? [flagsA, flagsB] : [flagsB, flagsA];
        add(t, play(chars, mods, flags, seed0 * 100003 + g, size), aFirst ? 0 : 1);
    }
    out.A = t;
} else {
    // vs: テスト対象(c1)を A設定 / B設定 にして、同じ相手(c2・ベースライン)と同じシードで戦わせる
    const ta = tally(), tb = tally();
    for (let g = 0; g < games; g++) {
        const first = g % 2 === 0;
        const chars = first ? [c1, c2] : [c2, c1];
        const test = first ? 0 : 1;
        const seed = seed0 * 100003 + g;
        const mk = (mod, flag) => (first ? [mod, modB] : [modB, mod]).map((m) => m);
        const fl = (f) => (first ? [f, {}] : [{}, f]);
        add(ta, play(chars, mk(modA, flagsA), fl(flagsA), seed, size), test);
        add(tb, play(chars, mk(modB, flagsB), fl(flagsB), seed, size), test);
    }
    out.A = ta; out.B = tb;
}
console.log('RESULT ' + JSON.stringify(out));
