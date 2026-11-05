// 増殖（ループ召喚）の1ループ分。奇数回=ライフ PROLIFERATE.tokenLife のコマ、偶数回=アイテム（毒使いだけは敵コマへの毒）。
// Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
import { CharacterId } from '../../types/Character';
import { Effect } from '../../types/Effect';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { findEmptyIndexes } from '../../util';
import { poisonStrike } from './poison';
import { PROLIFERATE } from './turn';

export type ProliferateStep = {
    cell: number;
    /** 置いたコマなら 'piece'、アイテムなら付けたエフェクト（毒使いは☠、他は🌱） */
    added: 'piece' | Effect['effect'];
};

/** 1ループ分を board に適用する（追加できなければ null。回数を進めない）。毒を付けたマスの毒花は呼び出し側が処理する。board を直接書き換える */
export const proliferateStep = (
    board: SquareInfo[],
    step: number,
    player: Player,
    character: CharacterId,
    chars: readonly (CharacterId | undefined)[],
    rng: () => number = Math.random,
    tokenLife: number = PROLIFERATE.tokenLife
): ProliferateStep | null => {
    const pick = (cells: number[]): number => cells[Math.floor(rng() * cells.length)];
    if (step % 2 === 1) {
        const empties = findEmptyIndexes(board);
        if (empties.length === 0) return null;
        const cell = pick(empties);
        board[cell] = { player, bind: tokenLife, effects: [] };
        return { cell, added: 'piece' };
    }
    // 毒使いだけは敵コマへの毒がアイテムになる（毒拡散パッシブとつながる）
    const isPoisoner = character === 'poisoner';
    const targets = board
        .map((_, idx) => idx)
        .filter((idx) => {
            const sq = board[idx];
            if (sq.effects.some((e) => e.effect === '🔑')) return false;
            return isPoisoner ? !!sq.player && sq.player !== player : sq.player === player;
        });
    if (targets.length === 0) return null;
    const cell = pick(targets);
    const item: Effect = isPoisoner ? { effect: '☠' } : { effect: '🌱' };
    board[cell] = { ...board[cell], effects: [...board[cell].effects, item] };
    if (isPoisoner) board[cell] = poisonStrike(board[cell], chars);
    return { cell, added: item.effect };
};
