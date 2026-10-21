// 巨人のパッシブ: コマを置くと、周囲1マスの空きマスが「次の1手番」ロックされ、周囲の敵コマに1ダメージ。
// sim/engine.js の giantAura と同じ規則（ロックの長さはライフ=1。次の減衰で外れる）。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { PlayerCharacters, isGuarded } from './charge';
import { applyDamage, lockable } from './thermal';

export interface GiantAuraResult {
    /** ロックした空きマス */
    locked: number[];
    /** ダメージを与えた（氷結を解いた）敵コマ */
    hit: number[];
}

/** board を直接書き換える（fireCharges と同じ）。me は巨人の持ち主、range は着手マスの周囲 */
export const giantAura = (board: SquareInfo[], range: number[], me: Player, chars: PlayerCharacters): GiantAuraResult => {
    const locked: number[] = [];
    const hit: number[] = [];
    for (const j of range) {
        const sq = board[j];
        if (!sq.player) {
            if (!lockable(sq) || sq.effects.some((e) => e.effect === '🔑')) continue;
            board[j] = { ...sq, bind: Math.max(sq.bind, 1), effects: [...sq.effects, { effect: '🔑' }] };
            locked.push(j);
        } else if (sq.player !== me) {
            if (isGuarded(sq, chars)) continue; // ロック中・無敵の敵コマには当たらない
            const res = applyDamage(sq, 1, 'skill');
            board[j] = res.sq;
            if (res.dealt > 0 || res.blocked) hit.push(j);
        }
    }
    return { locked, hit };
};
