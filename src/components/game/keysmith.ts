// 鍵師（#439）: ロックを操るキャラ。純粋関数は Game.tsx と sim/engine.js が共有する（gen-sim-shared.js で sim/shared/keysmith.js に生成される）。
//   - パッシブ: 空きマスのロックを無視して置ける / ライフ平均-1 / ロック系スキルのコスト-1（下限1）
//   - 固有スキル 封鎖の断（基礎コスト10・使用でターン終了）:
//       自陣のコマ全てにロック 7 スタック、空きマス全てにロック 2 スタック（鍵師自身は空きマスのロックを無視して置けるので、敵だけが止まる）。
//       敵陣のロック（敵のコマに乗っているもの）全てを解除し、解除した数だけ敵陣のコマにスキルダメージ（0でも最低1）。
//       コストは解除できる敵陣のロックの数だけ軽減（下限5）。
// 空きマスのロックを 2 スタックに留めるのが肝: 長くすると『敵だけ置けない7ターン勝ち確定ボタン』になる。
import { CharacterId } from '../../types/Character';
import { PLAYER_SYMBOLS, Player, seatOf } from '../../types/Player';
import { SquareInfo } from '../../types/SquareInfo';
import { isObject, isShikigami } from '../../util';
import { geometryForCells } from './boardGeometry';
import { PlayerCharacters, addCharge, isShielded } from './charge';
import { addLock, clearLock, isLocked, lockStack } from './lock';
import { addPoison } from './poison';
import { applyDamage, emptyBlocked, ignite, lockable } from './thermal';

export const SEAL_OWN_STACK = 7;
export const SEAL_EMPTY_STACK = 2;
/** 封鎖の断の基礎コストの下限（敵陣のロックの数だけ軽減したあと） */
export const SEAL_MIN_COST = 5;

/** 鍵師のパッシブ（手番の最初のロック系が無料）で、封鎖の断だけは無料にせず、この分だけ安くする（完全無料だと毎手番撃てて環境が崩れる: 対強豪95%・全体75%。-6で約43%、-7で約76%） */
export const SEAL_FIRST_CUT = 6;

/** ロック系スキル（鍵師はコスト-1）。Game.tsx の skillKey / sim/engine.js の costsOf のキー */
export const LOCK_SKILL_KEYS: ReadonlySet<string> = new Set([
    'onClickUseLock', 'onClickDoubleLock', 'onClickTripleLock', 'onClickSeal',
    'onClickLockRaid', 'onClickLockExtend', 'onClickLockBlessing', 'onClickVacantSeal', 'onClickLockConvert', 'onClickLockDiscount',
]);

/** 『ロックが使われた』とみなすスキル（錠前荒らしの0コスト条件: 直前の相手ターンにこれらが使われた）。ロックを掛ける・延ばす・ロックを残して壊すスキル */
export const LOCK_USED_KEYS: ReadonlySet<string> = new Set([
    'onClickUseLock', 'onClickDoubleLock', 'onClickTripleLock', 'onClickSeal', 'onClickLockExtend', 'onClickLockBlessing', 'onClickVacantSeal', 'onClickKimon',
]);

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

// ---- 汎用プールの鍵師向けスキル（#439。idx 130〜133。鍵師以外も使える） ----
/** 空き家封じ: 空きマス全てに掛けるロックのスタック（鍵師は空きマスのロックを無視して置けるので、長くすると『敵だけ置けない勝ち確定ボタン』になる） */
export const VACANT_SEAL_STACK = 2;
/** 空き家封じ: 相手のリーチ1つにつき下がるコスト（敵が勝つ直前ほど安く撃てる。基準 R7 の導線の最大-2を超える。日記 2026-11-06 に理由を書いた） */
export const VACANT_SEAL_REACH_CUT = 3;
/** ロックの増築: 自陣のコマのロックに足すスタック */
export const LOCK_EXTEND_STACK = 2;
/** 施錠の加護: 自分が設置したコマに付くロックのスタックと、効く手番数（使った手番を含む自分の手番 3 回） */
export const BLESSING_STACK = 2;
export const BLESSING_TURNS = 3;

/** player のリーチ数（同じ記号が3つ並び、残り1マスが敵味方なしの置ける空きマスの列）。式神・オブジェクトの入る列は数えない */
export const reachCount = (board: SquareInfo[], player: Player, chars: readonly (CharacterId | undefined)[]): number => {
    const mine = chars[seatOf(player)];
    let reaches = 0;
    for (const line of geometryForCells(board.length).winLines) {
        if (line.some((idx) => isShikigami(board[idx]) || isObject(board[idx]))) continue;
        let my = 0;
        let op = 0;
        let blocked = false;
        for (const idx of line) {
            const sq = board[idx];
            if (sq.player === player) my++;
            else if (sq.player) op++;
            else if (emptyBlocked(sq) || lockBlocksPlacement(sq, mine)) blocked = true;
        }
        if (my === 3 && op === 0 && !blocked) reaches++;
    }
    return reaches;
};

