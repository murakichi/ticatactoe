// @ts-check
'use strict';
/*
 * ギア（キャラ選択時に装備する追加パッシブ）の定義と純粋関数。
 * src/components/game/gear.ts の複製（ヘッドレス版は TS を import できないため）。
 * 値がズレないよう src/components/game/gear.test.ts が一致を確認する。
 */

const GEAR_PARAMS = {
    lockBind: 6,
    ironLockBind: 9,
    emptyLockLife: 1,
    bindingLockChance: 0.7,
    quadCount: 4,
    afterglowDelta: -1,
    luckyPurseChance: 0.2,
    sturdyLife: 1,
    titanLife: 3,
    titanCost: 3,
    reinforceTokenLife: 1,
    lightTokenLife: -1,
    lightTokenCost: -1,
    harvestCap: 5,
    priceRange: 4,
    priceFloor: 2,
    gamblerStd: 5,
    vengeanceGain: 2,
    vengeancePenalty: 1,
    vengeanceCap: 4,
};
const P = GEAR_PARAMS;

const GEAR_IDS = [
    'emptyLock', 'ironLock', 'bindingLock', 'quadMastery', 'afterglow', 'luckyPurse', 'sturdy', 'titanCost', 'reinforce',
    'harvest', 'toxicBloom', 'priceWreck', 'chainDiscount', 'propagate', 'lightToken', 'gambler', 'vengeance',
];

/** 装備できる枠数。固有スキルの無い「あなた」だけ3枠 */
const gearSlotsFor = (character) => (character === 'you' ? 3 : 2);

const hasGear = (gears, id) => !!gears && gears.includes(id);

const gearLifeBonus = (gears) => (hasGear(gears, 'sturdy') ? P.sturdyLife : 0) + (hasGear(gears, 'titanCost') ? P.titanLife : 0);
const gearLifeStd = (gears, base) => (hasGear(gears, 'gambler') ? P.gamblerStd : base);
const gearLockBind = (gears) => (hasGear(gears, 'ironLock') ? P.ironLockBind : P.lockBind);
const gearTokenBindDelta = (gears) => (hasGear(gears, 'reinforce') ? P.reinforceTokenLife : 0) + (hasGear(gears, 'lightToken') ? P.lightTokenLife : 0);

/** キャラ補正済みのコストにギアのコスト補正を掛ける。下げる補正は下限1（もともと0なら0のまま）。四連の極意の無料だけ0 */
function adjustCostByGear(cost, gears, ctx, isToken = false) {
    if (!gears || gears.length === 0) return cost;
    if (hasGear(gears, 'quadMastery') && ctx.skillsThisTurn === P.quadCount) return 0;
    let delta = 0;
    if (hasGear(gears, 'titanCost')) delta += P.titanCost;
    if (hasGear(gears, 'afterglow') && ctx.echoReady && ctx.skillsThisTurn === 0) delta += P.afterglowDelta;
    if (hasGear(gears, 'chainDiscount')) delta -= ctx.skillsThisTurn;
    if (hasGear(gears, 'lightToken') && isToken) delta += P.lightTokenCost;
    const next = cost + delta;
    return delta < 0 ? Math.min(cost, Math.max(1, next)) : next;
}

/** 価格破壊の対象外にするスキル（skillCosts のキー） */
const NOT_PRICEABLE = ['onClickShuffle', 'onClickCharge', 'onClickDepressionCherry'];

/** 価格破壊: スキルごとの加算値を抽選する */
function rollPriceOffsets(skillCosts, rng) {
    const out = {};
    for (const k of Object.keys(skillCosts)) {
        if (NOT_PRICEABLE.includes(k)) continue;
        out[k] = Math.floor(rng() * (2 * P.priceRange + 1)) - P.priceRange;
    }
    return out;
}

/** 基礎コストに加算値を足す。下げる方向は下限 priceFloor まで（元のコストが下限未満ならそのまま） */
function priceShift(base, offset) {
    const next = base + offset;
    return offset > 0 ? next : Math.min(base, Math.max(P.priceFloor, next));
}

/** 基礎コスト表に加算値を適用する。offsets が無ければ元の表をそのまま返す */
function applyPriceOffsets(base, offsets) {
    if (!offsets) return base;
    const out = Object.assign({}, base);
    for (const k of Object.keys(base)) {
        if (NOT_PRICEABLE.includes(k)) continue;
        out[k] = priceShift(base[k], offsets[k] || 0);
    }
    return out;
}

/** ランダム付与: 重複なく slots 個を選ぶ */
function randomGears(slots, rng = Math.random) {
    const pool = GEAR_IDS.slice();
    const out = [];
    for (let i = 0; i < slots && pool.length > 0; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
}

module.exports = {
    GEAR_PARAMS, GEAR_IDS, gearSlotsFor, hasGear, gearLifeBonus, gearLifeStd, gearLockBind, gearTokenBindDelta,
    adjustCostByGear, rollPriceOffsets, applyPriceOffsets, priceShift, randomGears,
};
