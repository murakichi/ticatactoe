// トークン系スキルで駒を置いた後の、ギアの盤面への効果（道連れの鍵のロック・伝播）。Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
import { PLAYER_SYMBOLS, Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { geometryForCells } from './boardGeometry';
import { PlayerCharacters, isGuarded, addCharge } from './charge';
import { GEAR_PARAMS, Gears, TokenEffect, gearLockStack, hasGear } from './gear';
import { addLock } from './lock';
import { poisonStrike } from './poison';
import { canBud, lockable } from './thermal';
import { isBuilding } from '../../types/ObjectKind';

/**
 * マス idx に🔑ロックを付ける。期間(ライフ)は堅牢の鍵で延びる。空きマスなら、空蔵の持ち主(turnSeat)を記録しておく。
 * 氷結中のマスには掛からない。掛けたら true。board を直接書き換える
 */
export const applyLockAt = (board: SquareInfo[], idx: number, gears: Gears, turnSeat: number): boolean => {
    const sq = board[idx];
    if (!lockable(sq)) return false;
    const owner = hasGear(gears, 'emptyLock') && !sq.player ? turnSeat + 1 : undefined;
    let locked = addLock(sq, gearLockStack(gears), owner); // ライフは変えず、ロックのスタックを足す (#438)
    // 芽吹きの錠: ライフが低くバッズの無い自陣のコマにロックを掛けると、そのコマにバッズ+1
    if (hasGear(gears, 'lockBloom') && sq.player === PLAYER_SYMBOLS[turnSeat] && sq.bind <= GEAR_PARAMS.lockBloomMaxLife && !sq.effects.some((e) => e.effect === '🌱')) {
        locked = { ...locked, effects: [...locked.effects, { effect: '🌱' }] };
    }
    board[idx] = locked;
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

/**
 * 芽吹き: ライフが budSeedLife 以上の自陣のコマを設置するとき🌱を付ける（通常の着手・トークン系スキルの両方）。
 * 付けたら新しいマスを返し、付けない（ギアなし・ライフが足りない・オブジェクト・氷結中や🔥のマスにはバッズが付かない）なら null
 */
export const seedBud = (sq: SquareInfo, player: Player, gears: Gears): SquareInfo | null =>
    hasGear(gears, 'budSeed') && sq.player === player && !isBuilding(sq) && sq.bind >= GEAR_PARAMS.budSeedLife && canBud(sq)
        ? { ...sq, effects: [...sq.effects, { effect: '🌱' as const }] }
        : null;

export interface TokenAfterOptions {
    /** 置いた側のシンボルと席 */
    player: Player;
    turnSeat: number;
    /** 置いた席のギア */
    gears: Gears;
    chars: PlayerCharacters;
    /** 置いた席の静電気の季節の残りターン数 */
    chargeBuff: number;
    rng: () => number;
}

export interface TokenAfterResult {
    /** 収穫に渡す「付与したエフェクト数」 */
    granted: number;
    /** 道連れの鍵が働いた */
    locked: boolean;
    /** 伝播が広がったマス（広がらなければ null） */
    spreadTo: number | null;
    /** 芽吹きでバッズが付いた */
    seeded: boolean;
}

/**
 * トークン系スキルでコマを置いた後の盤面処理を、順序ごと1か所にまとめたもの（Game.tsx と sim/engine.js が呼ぶ）。
 * 順序: 静電気の季節(⚡。収穫・伝播には数えない) → 芽吹き(🌱。収穫・伝播には数えない) → 道連れの鍵(確率でロック。乱数はここで1回) → 伝播(effect があるときだけ)。
 * board を直接書き換える。ログ・演出・統計は呼び出し側が結果を見てつける。effect はトークンが持つエフェクト(🌱/☠/⚡)、無ければ undefined
 */
export const afterTokenPlaced = (board: SquareInfo[], idx: number, effect: TokenEffect | undefined, o: TokenAfterOptions): TokenAfterResult => {
    let granted = effect ? 1 : 0;
    if (o.chargeBuff > 0 && board[idx].player === o.player) board[idx] = addCharge(board[idx], o.chars);
    const seed = seedBud(board[idx], o.player, o.gears);
    if (seed) board[idx] = seed;
    let locked = false;
    if (hasGear(o.gears, 'bindingLock') && o.rng() < GEAR_PARAMS.bindingLockChance) {
        applyLockAt(board, idx, o.gears, o.turnSeat);
        granted += 1;
        locked = true;
    }
    let spreadTo: number | null = null;
    if (effect && hasGear(o.gears, 'propagate')) {
        spreadTo = propagate(board, idx, effect, o.player, o.chars, o.rng);
        if (spreadTo !== null) granted += 1;
    }
    return { granted, locked, spreadTo, seeded: !!seed };
};
