// 墓地（死体）まわりの汎用スキル: 夜の帳 / 弔い割引 / 毒返しの構え の純粋ロジック。Game.tsx / AIPlayer.ts / sim/engine.js で共有する (#289)。
//
// 墓地は席ごとの necroCost（基礎コスト - 死体の数）で持つ。どの席も持つが、盤上でコマが消えるたびに自動で貯まるのはネクロマンサーの席だけ。
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { lostCells } from './gear';
import { emptyBlocked } from './thermal';

/** 夜の帳: 次の相手全員の手番の間、相手のスキルコストに足す量 */
export const NIGHT_VEIL_SURCHARGE = 3;
/** 弔い割引: 軽減する死体の数の上限 */
export const GRAVE_DISCOUNT_CAP = 3;
/** 毒返しの構え: 続く手番数（使った手番の次の自分の手番から数えて、この回数目の手番の終わりまで）と、置くコマのライフ */
export const POISON_WARD_TURNS = 3;
export const POISON_WARD_LIFE = 4;

/** 墓地の死体の数（基礎コスト - 現在の墓地コスト） */
export const corpseCount = (baseCost: number, necroCost: number): number => Math.max(0, baseCost - necroCost);
/** 弔い割引の軽減量 */
export const graveDiscountAmount = (corpses: number): number => Math.min(GRAVE_DISCOUNT_CAP, Math.max(0, corpses));

/** 毒返しの構えが発動する条件: 手番開始時の持ち主(before)に対し、player のコマが破壊された、または他の席に乗っ取られた */
export const wardTriggered = (before: readonly (Player | undefined)[], after: readonly (Player | undefined)[], player: Player): boolean =>
    lostCells(before, after, player, null).length > 0;

/** 毒返しの構えで置くコマ（ライフ4・☠付き） */
export const wardPiece = (player: Player): SquareInfo => ({ player, bind: POISON_WARD_LIFE, effects: [{ effect: '☠' }] });
/** 空きマスからランダムに1つ選んで置く。置いたマスを返す（空きが無ければ -1）。pick は候補から1つ選ぶ関数（乱数の持ち方が Game.tsx と sim で違うので渡す） */
export const placeWardPiece = (board: SquareInfo[], player: Player, pick: (cells: number[]) => number): number => {
    const empties = board.map((sq, i) => (!sq.player && !emptyBlocked(sq) ? i : -1)).filter((i) => i >= 0); // 氷結中の空きマスには置けない
    if (empties.length === 0) return -1;
    const at = pick(empties);
    board[at] = wardPiece(player);
    return at;
};

/** 墓守の供物: 消す自陣のコマ。ライフが最も低いコマ（同じなら番号の小さいマス）。自陣にコマが無ければ -1 */
export const graveOfferingTarget = (board: readonly SquareInfo[], player: Player): number => {
    let best = -1;
    board.forEach((sq, i) => {
        if (sq.player !== player) return;
        if (best < 0 || sq.bind < board[best].bind) best = i;
    });
    return best;
};
