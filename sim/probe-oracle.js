// @ts-check
'use strict';
/*
 * オラクル照合: AI の着手選択(getBestMove)が、より深い全探索と比べて最善か。
 * 実戦(本番AI同士)から取った局面ごとに、AI の着手と、候補手すべてを D 手先まで全探索(アルファベータ)した値を比べる。
 *   値 = +1: D 手先までに強制勝ち / -1: 強制負け / 0: 未決(探索の範囲では決まらない)
 *   「見逃した強制勝ち」: 最善手の値が +1 なのに、AI の手は +1 でない
 *   「強制負けに入った」: 最善手の値が -1 より良いのに、AI の手が -1
 * 近似: 着手だけの盤面ゲーム(スキル・パッシブ・ライフの乱数は無視。ライフは手番開始時の値を全員に使う)。
 * 使い方: node sim/probe-oracle.js --chars you,you --games 20 --seed 1 --depth 4
 */
const engine = require('./engine');
const U = require('./shared/util');
const args0 = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args0[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; }
const driver = require('./' + (args0.mod || 'aiDriver.js')); // --mod aiDriver.old.js で別版のAIを測る
const args = {};
for (let i = 2; i < process.argv.length; i++) { const a = process.argv[i]; if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1'; }
const CH = (args.chars || 'you,you').split(','); // 2人以上。3人以上は『自分が最大化、他の全員が順番に最小化』(パラノイド探索)
const [c1, c2] = CH;
const PROD = !!args.prod; // --prod: 全席が推奨デッキ・推奨ギア（省略するとデッキなし・ギアなし=手札が全札からランダム）
const gearMod = require('./shared/gear');
const size = args.size ? parseInt(args.size, 10) : undefined;
const games = parseInt(args.games || '20', 10), seed0 = parseInt(args.seed || '1', 10), D = parseInt(args.depth || '4', 10);
const symbolsOf = (b) => b.map((x) => (engine.isShikigami(x) ? undefined : x.player));

/** 状態の複製(関数は共有、Set/Map/配列/オブジェクトは再帰コピー)。複製側は c.rng を差し替えて使う */
function deepClone(x) {
    if (x === null || typeof x !== 'object') return x;
    if (x instanceof Set) return new Set([...x].map(deepClone));
    if (x instanceof Map) return new Map([...x].map(([k, v]) => [k, deepClone(v)]));
    if (Array.isArray(x)) return x.map(deepClone);
    const o = {};
    for (const k of Object.keys(x)) o[k] = deepClone(x[k]);
    return o;
}
/** 局面 snap から、手番の席が first を打ち、あとは本番AI同士で K 回(乱数違い)続けたときの、その席の勝ち数/決着数 */
function rollout(snap, seat, first, K) {
    let w = 0, done = 0;
    for (let k = 0; k < K; k++) {
        const c = deepClone(snap);
        c.rng = engine.makeRng(9000 + k);
        if (!engine.placeMove(c, first) && !c.winner) { continue; }
        let n = 0;
        while (!c.winner && n++ < 300) {
            const r = driver.makeMove(c, 'faithful');
            if (!r.turnEnded && r.move != null) engine.placeMove(c, r.move); else if (!r.turnEnded) engine.SKILLS.charge(c);
        }
        if (c.winner) { done++; if (engine.seatOf(c.winner) === seat) w++; }
    }
    return { w, done };
}
const K = parseInt(args.rollouts || '0', 10);
const stat = { turns: 0, compared: 0, optimal: 0, missedWin: 0, intoLoss: 0, other: 0, samples: [] };
const t0 = Date.now();
for (let g = 0; g < games; g++) {
    const s = PROD ? engine.newGame({ chars: CH, rng: engine.makeRng(seed0 * 100003 + g), size, decks: true, gears: CH.map((c) => gearMod.recommendedGears(c)) }) : engine.newGame({ chars: CH, rng: engine.makeRng(seed0 * 100003 + g), size });
    let n = 0;
    while (!s.winner && n++ < 400) {
        const seat = s.turn;
        const ai = driver.aiFor(s, seat);
        const me = ai.playerSymbol;
        // 手番順: 自分の次の席から巡回
        const order = [me]; for (let k = 1; k < CH.length; k++) order.push(engine.SYMBOLS[(seat + k) % CH.length]);
        const nextOf = (m) => order[(order.indexOf(m) + 1) % order.length];
        const board = s.board, life = s.life;
        ai.updateShield(board);
        stat.turns++;
        // 置ける手だけ(ロック・氷結中の空きマスなどを含めない)。AI の getBestMove の候補と同じ定義
        const cand = Array.from(new Set([...U.findEmptyIndexes(board), ...ai.getValidMoves(board, life), ...ai.reinforceMoves(board, life)]));
        const chosen = ai.getBestMove(board, life);
        if (chosen !== null && cand.length > 1) {
            /** me の視点の値。mover が手番、ply は着手の通し番号(減衰の文脈)、depth は残りの手数 */
            const search = (b, mover, ply, depth, alpha, beta) => {
                if (depth === 0) return 0;
                const moves = ai.getMovesFor(b, mover, life);
                if (moves.length === 0) return 0;
                let best = mover === me ? -2 : 2;
                for (const j of moves) {
                    const nb = ai.simulatePlace(b, j, mover, life, ply);
                    const w = engine.calculateWinner(symbolsOf(nb));
                    const v = w ? (w === me ? 1 : -1) : search(nb, nextOf(mover), ply + 1, depth - 1, alpha, beta);
                    if (mover === me) { if (v > best) best = v; if (best > alpha) alpha = best; } else { if (v < best) best = v; if (best < beta) beta = best; }
                    if (beta <= alpha) break;
                }
                return best;
            };
            const value = (m) => {
                const nb = ai.simulatePlace(board, m, me, life, 0);
                const w = engine.calculateWinner(symbolsOf(nb));
                if (w) return w === me ? 1 : -1;
                return search(nb, order[1], 1, D, -2, 2);
            };
            const vals = new Map(cand.map((m) => [m, value(m)]));
            const best = Math.max(...vals.values());
            const vc = vals.has(chosen) ? vals.get(chosen) : value(chosen);
            stat.compared++;
            const snap = K > 0 ? deepClone(s) : null;
            if (vc >= best) stat.optimal++;
            else {
                const kind = best === 1 ? 'missedWin' : vc === -1 ? 'intoLoss' : 'other';
                stat[kind]++;
                const bestMoves = cand.filter((m) => vals.get(m) === best);
                const sample = { kind, g, n, chosen, vc, best, bestMoves };
                if (snap && stat.samples.length < 60) {
                    sample.rolloutChosen = rollout(snap, seat, chosen, K);
                    sample.rolloutBest = rollout(snap, seat, bestMoves[0], K);
                }
                if (stat.samples.length < 60) stat.samples.push(sample);
            }
        }
        const r = driver.makeMove(s, 'faithful');
        if (!r.turnEnded && r.move != null) engine.placeMove(s, r.move); else if (!r.turnEnded) engine.SKILLS.charge(s);
    }
}
console.log(JSON.stringify({ chars: CH, games, depth: D, secs: Math.round((Date.now() - t0) / 1000), ...stat }, null, 1));
