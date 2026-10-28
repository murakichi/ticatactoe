// @ts-check
'use strict';
/*
 * duel.js 用: 4連の勝ち手(リーチ)の検出。盤面の見落とし防止に使う。
 * 「勝ち手」= by がそのマスに置く(または奪取する)と4連が完成するマス。
 * 空きマスだけでなく、ライフ0で奪えるコマも「置ける」とみなす(毒使い・ネクロ戦で負けた局の大半はこの奪取)。
 *   decayed=true: 自分の着手の直後の減衰(ライフ-1)と毒(1スタック=-1)を織り込む。置いた直後に相手が奪えるコマを拾う。
 */
const engine = require('./engine');
const thermal = require('./thermal');
const { geometryForCells } = require('./geometry');

const hasEff = (sq, e) => sq.effects.some((x) => x.effect === e);

/** by がそのマスを取れるか(空きマス、または by 以外のコマでライフが尽きていて守られていない) */
function takeable(s, board, i, by, decayed) {
    const sq = board[i];
    if (!sq.player) return !hasEff(sq, '🔑') && !thermal.emptyBlocked(sq);
    if (sq.player === by) return false;
    if (engine.isGuarded(s, sq) || thermal.isFrozen(sq)) return false;
    let bind = sq.bind;
    if (decayed) {
        bind -= 1;
        if (!thermal.isDormant(sq)) bind -= sq.effects.filter((e) => e.effect === '☠').length;
    }
    return bind <= 0;
}

/** by の勝ち手: [{ cell, line }]。同じマスは1つにまとめる */
function winCells(s, board, by, decayed) {
    const out = [];
    for (const line of geometryForCells(board.length).winLines) {
        let own = 0, free = -1, bad = false;
        for (const idx of line) {
            const sq = board[idx];
            if (sq.player === by) own++;
            else if (takeable(s, board, idx, by, decayed) && free === -1) free = idx;
            else bad = true;
        }
        if (!bad && own === 3 && free !== -1 && !out.some((o) => o.cell === free)) out.push({ cell: free, line });
    }
    return out;
}

/** me が cell に置いた後の盤(置けない・奪えないマスなら null)。ライフは s.life */
function afterPlace(s, board, cell, me) {
    if (!takeable(s, board, cell, me, false)) return null;
    const nb = board.map((q) => ({ player: q.player, bind: q.bind, effects: q.effects.slice() }));
    nb[cell] = { player: me, bind: s.life, effects: [] };
    return nb;
}

/** 着手前の警告。me が cell に置いたあと、相手に勝ち手が残るなら { cells } を返す(自分がその手で勝つなら null) */
function placeWarning(s, me, opp, cell) {
    const nb = afterPlace(s, s.board, cell, me);
    if (!nb) return null;
    if (engine.calculateWinner(nb.map((q) => q.player)) === me) return null;
    const left = winCells(s, nb, opp, true);
    return left.length ? { cells: left.map((o) => o.cell), fork: left.length >= 2 } : null;
}

module.exports = { takeable, winCells, afterPlace, placeWarning };
