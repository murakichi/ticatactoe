'use strict';
/*
 * 1ゲームを最後まで回す処理。Node(cli.js) とブラウザの Web Worker(public/simWorker.js) の両方から使うので、
 * Node 専用 API は使わない。
 */
const engine = require('./engine');
const ai = require('./ai');
const aiDriver = require('./aiDriver');
const deckMod = require('./shared/deck');
const gearMod = require('./shared/gear');
const { CHARACTERS } = engine;

// 1ゲーム分を最後まで回す。chars=席順のキャラ配列、modes=席ごとのAI種別（文字列1つなら全席同じ）
// 本番のAI席と同じ装備（推奨デッキ・推奨ギアの主案/別案からの選択。ランダムな入れ替えはしない）を席ごとに持たせる。
// 何も渡さないと全キャラが「デッキ未指定・ギアなし」で戦い、実ゲームや環境順位(probe-top)とかけ離れる（陰陽師が極端に弱くなる）
function aiLoadout(chars, rng, opts) {
    const out = {};
    if (opts.deck) out.decks = chars.map((c) => deckMod.pickRecommendedDeck(c, rng));
    if (opts.gears) out.gears = chars.map((c) => gearMod.pickRecommendedGears(c, rng));
    return out;
}

/**
 * opts（省略すると従来どおり装備なし・スキルあり）:
 *   deck/gears: 本番AIと同じデッキ・ギアを持たせる
 *   skills=false: AIが魔法スキルを一切使わず、置くだけ（キャラのパッシブとギアは有効）
 */
function runGame(chars, rng, modes, size, tracker, opts = {}) {
    const modeOf = (seat) => (Array.isArray(modes) ? modes[seat] : modes);
    const s = engine.newGame({ chars, rng, size, ...aiLoadout(chars, rng, opts) });
    const trk = tracker ? tracker(s) : null;
    let seenTurn = -1;
    // 着手ごとにスキルを使う手番もあるので、人数に比例して上限を広げる
    const limit = Math.max(400, 200 * chars.length);
    let guard = 0;
    // 誰も着手しないままターン終了(チャージ等のパス)が続く＝盤面が構造的に動かない膠着（氷結で空きマスが全部塞がり、自コマはロックで上書きされない、など）。
    // 魔力が貯まっても AI は解消しないので、打ち切って引き分けにする（そのまま回すと上限までパスを数百回繰り返す）
    let passes = 0;
    const STALEMATE_PASSES = 20;
    while (!s.winner && guard++ < limit) {
        if (trk && s.currentTurn !== seenTurn) { seenTurn = s.currentTurn; trk.onTurnChange(s); }
        // mode 'prod' は本番のAI(AIPlayer.ts の生成物)で1手番を最後まで進める。それ以外は sim 版AI(ai.js)
        if (modeOf(s.turn) === 'prod') {
            const placed = s.placements;
            if (opts.skills === false) aiDriver.playPlaceOnly(s); else aiDriver.playTurn(s);
            // パスだけが続く膠着は打ち切る(引き分け)。着手があれば数え直す。氷結・ロックの膠着は deadlock.ts が先に解くので、ここに来るのは別の膠着
            if (s.placements !== placed) passes = 0; else if (++passes >= STALEMATE_PASSES) break;
            continue;
        }
        const result = opts.skills === false ? ai.passIfStuck(s, { move: ai.getEnhancedBestMove(s), turnEnded: false }) : ai.makeMove(s, modeOf(s.turn));
        if (result.turnEnded) { if (++passes >= STALEMATE_PASSES) break; continue; }
        passes = 0;
        if (result.move === null) break;
        const before = s.currentTurn;
        engine.placeMove(s, result.move);
        if (s.currentTurn === before) break;
    }
    if (trk) trk.onTurnChange(s);
    return { winner: s.winner, winnerSeat: s.winner ? engine.seatOf(s.winner) : -1, turns: s.currentTurn, stats: s.stats };
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
