import { emptyDiscount, discountAmount, applyDiscount, afterSkill, canUseDiscountSkill, lifeDeltaOf, DISCOUNT_SKILLS, EFFECT_SKILL_KEYS, UNIQUE_SKILL_KEYS } from './discount';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sim = require('../../../sim/discount');

describe('コスト軽減スキル', () => {
    it('次に打つスキルの軽減は足し算で、軽減札でないスキルを打つと消える。軽減後は下限1', () => {
        let d = afterSkill(emptyDiscount(), 'onClickMarkdown');
        d = afterSkill(d, 'onClickClearance');
        expect(d.next).toBe(10);
        expect(applyDiscount(6, discountAmount(d, 'onClickStomp', false))).toBe(1);
        expect(applyDiscount(0, 5)).toBe(0);
        d = afterSkill(d, 'onClickFreeze');
        expect(d.next).toBe(0);
    });
    it('軽減札どうしは軽減されず、「次に打つ」も消費しない', () => {
        const d = afterSkill(emptyDiscount(), 'onClickMarkdown');
        expect(discountAmount(d, 'onClickClearance', false)).toBe(0);
        expect(afterSkill(d, 'onClickEffectDiscount').next).toBe(3);
    });
    it('エフェクト付与・トークン・固有スキルの軽減は該当スキルだけに効き、打っても残る', () => {
        let d = afterSkill(afterSkill(afterSkill(emptyDiscount(), 'onClickEffectDiscount'), 'onClickTokenDiscount'), 'onClickUniqueDiscount');
        expect(discountAmount(d, 'onClickFreeze', false)).toBe(1);
        expect(discountAmount(d, 'onClickToken', true)).toBe(1);
        expect(discountAmount(d, 'onClickInferno', false)).toBe(6);
        expect(discountAmount(d, 'onClickSlash', false)).toBe(0);
        d = afterSkill(d, 'onClickFreeze');
        expect(discountAmount(d, 'onClickFreeze', false)).toBe(1);
    });
    it('固有割引は1ターンに一度だけ。ライフ-1は、ライフが2以上のときだけ', () => {
        const d = afterSkill(emptyDiscount(), 'onClickUniqueDiscount');
        expect(canUseDiscountSkill(emptyDiscount(), 'onClickUniqueDiscount', 3)).toBe(true);
        expect(canUseDiscountSkill(emptyDiscount(), 'onClickUniqueDiscount', 1)).toBe(false);
        expect(canUseDiscountSkill(d, 'onClickUniqueDiscount', 5)).toBe(false);
        expect(lifeDeltaOf('onClickVitalMarkdown')).toBe(1);
        expect(lifeDeltaOf('onClickUniqueDiscount')).toBe(-1);
        expect(lifeDeltaOf('onClickMarkdown')).toBe(0);
    });
    it('sim/discount.js と一致する', () => {
        expect(sim.DISCOUNT_SKILLS).toEqual(DISCOUNT_SKILLS);
        expect(Array.from(sim.EFFECT_SKILL_KEYS).sort()).toEqual(Array.from(EFFECT_SKILL_KEYS).sort());
        expect(Array.from(sim.UNIQUE_SKILL_KEYS).sort()).toEqual(Array.from(UNIQUE_SKILL_KEYS).sort());
        for (const key of Object.keys(DISCOUNT_SKILLS)) {
            expect(sim.afterSkill(emptyDiscount(), key)).toEqual(afterSkill(emptyDiscount(), key));
        }
        const d = afterSkill(afterSkill(emptyDiscount(), 'onClickEffectDiscount'), 'onClickMarkdown');
        for (const k of ['onClickFreeze', 'onClickInferno', 'onClickSlash', 'onClickClearance']) {
            for (const t of [false, true]) expect(sim.discountAmount(d, k, t)).toBe(discountAmount(d, k, t));
        }
    });
});
