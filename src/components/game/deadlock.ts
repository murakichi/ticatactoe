// 膠着の打開。全マスが氷結・ロックで誰も着手できず、全員がチャージでパスし続けると、着手が無い＝ライフ減衰が進まない＝氷結もロックも解けず、
// 永久に終わらない(氷室の番人 vs 毒使い/魔法使いなど。#204)。着手が何ラウンドも無いときは、盤面の時間を進める。Game.tsx と sim/engine.js が共有する。
import { SquareInfo } from '../../types/SquareInfo';
import { thawOne } from './thermal';

/** 着手が全く無いまま、この周回数だけ手番が回ったら膠着とみなす */
export const DEADLOCK_ROUNDS = 3;

/** 最後に着手があった手番から数えて、膠着か */
export const isDeadlocked = (currentTurn: number, lastPlacementTurn: number, seatCount: number): boolean =>
    currentTurn - lastPlacementTurn >= DEADLOCK_ROUNDS * seatCount;

/** 膠着の打開: 氷結のマスは❄を1つ解き、🔑ロックのマスはロックの残りライフを1減らす（0で外れる）。変わったマスを返す。board を直接書き換える */
export const breakDeadlock = (board: SquareInfo[]): number[] => {
    const changed: number[] = [];
    board.forEach((sq, k) => {
        let next = sq;
        if (next.effects.some((e) => e.effect === '❄')) next = thawOne(next);
        if (next.effects.some((e) => e.effect === '🔑')) {
            const bind = Math.max(0, next.bind - 1);
            next = { ...next, bind, effects: bind === 0 ? next.effects.filter((e) => e.effect !== '🔑') : next.effects };
        }
        if (next !== sq) { board[k] = next; changed.push(k); }
    });
    return changed;
};
