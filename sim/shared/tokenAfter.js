// 自動生成: src/components/game/tokenAfter.ts (node scripts/gen-sim-shared.js)。手で編集しない。
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.afterTokenPlaced = exports.seedBud = exports.propagate = exports.propagateCandidates = exports.applyLockAt = void 0;
// トークン系スキルで駒を置いた後の、ギアの盤面への効果（道連れの鍵のロック・伝播）。Game.tsx と sim/engine.js が同じ関数を呼ぶ (#289)。
const Player_1 = require("./Player");
const boardGeometry_1 = require("./boardGeometry");
const charge_1 = require("./charge");
const gear_1 = require("./gear");
const lock_1 = require("./lock");
const poison_1 = require("./poison");
const thermal_1 = require("./thermal");
const ObjectKind_1 = require("./ObjectKind");
/**
 * マス idx に🔑ロックを付ける。期間(ライフ)は堅牢の鍵で延びる。空きマスなら、空蔵の持ち主(turnSeat)を記録しておく。
 * 氷結中のマスには掛からない。掛けたら true。board を直接書き換える
 */
const applyLockAt = (board, idx, gears, turnSeat) => {
    const sq = board[idx];
    if (!(0, thermal_1.lockable)(sq))
        return false;
    const owner = (0, gear_1.hasGear)(gears, 'emptyLock') && !sq.player ? turnSeat + 1 : undefined;
    let locked = (0, lock_1.addLock)(sq, (0, gear_1.gearLockStack)(gears), owner); // ライフは変えず、ロックのスタックを足す (#438)
    // 芽吹きの錠: ライフが低くバッズの無い自陣のコマにロックを掛けると、そのコマにバッズ+1
    if ((0, gear_1.hasGear)(gears, 'lockBloom') && sq.player === Player_1.PLAYER_SYMBOLS[turnSeat] && sq.bind <= gear_1.GEAR_PARAMS.lockBloomMaxLife && !sq.effects.some((e) => e.effect === '🌱')) {
        locked = { ...locked, effects: [...locked.effects, { effect: '🌱' }] };
    }
    board[idx] = locked;
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
/**
 * 芽吹き: ライフが budSeedLife 以上の自陣のコマを設置するとき🌱を付ける（通常の着手・トークン系スキルの両方）。
 * 付けたら新しいマスを返し、付けない（ギアなし・ライフが足りない・オブジェクト・氷結中や🔥のマスにはバッズが付かない）なら null
 */
const seedBud = (sq, player, gears) => (0, gear_1.hasGear)(gears, 'budSeed') && sq.player === player && !(0, ObjectKind_1.isBuilding)(sq) && sq.bind >= gear_1.GEAR_PARAMS.budSeedLife && (0, thermal_1.canBud)(sq)
    ? { ...sq, effects: [...sq.effects, { effect: '🌱' }] }
    : null;
exports.seedBud = seedBud;
/**
 * トークン系スキルでコマを置いた後の盤面処理を、順序ごと1か所にまとめたもの（Game.tsx と sim/engine.js が呼ぶ）。
 * 順序: 静電気の季節(⚡。収穫・伝播には数えない) → 芽吹き(🌱。収穫・伝播には数えない) → 道連れの鍵(確率でロック。乱数はここで1回) → 伝播(effect があるときだけ)。
 * board を直接書き換える。ログ・演出・統計は呼び出し側が結果を見てつける。effect はトークンが持つエフェクト(🌱/☠/⚡)、無ければ undefined
 */
const afterTokenPlaced = (board, idx, effect, o) => {
    let granted = effect ? 1 : 0;
    if (o.chargeBuff > 0 && board[idx].player === o.player)
        board[idx] = (0, charge_1.addCharge)(board[idx], o.chars);
    const seed = (0, exports.seedBud)(board[idx], o.player, o.gears);
    if (seed)
        board[idx] = seed;
    let locked = false;
    if ((0, gear_1.hasGear)(o.gears, 'bindingLock') && o.rng() < gear_1.GEAR_PARAMS.bindingLockChance) {
        (0, exports.applyLockAt)(board, idx, o.gears, o.turnSeat);
        granted += 1;
        locked = true;
    }
    let spreadTo = null;
    if (effect && (0, gear_1.hasGear)(o.gears, 'propagate')) {
        spreadTo = (0, exports.propagate)(board, idx, effect, o.player, o.chars, o.rng);
        if (spreadTo !== null)
            granted += 1;
    }
    return { granted, locked, spreadTo, seeded: !!seed };
};
exports.afterTokenPlaced = afterTokenPlaced;
