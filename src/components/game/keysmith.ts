// 鍵師（#439）: ロックを操るキャラ。純粋関数は Game.tsx と sim/engine.js が共有する（gen-sim-shared.js で sim/shared/keysmith.js に生成される）。
//   - パッシブ: 空きマスのロックを無視して置ける / ライフ平均-1 / ロック系スキルのコスト-1（下限1）
//   - 固有スキル 封鎖の断（基礎コスト10・使用でターン終了）:
//       自陣のコマ全てにロック 7 スタック、空きマス全てにロック 2 スタック（鍵師自身は空きマスのロックを無視して置けるので、敵だけが止まる）。
//       敵陣のロック（敵のコマに乗っているもの）全てを解除し、解除した数だけ敵陣のコマにスキルダメージ（0でも最低1）。
//       コストは解除できる敵陣のロックの数だけ軽減（下限5）。
// 空きマスのロックを 2 スタックに留めるのが肝: 長くすると『敵だけ置けない7ターン勝ち確定ボタン』になる。
import { CharacterId } from '../../types/Character';
import { Player } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { isObject } from '../../types/ObjectKind';
import { PlayerCharacters, isShielded } from './charge';
import { addLock, clearLock, isLocked } from './lock';
import { applyDamage, lockable } from './thermal';

export const SEAL_OWN_STACK = 7;
export const SEAL_EMPTY_STACK = 2;
/** 封鎖の断の基礎コストの下限（敵陣のロックの数だけ軽減したあと） */
export const SEAL_MIN_COST = 5;

/** ロック系スキル（鍵師はコスト-1）。Game.tsx の skillKey / sim/engine.js の costsOf のキー */
export const LOCK_SKILL_KEYS: ReadonlySet<string> = new Set(['onClickUseLock', 'onClickDoubleLock', 'onClickTripleLock', 'onClickSeal']);

/** 空きマスのロックを無視して置けるか（鍵師のパッシブ） */
export const ignoresEmptyLock = (character: CharacterId | undefined): boolean => character === 'keysmith';

/** sq への通常の着手を、🔑ロックが止めるか。鍵師は空きマス（オブジェクトを除く）のロックを無視できる */
export const lockBlocksPlacement = (sq: SquareInfo, character: CharacterId | undefined): boolean =>
    isLocked(sq) && !(ignoresEmptyLock(character) && !sq.player);

/** 解除できる敵陣のロック: 敵のコマ（オブジェクトを除く）に乗っている🔑のマス（昇順） */
export const sealReleaseCells = (board: SquareInfo[], me: Player): number[] =>
    board.map((sq, i) => (sq.player && sq.player !== me && !isObject(sq) && isLocked(sq) ? i : -1)).filter((i) => i !== -1);

/** 封鎖の断の基礎コスト: 解除できる敵陣のロックの数だけ軽減（下限 SEAL_MIN_COST。基礎コストがそれ未満なら変えない） */
export const sealBaseCost = (base: number, released: number): number => Math.min(base, Math.max(SEAL_MIN_COST, base - released));

export type SealResult = {
    /** 解除した敵陣のロックのマス */
    released: number[];
    /** ロックを掛けた自陣のマスと空きマス */
    own: number[];
    empty: number[];
    /** 敵に与えたダメージ（解除した数。0でも最低1） */
    damage: number;
    /** ダメージを与えようとした敵マス（氷結が肩代わりしたマスも含む） */
    hit: number[];
};

/** 封鎖の断。board を直接書き換える（sim/engine.js と共有） */
export const seal = (board: SquareInfo[], me: Player, chars: PlayerCharacters): SealResult => {
    const released = sealReleaseCells(board, me);
    for (const k of released) board[k] = clearLock(board[k]);
    const own: number[] = [];
    const empty: number[] = [];
    board.forEach((sq, i) => {
        if (!lockable(sq) || isObject(sq)) return;
        if (sq.player === me) {
            board[i] = addLock(sq, SEAL_OWN_STACK);
            own.push(i);
        } else if (!sq.player) {
            board[i] = addLock(sq, SEAL_EMPTY_STACK);
            empty.push(i);
        }
    });
    const damage = Math.max(1, released.length);
    const hit = board.map((sq, i) => (sq.player && sq.player !== me && !isObject(sq) && sq.bind > 0 && !isLocked(sq) && !isShielded(sq, chars) ? i : -1)).filter((i) => i !== -1);
    for (const k of hit) board[k] = applyDamage(board[k], damage, 'skill').sq;
    return { released, own, empty, damage, hit };
};
