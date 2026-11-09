// トークン系スキル（空きマスにランダムでコマを置く）の置き方を1か所にまとめたもの。Game.tsx と sim/engine.js が同じ関数を呼ぶ。
// 流れ: 空きマスの抽選(pickEmptyCells) → コマを組み立てて置く(putToken) → 置いたあとのギア処理(afterTokenPlaced)を順に通す(placeTokens)。
// ログ・演出・統計・収穫は結果(placed / granted)を見て呼び出し側がつける。乱数は pick / after.rng で呼び出し側が渡す。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { findEmptyIndexes } from '../../util';
import { HelperEffect, placeHelperToken } from './bigSkills';
import { PlayerCharacters, landCharge } from './charge';
import { TokenEffect } from './gear';
import { poisonStrike } from './poison';
import { SHIKIGAMI_LIFE, newShikigami } from './shikigami';
import { TokenAfterOptions, TokenAfterResult, afterTokenPlaced } from './tokenAfter';
import { placeFlameToken, placeFrostToken, placeLeafToken } from './thermal';

/** トークンの種類。『通常のコマ』『🌱付き』『☠付き』『⚡付き』『🔥付き』『❄付き』『🍂付き』『式神』『超助っ人(ランダムなエフェクト)』 */
export type TokenKind = 'plain' | 'buds' | 'poison' | 'charge' | 'flame' | 'frost' | 'leaf' | 'shikigami' | 'helper';

export interface PutContext {
    player: Player;
    /** 置くコマのライフ（式神は shikigamiBind を使う） */
    bind: number;
    chars: PlayerCharacters;
    size: number;
    /** 🍂トークンの🍂の枚数 */
    leaves?: number;
    /** 超助っ人が付けるエフェクト */
    helperEffect?: HelperEffect;
    /** 式神ランダム設置のライフ（トークン系ギアの補正込み） */
    shikigamiBind?: number;
}

export interface PutResult {
    /** 収穫・伝播に数える『トークンのエフェクト』(🌱/☠/⚡のみ。🔥❄🍂・式神・通常は持たない扱い) */
    effect?: TokenEffect;
    /** 氷結トークンで作られた❄の数（絶対零度のカウンタ用） */
    frost: number;
    /** 🔥が付いて解けた氷結のマス */
    thawed: number[];
}

/** 空きマスから n 個選ぶ（空きが足りなければあるだけ。空きが無ければ []）。pick が乱数を持つ */
export const pickEmptyCells = (board: SquareInfo[], n: number, pick: (cells: number[], n: number) => number[]): number[] => {
    const empties = findEmptyIndexes(board);
    return empties.length === 0 || n <= 0 ? [] : pick(empties, Math.min(n, empties.length));
};

/** idx に kind のコマを置く。board を直接書き換える */
export const putToken = (kind: TokenKind, board: SquareInfo[], idx: number, c: PutContext): PutResult => {
    const none: PutResult = { frost: 0, thawed: [] };
    switch (kind) {
        case 'plain':
            board[idx] = { player: c.player, bind: c.bind, effects: [] };
            return none;
        case 'buds':
            board[idx] = { player: c.player, bind: c.bind, effects: [{ effect: '🌱' }] };
            return { ...none, effect: '🌱' };
        case 'poison':
            board[idx] = poisonStrike({ player: c.player, bind: c.bind, effects: [{ effect: '☠' }] }, c.chars);
            return { ...none, effect: '☠' };
        case 'charge':
            board[idx] = landCharge({ player: c.player, bind: c.bind, effects: [{ effect: '⚡' }] }, c.chars);
            return { ...none, effect: '⚡' };
        case 'flame':
            return { ...none, thawed: placeFlameToken(board, idx, c.player, c.bind, c.size) };
        case 'frost':
            return { ...none, frost: placeFrostToken(board, idx, c.player, c.bind) };
        case 'leaf':
            placeLeafToken(board, idx, c.player, c.bind, c.leaves ?? 1);
            return none;
        case 'shikigami':
            board[idx] = newShikigami(c.player, c.shikigamiBind ?? SHIKIGAMI_LIFE);
            return none;
        case 'helper': {
            const effect = c.helperEffect ?? '🌱';
            const { thawed } = placeHelperToken(board, idx, c.player, c.bind, effect, c.chars, c.size);
            return { ...none, thawed, effect: effect === '🌱' || effect === '☠' || effect === '⚡' ? effect : undefined };
        }
    }
};

export interface PlacedToken extends PutResult {
    idx: number;
    /** 置いたあとのギア処理の結果（両トークンで他の席のコマは null） */
    after: TokenAfterResult | null;
}

/**
 * cells の各マスに kind のコマを順に置き、置くたびに afterTokenPlaced を通す。board を直接書き換える。
 * granted は収穫に渡す『付与したエフェクト数』の合計
 */
export const placeTokens = (
    board: SquareInfo[],
    kind: TokenKind,
    cells: number[],
    c: PutContext,
    after: TokenAfterOptions,
    /** 置いた直後、afterTokenPlaced の前に盤面へ足す処理（山焼きのロックなど） */
    afterPut?: (board: SquareInfo[], idx: number) => void
): { placed: PlacedToken[]; granted: number } => {
    let granted = 0;
    const placed = cells.map((idx): PlacedToken => {
        const put = putToken(kind, board, idx, c);
        afterPut?.(board, idx);
        const result = afterTokenPlaced(board, idx, put.effect, after);
        granted += result.granted;
        return { idx, ...put, after: result };
    });
    return { placed, granted };
};

/**
 * 両トークン: 参加者全員に1つずつ（席順に cells へ）。自分の席のコマはトークン扱い(bind・afterTokenPlaced)、他の席は固定ライフ。
 * 戻りは placeTokens と同じ形（他の席の after は null）
 */
export const placeBothTokens = (
    board: SquareInfo[],
    cells: number[],
    symbols: readonly Player[],
    turnSeat: number,
    ownBind: number,
    otherBind: number,
    after: TokenAfterOptions
): { placed: PlacedToken[]; granted: number } => {
    let granted = 0;
    const placed = cells.map((idx, seat): PlacedToken => {
        board[idx] = { player: symbols[seat], bind: seat === turnSeat ? ownBind : otherBind, effects: [] };
        const result = seat === turnSeat ? afterTokenPlaced(board, idx, undefined, after) : null;
        if (result) granted += result.granted;
        return { idx, frost: 0, thawed: [], after: result };
    });
    return { placed, granted };
};
