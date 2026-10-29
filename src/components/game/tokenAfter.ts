// トークン系スキルで駒を置いた後の、ギアの盤面への効果（道連れの鍵のロック・伝播）。Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { PlayerCharacters, isGuarded } from './charge';
import { Gears, TokenEffect, gearLockBind, hasGear } from './gear';
import { poisonStrike } from './poison';
import { lockable } from './thermal';

/**
 * マス idx に🔑ロックを付ける。期間(ライフ)は堅牢の鍵で延びる。空きマスなら、空蔵の持ち主(turnSeat)を記録しておく。
 * 氷結中のマスには掛からない。掛けたら true。board を直接書き換える
 */
export const applyLockAt = (board: SquareInfo[], idx: number, gears: Gears, turnSeat: number): boolean => {
    const sq = board[idx];
    if (!lockable(sq)) return false;
    const owner = hasGear(gears, 'emptyLock') && !sq.player ? turnSeat + 1 : undefined;
    const lockBind = gearLockBind(gears);
    board[idx] = { ...sq, effects: [...sq.effects, owner ? { effect: '🔑' as const, value: owner } : { effect: '🔑' as const }], bind: sq.bind < lockBind ? lockBind : sq.bind };
    return true;
};

/** 伝播の候補: 置いたマス idx の周囲8マスのコマのうち、ロック・無敵でなく、エフェクトの種類に合うもの（バッズ=自陣 / 毒=敵 / ⚡=誰でも） */
export const propagateCandidates = (board: SquareInfo[], idx: number, effect: TokenEffect, player: Player, chars: PlayerCharacters): number[] =>
    geometryForCells(board.length)
        .surroundRange(idx)
        .filter((j) => {
            const sq = board[j];
            if (!sq.player || isGuarded(sq, chars)) return false;
            if (effect === '🌱') return sq.player === player;
            if (effect === '☠') return sq.player !== player;
            return true;
        });

/** 伝播: 候補から1つ選んで同じエフェクトを付ける（毒使いのコマはライフが増える）。広がったマスを返す（候補が無ければ null）。board を直接書き換える */
export const propagate = (board: SquareInfo[], idx: number, effect: TokenEffect, player: Player, chars: PlayerCharacters, rng: () => number = Math.random): number | null => {
    const cands = propagateCandidates(board, idx, effect, player, chars);
    if (cands.length === 0) return null;
    const j = cands[Math.floor(rng() * cands.length)];
    const spread = { ...board[j], effects: [...board[j].effects, { effect }] };
    board[j] = effect === '☠' ? poisonStrike(spread, chars) : spread;
    return j;
};
