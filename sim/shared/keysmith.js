// 自動生成: src/components/game/keysmith.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blessPlacedPiece = exports.blessingActive = exports.lockRaid = exports.lockRaidCells = exports.lockExtend = exports.lockExtendCells = exports.vacantSeal = exports.vacantSealCells = exports.vacantSealBaseCost = exports.opponentReaches = exports.reachCount = exports.BLESSING_TURNS = exports.BLESSING_STACK = exports.LOCK_EXTEND_STACK = exports.VACANT_SEAL_REACH_CUT = exports.VACANT_SEAL_STACK = exports.seal = exports.sealBaseCost = exports.sealReleaseCells = exports.lockBlocksPlacement = exports.ignoresEmptyLock = exports.LOCK_USED_KEYS = exports.LOCK_SKILL_KEYS = exports.SEAL_MIN_COST = exports.SEAL_EMPTY_STACK = exports.SEAL_OWN_STACK = void 0;
const Player_1 = require("./Player");
const util_1 = require("./util");
const boardGeometry_1 = require("./boardGeometry");
const charge_1 = require("./charge");
const lock_1 = require("./lock");
const poison_1 = require("./poison");
const thermal_1 = require("./thermal");
exports.SEAL_OWN_STACK = 7;
exports.SEAL_EMPTY_STACK = 2;
/** 封鎖の断の基礎コストの下限（敵陣のロックの数だけ軽減したあと） */
exports.SEAL_MIN_COST = 5;
/** ロック系スキル（鍵師はコスト-1）。Game.tsx の skillKey / sim/engine.js の costsOf のキー */
exports.LOCK_SKILL_KEYS = new Set([
    'onClickUseLock', 'onClickDoubleLock', 'onClickTripleLock', 'onClickSeal',
    'onClickLockRaid', 'onClickLockExtend', 'onClickLockBlessing', 'onClickVacantSeal',
]);
/** 『ロックが使われた』とみなすスキル（錠前荒らしの0コスト条件: 直前の相手ターンにこれらが使われた）。ロックを掛ける・延ばす・ロックを残して壊すスキル */
exports.LOCK_USED_KEYS = new Set([
    'onClickUseLock', 'onClickDoubleLock', 'onClickTripleLock', 'onClickSeal', 'onClickLockExtend', 'onClickLockBlessing', 'onClickVacantSeal', 'onClickKimon',
]);
/** 空きマスのロックを無視して置けるか（鍵師のパッシブ） */
const ignoresEmptyLock = (character) => character === 'keysmith';
exports.ignoresEmptyLock = ignoresEmptyLock;
/** sq への通常の着手を、🔑ロックが止めるか。鍵師は空きマス（オブジェクトを除く）のロックを無視できる */
const lockBlocksPlacement = (sq, character) => (0, lock_1.isLocked)(sq) && !((0, exports.ignoresEmptyLock)(character) && !sq.player);
exports.lockBlocksPlacement = lockBlocksPlacement;
/** 解除できる敵陣のロック: 敵のコマ（オブジェクトを除く）に乗っている🔑のマス（昇順） */
const sealReleaseCells = (board, me) => board.map((sq, i) => (sq.player && sq.player !== me && !(0, util_1.isObject)(sq) && (0, lock_1.isLocked)(sq) ? i : -1)).filter((i) => i !== -1);
exports.sealReleaseCells = sealReleaseCells;
/** 封鎖の断の基礎コスト: 解除できる敵陣のロックの数だけ軽減（下限 SEAL_MIN_COST。基礎コストがそれ未満なら変えない） */
const sealBaseCost = (base, released) => Math.min(base, Math.max(exports.SEAL_MIN_COST, base - released));
exports.sealBaseCost = sealBaseCost;
/** 封鎖の断。board を直接書き換える（sim/engine.js と共有） */
const seal = (board, me, chars) => {
    const released = (0, exports.sealReleaseCells)(board, me);
    for (const k of released)
        board[k] = (0, lock_1.clearLock)(board[k]);
    const own = [];
    const empty = [];
    board.forEach((sq, i) => {
        if (!(0, thermal_1.lockable)(sq) || (0, util_1.isObject)(sq))
            return;
        if (sq.player === me) {
            board[i] = (0, lock_1.addLock)(sq, exports.SEAL_OWN_STACK);
            own.push(i);
        }
        else if (!sq.player) {
            board[i] = (0, lock_1.addLock)(sq, exports.SEAL_EMPTY_STACK);
            empty.push(i);
        }
    });
    const damage = Math.max(1, released.length);
    const hit = board.map((sq, i) => (sq.player && sq.player !== me && !(0, util_1.isObject)(sq) && sq.bind > 0 && !(0, lock_1.isLocked)(sq) && !(0, charge_1.isShielded)(sq, chars) ? i : -1)).filter((i) => i !== -1);
    for (const k of hit)
        board[k] = (0, thermal_1.applyDamage)(board[k], damage, 'skill').sq;
    return { released, own, empty, damage, hit };
};
exports.seal = seal;
// ---- 汎用プールの鍵師向けスキル（#439。idx 130〜133。鍵師以外も使える） ----
/** 空き家封じ: 空きマス全てに掛けるロックのスタック（鍵師は空きマスのロックを無視して置けるので、長くすると『敵だけ置けない勝ち確定ボタン』になる） */
exports.VACANT_SEAL_STACK = 2;
/** 空き家封じ: 相手のリーチ1つにつき下がるコスト（敵が勝つ直前ほど安く撃てる。基準 R7 の導線の最大-2を超える。日記 2026-11-06 に理由を書いた） */
exports.VACANT_SEAL_REACH_CUT = 3;
/** ロックの増築: 自陣のコマのロックに足すスタック */
exports.LOCK_EXTEND_STACK = 2;
/** 施錠の加護: 自分が設置したコマに付くロックのスタックと、効く手番数（使った手番を含む自分の手番 3 回） */
exports.BLESSING_STACK = 2;
exports.BLESSING_TURNS = 3;
/** player のリーチ数（同じ記号が3つ並び、残り1マスが敵味方なしの置ける空きマスの列）。式神・オブジェクトの入る列は数えない */
const reachCount = (board, player, chars) => {
    const mine = chars[(0, Player_1.seatOf)(player)];
    let reaches = 0;
    for (const line of (0, boardGeometry_1.geometryForCells)(board.length).winLines) {
        if (line.some((idx) => (0, util_1.isShikigami)(board[idx]) || (0, util_1.isObject)(board[idx])))
            continue;
        let my = 0;
        let op = 0;
        let blocked = false;
        for (const idx of line) {
            const sq = board[idx];
            if (sq.player === player)
                my++;
            else if (sq.player)
                op++;
            else if ((0, thermal_1.emptyBlocked)(sq) || (0, exports.lockBlocksPlacement)(sq, mine))
                blocked = true;
        }
        if (my === 3 && op === 0 && !blocked)
            reaches++;
    }
    return reaches;
};
exports.reachCount = reachCount;
/** me 以外の全プレイヤーのリーチ数の合計（席の数は chars の長さ） */
const opponentReaches = (board, me, chars) => chars.reduce((n, _, seat) => (Player_1.PLAYER_SYMBOLS[seat] === me ? n : n + (0, exports.reachCount)(board, Player_1.PLAYER_SYMBOLS[seat], chars)), 0);
exports.opponentReaches = opponentReaches;
/** 空き家封じの基礎コスト: 相手のリーチ1つにつき VACANT_SEAL_REACH_CUT 下がる（下限1） */
const vacantSealBaseCost = (base, reaches) => Math.max(1, base - exports.VACANT_SEAL_REACH_CUT * reaches);
exports.vacantSealBaseCost = vacantSealBaseCost;
/** 空き家封じの対象: 空きマス全て（オブジェクト・氷結中を除く） */
const vacantSealCells = (board) => board.map((sq, i) => (!sq.player && !(0, util_1.isObject)(sq) && (0, thermal_1.lockable)(sq) ? i : -1)).filter((i) => i !== -1);
exports.vacantSealCells = vacantSealCells;
/** 空き家封じ: 空きマス全てに VACANT_SEAL_STACK のロック。掛けたマスを返す。board を直接書き換える */
const vacantSeal = (board) => {
    const cells = (0, exports.vacantSealCells)(board);
    for (const k of cells)
        board[k] = (0, lock_1.addLock)(board[k], exports.VACANT_SEAL_STACK);
    return cells;
};
exports.vacantSeal = vacantSeal;
/** ロックの増築の対象: ロックの乗っている自陣のコマ（オブジェクトを除く） */
const lockExtendCells = (board, me) => board.map((sq, i) => (sq.player === me && !(0, util_1.isObject)(sq) && (0, lock_1.isLocked)(sq) ? i : -1)).filter((i) => i !== -1);
exports.lockExtendCells = lockExtendCells;
/** ロックの増築: 自陣のロックのスタックを LOCK_EXTEND_STACK 足す。足したマスを返す。board を直接書き換える */
const lockExtend = (board, me) => {
    const cells = (0, exports.lockExtendCells)(board, me);
    for (const k of cells)
        board[k] = (0, lock_1.addLock)(board[k], exports.LOCK_EXTEND_STACK);
    return cells;
};
exports.lockExtend = lockExtend;
/** 錠前荒らしの対象: ロックの乗っている敵のコマ（オブジェクトを除く） */
const lockRaidCells = (board, me) => board.map((sq, i) => (sq.player && sq.player !== me && !(0, util_1.isObject)(sq) && (0, lock_1.isLocked)(sq) ? i : -1)).filter((i) => i !== -1);
exports.lockRaidCells = lockRaidCells;
/**
 * 錠前荒らし: 敵陣のロックを1つランダムに解除し、そのコマに🔥・☠・⚡のどれかをランダムに付与する（帯電中の雷霆の巫のコマには付かない）。
 * 対象が無ければ null。rng は 0以上1未満を返す。board を直接書き換える
 */