/** me 以外の全プレイヤーのリーチ数の合計（席の数は chars の長さ） */
export const opponentReaches = (board: SquareInfo[], me: Player, chars: readonly (CharacterId | undefined)[]): number =>
    chars.reduce((n, _, seat) => (PLAYER_SYMBOLS[seat] === me ? n : n + reachCount(board, PLAYER_SYMBOLS[seat], chars)), 0);

/** 空き家封じの基礎コスト: 相手のリーチ1つにつき VACANT_SEAL_REACH_CUT 下がる（下限1） */
export const vacantSealBaseCost = (base: number, reaches: number): number => Math.max(1, base - VACANT_SEAL_REACH_CUT * reaches);

/** 空き家封じの対象: 空きマス全て（オブジェクト・氷結中を除く） */
export const vacantSealCells = (board: SquareInfo[]): number[] =>
    board.map((sq, i) => (!sq.player && !isObject(sq) && lockable(sq) ? i : -1)).filter((i) => i !== -1);

/** 空き家封じ: 空きマス全てに VACANT_SEAL_STACK のロック。掛けたマスを返す。board を直接書き換える */
export const vacantSeal = (board: SquareInfo[]): number[] => {
    const cells = vacantSealCells(board);
    for (const k of cells) board[k] = addLock(board[k], VACANT_SEAL_STACK);
    return cells;
};

/** ロックの増築の対象: ロックの乗っている自陣のコマ（オブジェクトを除く） */
export const lockExtendCells = (board: SquareInfo[], me: Player): number[] =>
    board.map((sq, i) => (sq.player === me && !isObject(sq) && isLocked(sq) ? i : -1)).filter((i) => i !== -1);

/** ロックの増築: 自陣のロックのスタックを LOCK_EXTEND_STACK 足す。足したマスを返す。board を直接書き換える */
export const lockExtend = (board: SquareInfo[], me: Player): number[] => {
    const cells = lockExtendCells(board, me);
    for (const k of cells) board[k] = addLock(board[k], LOCK_EXTEND_STACK);
    return cells;
};

export type LockRaidResult = { cell: number; effect: '🔥' | '☠' | '⚡' };

/** 錠前荒らしの対象: ロックの乗っている敵のコマ（オブジェクトを除く） */
export const lockRaidCells = (board: SquareInfo[], me: Player): number[] =>
    board.map((sq, i) => (sq.player && sq.player !== me && !isObject(sq) && isLocked(sq) ? i : -1)).filter((i) => i !== -1);

/**
 * 錠前荒らし: 敵陣のロックを1つランダムに解除し、そのコマに🔥・☠・⚡のどれかをランダムに付与する（帯電中の雷霆の巫のコマには付かない）。
 * 対象が無ければ null。rng は 0以上1未満を返す。board を直接書き換える
 */
export const lockRaid = (board: SquareInfo[], me: Player, chars: PlayerCharacters, rng: () => number): LockRaidResult | null => {
    const cells = lockRaidCells(board, me);
    if (cells.length === 0) return null;
    const cell = cells[Math.floor(rng() * cells.length)];
    board[cell] = clearLock(board[cell]);
    const effect = (['🔥', '☠', '⚡'] as const)[Math.floor(rng() * 3)];
    if (effect === '🔥') ignite(board, [cell], Math.round(Math.sqrt(board.length)), 1, undefined, (sq) => isShielded(sq, chars));
    else if (effect === '☠') addPoison(board, [cell], chars, 1);
    else if (!isShielded(board[cell], chars)) board[cell] = addCharge(board[cell], chars);
    return { cell, effect };
};

/** 施錠の加護が効いている手番か: 使った手番から数えて BLESSING_TURNS 回目までの自分の手番。残り手番数（ward と同じ。使った手番は減らさない）で持つ */
export const blessingActive = (remaining: number): boolean => remaining > 0;

/** 施錠の加護: 設置したコマ（着手後のマス）に BLESSING_STACK のロックを足す */
export const blessPlacedPiece = (sq: SquareInfo): SquareInfo => addLock(sq, BLESSING_STACK);

/** 錠の転換（汎用 idx 134）の対象: ロックの乗っているマス全て（自分のコマ・敵のコマ・空きマス）。オブジェクトは除く */
export const lockConvertCells = (board: SquareInfo[]): number[] =>
    board.map((sq, i) => (!isObject(sq) && isLocked(sq) ? i : -1)).filter((i) => i !== -1);

/**
 * 錠の転換: cell のロックを解除し、解除したスタックの合計を返す（呼び出し側が自分の『ライフ値』に足す。「ライフ3」スキルと同じライフ）。
 * 対象でなければ 0 を返して何もしない。board を直接書き換える。ロックの持ち主は問わない（敵のロックを崩して自分のライフにもできる）
 */
export const lockConvert = (board: SquareInfo[], cell: number): number => {
    if (!lockConvertCells(board).includes(cell)) return 0;
    const gained = lockStack(board[cell]);
    board[cell] = clearLock(board[cell]);
    return gained;
};

/** 錠前割引（汎用 idx 135）の軽減量: 盤面にロックのかかっているマスの数（自分・敵・空きマスを問わず。オブジェクトは除く）。使った時点の数で固定する */
export const lockedSquareCount = (board: SquareInfo[]): number => board.filter((sq) => !isObject(sq) && isLocked(sq)).length;

