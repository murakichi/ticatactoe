// 自動生成: src/components/game/tokenAfter.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.propagate = exports.propagateCandidates = exports.applyLockAt = void 0;
const boardGeometry_1 = require("./boardGeometry");
const charge_1 = require("./charge");
const gear_1 = require("./gear");
const poison_1 = require("./poison");
const thermal_1 = require("./thermal");
/**
 * マス idx に🔑ロックを付ける。期間(ライフ)は堅牢の鍵で延びる。空きマスなら、空蔵の持ち主(turnSeat)を記録しておく。
 * 氷結中のマスには掛からない。掛けたら true。board を直接書き換える
 */
const applyLockAt = (board, idx, gears, turnSeat) => {
    const sq = board[idx];
    if (!(0, thermal_1.lockable)(sq))
        return false;
    const owner = (0, gear_1.hasGear)(gears, 'emptyLock') && !sq.player ? turnSeat + 1 : undefined;
    const lockBind = (0, gear_1.gearLockBind)(gears);
    board[idx] = { ...sq, effects: [...sq.effects, owner ? { effect: '🔑', value: owner } : { effect: '🔑' }], bind: sq.bind < lockBind ? lockBind : sq.bind };
    return true;
};
exports.applyLockAt = applyLockAt;
/** 伝播の候補: 置いたマス idx の周囲8マスのコマのうち、ロック・無敵でなく、エフェクトの種類に合うもの（バッズ=自陣 / 毒=敵 / ⚡=誰でも） */
const propagateCandidates = (board, idx, effect, player, chars) => (0, boardGeometry_1.geometryForCells)(board.length)
    .surroundRange(idx)
    .filter((j) => {
    const sq = board[j];
    if (!sq.player || (0, charge_1.isGuarded)(sq, chars))
        return false;
    if (effect === '🌱')
        return sq.player === player;
    if (effect === '☠')
        return sq.player !== player;
    return true;
});
exports.propagateCandidates = propagateCandidates;
/** 伝播: 候補から1つ選んで同じエフェクトを付ける（毒使いのコマはライフが増える）。広がったマスを返す（候補が無ければ null）。board を直接書き換える */
const propagate = (board, idx, effect, player, chars, rng = Math.random) => {
    const cands = (0, exports.propagateCandidates)(board, idx, effect, player, chars);
    if (cands.length === 0)
        return null;
    const j = cands[Math.floor(rng() * cands.length)];
    const spread = { ...board[j], effects: [...board[j].effects, { effect }] };
    board[j] = effect === '☠' ? (0, poison_1.poisonStrike)(spread, chars) : spread;
    return j;
};
exports.propagate = propagate;
