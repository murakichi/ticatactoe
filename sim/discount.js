'use strict';
// src/components/game/discount.ts の複製（ヘッドレス版）。discount.test.ts が一致を確認する。
const emptyDiscount = () => ({ next: 0, effect: 0, token: 0, unique: 0, uniqueUsed: false });
const DISCOUNT_SKILLS = {
    onClickMarkdown: { next: 3 },
    onClickEffectDiscount: { effect: 1 },
    onClickTokenDiscount: { token: 1 },
    onClickVitalMarkdown: { next: 4, life: 1 },
    onClickUniqueDiscount: { unique: 6, life: -1 },
    onClickClearance: { next: 7 },
    onClickCounterMarkdown: { next: 3, life: 1 },
};
const isDiscountSkill = (key) => Object.prototype.hasOwnProperty.call(DISCOUNT_SKILLS, key);
const EFFECT_SKILL_KEYS = new Set([
    'onClickBuds', 'onClickDoubleBuds', 'onClickWalpurgisNight',
    'onClickInjection', 'onClickIntensify', 'onClickPandemic', 'onClickPoisonMist',
    'onClickChargeOne', 'onClickChargeArea', 'onClickChargeRandom',
    'onClickFreeze', 'onClickFrostArea', 'onClickIcicle', 'onClickRandomFreeze', 'onClickFreezeSpread', 'onClickFrostfall',
    'onClickIgnite', 'onClickSacrifice', 'onClickSucker', 'onClickWindborne',
]);
const UNIQUE_SKILL_KEYS = new Set([
    'onClickStomp', 'onClickJudgeDay', 'onClickTotalAssault', 'onClickMiasma', 'onClickChargeSpread',
    'onClickGlacier', 'onClickInferno', 'onClickNecromancy', 'onClickToggleYingYang', 'onClickYingYangSkill',
]);
function discountAmount(d, key, isToken) {
    if (key && isDiscountSkill(key)) return 0;
    let n = d.next;
    if (isToken) n += d.token;
    else if (key && EFFECT_SKILL_KEYS.has(key)) n += d.effect;
    if (key && UNIQUE_SKILL_KEYS.has(key)) n += d.unique;
    return n;
}
const applyDiscount = (cost, amount) => (cost <= 0 || amount <= 0 ? cost : Math.max(1, cost - amount));
function afterSkill(d, key) {
    if (isDiscountSkill(key)) {
        const e = DISCOUNT_SKILLS[key];
        return {
            next: d.next + (e.next || 0),
            effect: d.effect + (e.effect || 0),
            token: d.token + (e.token || 0),
            unique: d.unique + (e.unique || 0),
            uniqueUsed: d.uniqueUsed || key === 'onClickUniqueDiscount',
        };
    }
    return Object.assign({}, d, { next: 0 });
}
const lifeDeltaOf = (key) => DISCOUNT_SKILLS[key].life || 0;
const canUseDiscountSkill = (d, key, life) => !(key === 'onClickUniqueDiscount' && d.uniqueUsed) && !(lifeDeltaOf(key) < 0 && life < 2);
module.exports = { emptyDiscount, DISCOUNT_SKILLS, isDiscountSkill, EFFECT_SKILL_KEYS, UNIQUE_SKILL_KEYS, discountAmount, applyDiscount, afterSkill, canUseDiscountSkill, lifeDeltaOf };