const lockRaid = (board, me, chars, rng) => {
    const cells = (0, exports.lockRaidCells)(board, me);
    if (cells.length === 0)
        return null;
    const cell = cells[Math.floor(rng() * cells.length)];
    board[cell] = (0, lock_1.clearLock)(board[cell]);
    const effect = ['🔥', '☠', '⚡'][Math.floor(rng() * 3)];
    if (effect === '🔥')
        (0, thermal_1.ignite)(board, [cell], Math.round(Math.sqrt(board.length)), 1, undefined, (sq) => (0, charge_1.isShielded)(sq, chars));
    else if (effect === '☠')
        (0, poison_1.addPoison)(board, [cell], chars, 1);
    else if (!(0, charge_1.isShielded)(board[cell], chars))
        board[cell] = (0, charge_1.addCharge)(board[cell], chars);
    return { cell, effect };
};
exports.lockRaid = lockRaid;
/** 施錠の加護が効いている手番か: 使った手番から数えて BLESSING_TURNS 回目までの自分の手番。残り手番数（ward と同じ。使った手番は減らさない）で持つ */
const blessingActive = (remaining) => remaining > 0;
exports.blessingActive = blessingActive;
/** 施錠の加護: 設置したコマ（着手後のマス）に BLESSING_STACK のロックを足す */
const blessPlacedPiece = (sq) => (0, lock_1.addLock)(sq, exports.BLESSING_STACK);
exports.blessPlacedPiece = blessPlacedPiece;
