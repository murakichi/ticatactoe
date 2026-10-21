// 巨人のパッシブ: コマを置くと、周囲1マスの敵コマが破壊され、周囲の空きマスが「次の1手番」ロックされる。
// 氷結中の敵コマは❄1つが身代わりになって壊れない。ロック中・無敵の敵コマは対象外。自陣は触らない。
// sim/engine.js の giantAura と同じ規則（ロックの長さはライフ=1。次の減衰で外れる）。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { PlayerCharacters, isGuarded } from './charge';
import { absorbDestroy, lockable } from './thermal';

export interface GiantAuraResult {
    /** 破壊した敵コマ */
    destroyed: number[];
    /** 氷結が身代わりになって壊れなかった敵コマ */
    blocked: number[];
    /** ロックした空きマス（破壊して空いたマスを含む） */
    locked: number[];
}

/** board を直接書き換える（fireCharges と同じ）。me は巨人の持ち主、range は着手マスの周囲 */
export const giantAura = (board: SquareInfo[], range: number[], me: Player, chars: PlayerCharacters): GiantAuraResult => {
    const destroyed: number[] = [];
    const blocked: number[] = [];
    const locked: number[] = [];
    for (const j of range) {
        const sq = board[j];
        if (!sq.player || sq.player === me || isGuarded(sq, chars)) continue;
        const guard = absorbDestroy(sq);
        if (guard.blocked) {
            board[j] = guard.sq;
            blocked.push(j);
        } else {
            board[j] = { player: undefined, bind: 0, effects: [] };
            destroyed.push(j);
        }
    }
    for (const j of range) {
        const sq = board[j];
        if (sq.player || !lockable(sq) || sq.effects.some((e) => e.effect === '🔑')) continue;
        board[j] = { ...sq, bind: Math.max(sq.bind, 1), effects: [...sq.effects, { effect: '🔑' }] };
        locked.push(j);
    }
    return { destroyed, blocked, locked };
};
