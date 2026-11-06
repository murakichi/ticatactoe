// 自動生成: src/components/game/keysmith.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seal = exports.sealBaseCost = exports.sealReleaseCells = exports.lockBlocksPlacement = exports.ignoresEmptyLock = exports.LOCK_SKILL_KEYS = exports.SEAL_MIN_COST = exports.SEAL_EMPTY_STACK = exports.SEAL_OWN_STACK = void 0;
const ObjectKind_1 = require("./ObjectKind");
const charge_1 = require("./charge");
const lock_1 = require("./lock");
const thermal_1 = require("./thermal");
exports.SEAL_OWN_STACK = 7;
exports.SEAL_EMPTY_STACK = 2;
/** 封鎖の断の基礎コストの下限（敵陣のロックの数だけ軽減したあと） */
exports.SEAL_MIN_COST = 5;
/** ロック系スキル（鍵師はコスト-1）。Game.tsx の skillKey / sim/engine.js の costsOf のキー */
exports.LOCK_SKILL_KEYS = new Set(['onClickUseLock', 'onClickDoubleLock', 'onClickTripleLock', 'onClickSeal']);
/** 空きマスのロックを無視して置けるか（鍵師のパッシブ） */
const ignoresEmptyLock = (character) => character === 'keysmith';
exports.ignoresEmptyLock = ignoresEmptyLock;
/** sq への通常の着手を、🔑ロックが止めるか。鍵師は空きマス（オブジェクトを除く）のロックを無視できる */
const lockBlocksPlacement = (sq, character) => (0, lock_1.isLocked)(sq) && !((0, exports.ignoresEmptyLock)(character) && !sq.player);
exports.lockBlocksPlacement = lockBlocksPlacement;
/** 解除できる敵陣のロック: 敵のコマ（オブジェクトを除く）に乗っている🔑のマス（昇順） */
const sealReleaseCells = (board, me) => board.map((sq, i) => (sq.player && sq.player !== me && !(0, ObjectKind_1.isObject)(sq) && (0, lock_1.isLocked)(sq) ? i : -1)).filter((i) => i !== -1);
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
        if (!(0, thermal_1.lockable)(sq) || (0, ObjectKind_1.isObject)(sq))
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
    const hit = board.map((sq, i) => (sq.player && sq.player !== me && !(0, ObjectKind_1.isObject)(sq) && sq.bind > 0 && !(0, lock_1.isLocked)(sq) && !(0, charge_1.isShielded)(sq, chars) ? i : -1)).filter((i) => i !== -1);
    for (const k of hit)
        board[k] = (0, thermal_1.applyDamage)(board[k], damage, 'skill').sq;
    return { released, own, empty, damage, hit };
};
exports.seal = seal;
