// 自動生成: src/components/game/generic.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plunder = exports.plunderTargets = exports.cloneInto = exports.cloneTargets = exports.cloneLife = exports.relocate = exports.canRelocate = exports.isPlaceable = exports.boostAll = exports.PLUNDER_LIFE = void 0;
const Player_1 = require("./Player");
const boardGeometry_1 = require("./boardGeometry");
const thermal_1 = require("./thermal");
const hasLock = (sq) => sq.effects.some((e) => e.effect === '🔑');
/** 追い剥ぎで奪ったコマのライフ */
exports.PLUNDER_LIFE = 1;
/** 慈雨: player の全コマのライフを +amount する（ライフ0のコマも）。慈雨したマスを返す。board を直接書き換える */
const boostAll = (board, player, amount = 1) => {
    const done = [];
    board.forEach((sq, i) => {
        if (sq.player !== player)
            return;
        board[i] = { ...sq, bind: sq.bind + amount };
        done.push(i);
    });
    return done;
};
exports.boostAll = boostAll;
/** 着手（設置）できる空きマスか: コマが無く、🔑ロック中でなく、氷結中でない */
const isPlaceable = (sq) => !sq.player && !hasLock(sq) && !(0, thermal_1.emptyBlocked)(sq);
exports.isPlaceable = isPlaceable;
/** 縮地で動かせる自陣のコマか: 🔑ロック中でも氷結中でもない */
const canRelocate = (sq, me) => !!sq.player && sq.player === me && !hasLock(sq) && !(0, thermal_1.isFrozen)(sq);
exports.canRelocate = canRelocate;
/** 縮地: from の自陣のコマ（ライフ・エフェクトごと）を空きマス to へ動かす。動かせたら true。board を直接書き換える */
const relocate = (board, from, to, me) => {
    if (from === to || !(0, exports.canRelocate)(board[from], me) || !(0, exports.isPlaceable)(board[to]))
        return false;
    board[to] = board[from];
    board[from] = { player: undefined, bind: 0, effects: [] };
    return true;
};
exports.relocate = relocate;
/** 写し身で増えたコマのライフ: 元のライフの半分（切り捨て、最低1） */
const cloneLife = (bind) => Math.max(1, Math.floor(bind / 2));
exports.cloneLife = cloneLife;
/** 写し身の置き先: from の縦横隣の置ける空きマス（昇順） */
const cloneTargets = (board, from, size) => (0, boardGeometry_1.orthoNeighbors)(from, size)
    .filter((k) => (0, exports.isPlaceable)(board[k]))
    .sort((a, b) => a - b);
exports.cloneTargets = cloneTargets;
/** 写し身: from の自陣のコマの写し（ライフは半分、エフェクトなし）を空きマス to に置く。board を直接書き換える */
const cloneInto = (board, from, to, me) => {
    board[to] = { player: me, bind: (0, exports.cloneLife)(board[from].bind), effects: [] };
};
exports.cloneInto = cloneInto;
/** 追い剥ぎの対象: 使用者以外のライフ0のコマで、🔑ロック中でなく、雷霆の巫の⚡無敵でないもの（昇順） */
const plunderTargets = (board, me, chars) => board
    .map((sq, i) => {
    if (!sq.player || sq.player === me || sq.bind !== 0 || hasLock(sq))
        return -1;
    if (chars[(0, Player_1.seatOf)(sq.player)] === 'electrician' && sq.effects.some((e) => e.effect === '⚡') && !(0, thermal_1.isFrozen)(sq))
        return -1;
    return i;
})
    .filter((i) => i !== -1);
exports.plunderTargets = plunderTargets;
/** 追い剥ぎ: cell のライフ0の敵コマを自陣のコマ（ライフ1）にする（エフェクトは消える）。board を直接書き換える */
const plunder = (board, cell, me) => {
    board[cell] = { player: me, bind: exports.PLUNDER_LIFE, effects: [] };
};
exports.plunder = plunder;
