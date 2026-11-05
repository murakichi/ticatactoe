// 自動生成: src/components/game/blast.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.judgeDay = exports.stomp = void 0;
const boardGeometry_1 = require("./boardGeometry");
const thermal_1 = require("./thermal");
const empty = () => ({ player: undefined, bind: 0, effects: [] });
/** ストンプ: i を中心とする範囲の敵コマ・空きマスのロックなどを全て破壊し、自陣のコマはライフ-5（氷結なら解除だけ・🔥は1.5倍）。
 *  中心が空きマス（氷結中でない）なら、自分のコマ（ライフ life）を置く */
const stomp = (board, i, player, life) => {
    const range = (0, boardGeometry_1.geometryForCells)(board.length).stompRange(i);
    let destroyed = 0;
    const broken = [];
    for (const idx of range) {
        if (board[idx].player === player) {
            board[idx] = (0, thermal_1.applyDamage)(board[idx], 5, 'skill').sq;
            continue;
        }
        const guard = (0, thermal_1.absorbDestroy)(board[idx]);
        if (guard.blocked) {
            board[idx] = guard.sq; // 氷結が身代わりになる
            broken.push(idx);
            continue;
        }
        if (board[idx].player)
            destroyed++;
        board[idx] = empty();
    }
    if (board[i].player === undefined && !(0, thermal_1.emptyBlocked)(board[i]))
        board[i] = { player, bind: life, effects: [] };
    return { range, destroyed, broken };
};
exports.stomp = stomp;
/** 審判の日: i を中心とする十字の範囲を、自陣の🌱付きの🔑ロックマス以外すべて破壊する（敵味方問わず）。中心は自分のコマ（ライフ2・🌱）になる。
 *  ただし氷結が身代わりになって残った中心は奪えない */
const judgeDay = (board, i, player) => {
    const range = (0, boardGeometry_1.geometryForCells)(board.length).judgeRange(i);
    let destroyed = 0;
    let centerSurvived = false;
    const broken = [];
    for (const idx of range) {
        const sq = board[idx];
        const locked = sq.effects.some((e) => e.effect === '🔑');
        const protectedBud = sq.player === player && sq.effects.some((e) => e.effect === '🌱');
        if (locked && protectedBud)
            continue;
        const guard = (0, thermal_1.absorbDestroy)(sq);
        if (guard.blocked) {
            board[idx] = guard.sq;
            broken.push(idx);
            if (idx === i)
                centerSurvived = true;
            continue;
        }
        if (sq.player)
            destroyed++;
        board[idx] = empty();
    }
    if (!centerSurvived)
        board[i] = { player, bind: 2, effects: [{ effect: '🌱' }] };
    return { range, destroyed, broken };
};
exports.judgeDay = judgeDay;
