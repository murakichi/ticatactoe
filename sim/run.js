'use strict';
/*
 * 1ゲームを最後まで回す処理。Node(cli.js) とブラウザの Web Worker(public/simWorker.js) の両方から使うので、
 * Node 専用 API は使わない。
 */
const engine = require('./engine');
const ai = require('./ai');
const { CHARACTERS } = engine;

// 1ゲーム分を最後まで回す。chars=席順のキャラ配列、modes=席ごとのAI種別（文字列1つなら全席同じ）
function runGame(chars, rng, modes, size, tracker) {
    const modeOf = (seat) => (Array.isArray(modes) ? modes[seat] : modes);
    const s = engine.newGame({ chars, rng, size });
    const trk = tracker ? tracker(s) : null;
    let seenTurn = -1;
    // 着手ごとにスキルを使う手番もあるので、人数に比例して上限を広げる
    const limit = Math.max(400, 200 * chars.length);
    let guard = 0;
    while (!s.winner && guard++ < limit) {
        if (trk && s.currentTurn !== seenTurn) { seenTurn = s.currentTurn; trk.onTurnChange(s); }
        const result = ai.makeMove(s, modeOf(s.turn));
        if (result.turnEnded) continue;
        if (result.move === null) break;
        const before = s.currentTurn;
        engine.placeMove(s, result.move);
        if (s.currentTurn === before) break;
    }
    if (trk) trk.onTurnChange(s);
    return { winner: s.winner, winnerSeat: s.winner ? engine.seatOf(s.winner) : -1, turns: s.currentTurn };
}


// 各ゲームの席ごとのキャラは、--chars で固定するか、未指定ならゲームごとに一様ランダムに引く
function pickChars(n, fixed, rng) {
    if (fixed) {
        if (fixed.length !== n) throw new Error(`--chars needs ${n} characters (got ${fixed.length})`);
        return fixed;
    }
    return Array.from({ length: n }, () => CHARACTERS[Math.floor(rng() * CHARACTERS.length)]);
}


module.exports = { runGame, pickChars };
