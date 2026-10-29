// 範囲破壊スキル（ストンプ・審判の日）の純粋ロジック。Game.tsx・sim/engine.js・AIPlayer.ts(読み筋の盤面) が同じ関数を呼ぶ (#289)。
// board を直接書き換え、壊したコマの数・氷結が身代わりになったマス・範囲を返す。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { absorbDestroy, applyDamage, emptyBlocked } from './thermal';

export type BlastResult = {
    /** 範囲（演出用） */
    range: number[];
    /** 実際に破壊した、コマのあったマスの数（墓地に積む数） */
    destroyed: number;
    /** 氷結が身代わりになって壊れなかったマス */
    broken: number[];
};

const empty = (): SquareInfo => ({ player: undefined, bind: 0, effects: [] });

/** ストンプ: i を中心とする範囲の敵コマ・空きマスのロックなどを全て破壊し、自陣のコマはライフ-5（氷結なら解除だけ・🔥は1.5倍）。
 *  中心が空きマス（氷結中でない）なら、自分のコマ（ライフ life）を置く */
export const stomp = (board: SquareInfo[], i: number, player: Player, life: number): BlastResult => {
    const range = geometryForCells(board.length).stompRange(i);
    let destroyed = 0;
    const broken: number[] = [];
    for (const idx of range) {
        if (board[idx].player === player) {
            board[idx] = applyDamage(board[idx], 5, 'skill').sq;
            continue;
        }
        const guard = absorbDestroy(board[idx]);
        if (guard.blocked) {
            board[idx] = guard.sq; // 氷結が身代わりになる
            broken.push(idx);
            continue;
        }
        if (board[idx].player) destroyed++;
        board[idx] = empty();
    }
    if (board[i].player === undefined && !emptyBlocked(board[i])) board[i] = { player, bind: life, effects: [] };
    return { range, destroyed, broken };
};

/** 審判の日: i を中心とする十字の範囲を、自陣の🌱付きの🔑ロックマス以外すべて破壊する（敵味方問わず）。中心は自分のコマ（ライフ2・🌱）になる。
 *  ただし氷結が身代わりになって残った中心は奪えない */
export const judgeDay = (board: SquareInfo[], i: number, player: Player): BlastResult => {
    const range = geometryForCells(board.length).judgeRange(i);
    let destroyed = 0;
    let centerSurvived = false;
    const broken: number[] = [];
    for (const idx of range) {
        const sq = board[idx];
        const locked = sq.effects.some((e) => e.effect === '🔑');
        const protectedBud = sq.player === player && sq.effects.some((e) => e.effect === '🌱');
        if (locked && protectedBud) continue;
        const guard = absorbDestroy(sq);
        if (guard.blocked) {
            board[idx] = guard.sq;
            broken.push(idx);
            if (idx === i) centerSurvived = true;
            continue;
        }
        if (sq.player) destroyed++;
        board[idx] = empty();
    }
    if (!centerSurvived) board[i] = { player, bind: 2, effects: [{ effect: '🌱' }] };
    return { range, destroyed, broken };
};
