// パーフェクトゲーム・超助っ人・柳の下に二匹目がいた の純粋ロジック。Game.tsx と sim/engine.js（sim/shared に生成）が同じ関数を呼ぶ (#289)。
import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { isGuarded, landCharge } from './charge';
import { poisonStrike } from './poison';
import { absorbDestroy, placeFlameToken, placeFrostToken, placeLeafToken } from './thermal';

/** 柳の下に二匹目がいた: 手番内にベースコストがこの値以上のスキルを使っていれば0コスト */
export const BIG_CAST_BASE = 7;

/** 柳の下に二匹目がいた: 自分のデッキから発動するスキルのベースコストの上限 */
export const SECOND_CATCH_MAX_BASE = 5;

/** 超助っ人のトークンに付くエフェクト（1つ、ランダム） */
export const HELPER_EFFECTS = ['🔥', '❄', '⚡', '☠', '🌱', '🍂'] as const;
export type HelperEffect = (typeof HELPER_EFFECTS)[number];

/** ランダムなエフェクトを選ぶ（乱数は1回） */
export const pickHelperEffect = (rng: () => number): HelperEffect => HELPER_EFFECTS[Math.floor(rng() * HELPER_EFFECTS.length)];

/**
 * 超助っ人: idx に、effect を1つ付けた player のトークン（ライフ bind）を置く。board を直接書き換える。
 * 🔥は付いた瞬間の1ダメージと縦横隣の氷結の解除（placeFlameToken）、⚡は乗った時点のダメージ（雷霆の巫以外）、☠は毒使いのライフ1.5倍が掛かる。
 * 解けた氷結のマスを返す
 */
export const placeHelperToken = (
    board: SquareInfo[],
    idx: number,
    player: Player,
    bind: number,
    effect: HelperEffect,
    chars: readonly CharacterId[],
    size: number
): { thawed: number[] } => {
    switch (effect) {
        case '🔥':
            return { thawed: placeFlameToken(board, idx, player, bind, size) };
        case '❄':
            placeFrostToken(board, idx, player, bind);
            return { thawed: [] };
        case '🍂':
            placeLeafToken(board, idx, player, bind, 1);
            return { thawed: [] };
        case '⚡':
            board[idx] = landCharge({ player, bind, effects: [{ effect: '⚡' }] }, chars);
            return { thawed: [] };
        case '☠':
            board[idx] = poisonStrike({ player, bind, effects: [{ effect: '☠' }] }, chars);
            return { thawed: [] };
        default:
            board[idx] = { player, bind, effects: [{ effect: '🌱' }] };
            return { thawed: [] };
    }
};

/**
 * パーフェクトゲーム: 盤面のコマを敵味方とも全て破壊する（board を直接書き換える）。
 * 🔑ロック中・雷霆の巫の⚡で無敵のコマは壊れず、氷結中のコマは❄が1つ減るだけ（absorbDestroy）。壊したマスと、氷結が身代わりになったマスを返す
 */
export const perfectGame = (board: SquareInfo[], chars: readonly CharacterId[]): { destroyed: number[]; blocked: number[] } => {
    const destroyed: number[] = [];
    const blocked: number[] = [];
    board.forEach((sq, k) => {
        if (!sq.player || isGuarded(sq, chars)) return;
        const guard = absorbDestroy(sq);
        if (guard.blocked) {
            board[k] = guard.sq;
            blocked.push(k);
            return;
        }
        board[k] = { player: undefined, bind: 0, effects: [] };
        destroyed.push(k);
    });
    return { destroyed, blocked };
};
