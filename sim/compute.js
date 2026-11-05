'use strict';
/*
 * 1ワーカーぶんの対戦ループ。Node の worker_threads(sim/watch-worker.js) とブラウザの Web Worker(public/simWorker.js) の両方から使う。
 * ゲーム番号 g は全ワーカーで共通で、ワーカー k は g = k, k+stride, k+2*stride, ... を担当する。
 * 1ゲームの乱数は g だけで決まるので、ワーカー数を変えても（全局を回し切れば）結果は同じ。
 * Node 専用 API は使わない。
 */
const engine = require('./engine');
const { runGame, pickChars } = require('./run');
const live = require('./live');

/** o = { players, size, mode, seed, fixedChars, skills, gears, offset, stride, maxGames } */
function createJob(o) {
    const ids = engine.CHARACTERS;
    const pairs = o.players === 2 && !o.fixedChars ? live.roundRobinPairs(ids) : null;
    const stats = live.createStats(ids, o.players);
    const stride = o.stride || 1;
    const max = o.maxGames == null ? Infinity : o.maxGames;
    const runOpts = { deck: o.skills !== false, gears: o.gears !== false, skills: o.skills !== false };
    let g = o.offset || 0;
    const charsFor = (i) => pairs ? pairs[i % pairs.length] : pickChars(o.players, o.fixedChars, engine.makeRng(o.seed * 2654435 + o.players + i * 104729));
    return {
        stats,
        get done() { return g >= max; },
        /** msBudget ミリ秒ぶん回す（メッセージを受け取れるよう、呼び出し側が小刻みに呼ぶ） */
        run(msBudget) {
            const end = Date.now() + msBudget;
            while (Date.now() < end && g < max) {
                const chars = charsFor(g);
                const rng = engine.makeRng(o.seed * 1000003 + g * 7919 + o.players);
                live.record(stats, chars, runGame(chars, rng, o.mode, o.size, undefined, runOpts));
                g += stride;
            }
        },
    };
}

module.exports = { createJob };
