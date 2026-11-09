// 範囲破壊スキル（ストンプ・審判の日）の純粋ロジック。Game.tsx・sim/engine.js・AIPlayer.ts(読み筋の盤面) が同じ関数を呼ぶ (#289)。
// board を直接書き換え、壊したコマの数・氷結が身代わりになったマス・範囲を返す。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { Gears } from './gear';
import { applyLockAt } from './tokenAfter';
import { absorbDestroy, applyDamage, emptyBlocked, isFrozen } from './thermal';

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

/** 審判の日のダメージ。ロックを外し氷結を解いたあとのコマに与える（ライフが0になったら破壊） */
export const JUDGE_DAY_DAMAGE = 99;

/**
 * 審判の日。i を中心とする範囲（十字＋斜め。judgeRange）の各マスを、次の順に処理する（敵味方問わず）。
 *  - バッズ(🌱)のあるマス: 何もしない（コマも、ロック・氷結もそのまま）
 *  - バッズのないマス: すべてのエフェクト-99（ロック・氷結・炎・毒・⚡など全てが外れる。氷結は身代わりにならない）→ 99ダメージ（スキルのダメージ）
 *    → ライフ0は破壊（コマのない空きマスは、エフェクトが全て外れるだけ）
 *  - 中心: 敵のコマが残っていたら（バッズ付き・ダメージを受けきった）置かない。置くなら自分の🌱付きコマ（ライフ2）で、
 *    🔑ロック付き（lock を渡したとき。スタックは堅牢の鍵で延びる）。バッズ付きの🔑ロックのコマは次の審判の日でも壊れない
 * ダメージは thermal.ts の applyDamage('skill')（鍵師の封鎖の断と同じ関数）。
 * broken は氷結が解けたマス（演出用）
 */
export const judgeDay = (board: SquareInfo[], i: number, player: Player, lock?: { gears: Gears; seat: number }): BlastResult => {
    const range = geometryForCells(board.length).judgeRange(i);
    let destroyed = 0;
    const broken: number[] = [];
    for (const idx of range) {
        const sq = board[idx];
        if (sq.effects.some((e) => e.effect === '🌱')) continue; // バッズのあるマスは対象外
        if (isFrozen(sq)) broken.push(idx);
        const stripped: SquareInfo = { ...sq, effects: [] }; // すべてのエフェクト-99
        if (!sq.player) {
            board[idx] = stripped;
            continue;
        }
        const hit = applyDamage(stripped, JUDGE_DAY_DAMAGE, 'skill'); // 99ダメージ
        if (hit.sq.bind > 0) {
            board[idx] = hit.sq; // ダメージを受けきった（ライフが残る）なら破壊されない
            continue;
        }
        destroyed++; // ライフ0は破壊
        board[idx] = empty();
    }
    if (!board[i].player || board[i].player === player) {
        board[i] = { player, bind: 2, effects: [{ effect: '🌱' }] };
        if (lock) applyLockAt(board, i, lock.gears, lock.seat);
    }
    return { range, destroyed, broken };
};

/** 審判の日を i に撃ったとき壊れる、コマのあるマス（元の持ち主つき）。board は書き換えない（AIの読み筋用） */
export const judgeDayVictims = (board: SquareInfo[], i: number, player: Player): { cell: number; owner: Player }[] => {
    const post = board.map((sq) => ({ ...sq, effects: sq.effects.slice() }));
    judgeDay(post, i, player);
    const out: { cell: number; owner: Player }[] = [];
    board.forEach((sq, k) => {
        if (sq.player && !post[k].player && k !== i) out.push({ cell: k, owner: sq.player });
        else if (sq.player && k === i && post[k].player !== sq.player) out.push({ cell: k, owner: sq.player });
    });
    return out;
};
