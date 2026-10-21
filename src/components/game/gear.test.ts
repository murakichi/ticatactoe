import {
    priceShift,
    GEARS,
    GEAR_IDS,
    GEAR_PARAMS,
    adjustCostByGear,
    applyPriceOffsets,
    gearLifeBonus,
    gearLifeStd,
    gearLockBind,
    gearSlotsFor,
    gearTokenBindDelta,
    randomGears,
    recommendedGears,
    RECOMMENDED_GEARS,
    ALT_RECOMMENDED_GEARS,
    pickRecommendedGears,
    rollPriceOffsets,
    PRICEABLE_KEYS,
} from './gear';
import { skillCosts } from './skillCosts';

const ctx = (skillsThisTurn = 0, echoReady = false) => ({ skillsThisTurn, echoReady });

describe('ギアの定義', () => {
    it('IDは重複せず、全ギアに名前・アイコン・説明がある', () => {
        expect(new Set(GEAR_IDS).size).toBe(GEARS.length);
        for (const g of GEARS) {
            expect(g.name).not.toBe('');
            expect(g.icon).not.toBe('');
            expect(g.desc).not.toBe('');
        }
    });

    it('説明文は GEAR_PARAMS の数値から描画される', () => {
        const desc = (id: string) => GEARS.find((g) => g.id === id)!.desc;
        expect(desc('ironLock')).toContain(String(GEAR_PARAMS.ironLockBind));
        expect(desc('luckyPurse')).toContain(`${GEAR_PARAMS.luckyPurseChance * 100}%`);
        expect(desc('bindingLock')).toContain(`${GEAR_PARAMS.bindingLockChance * 100}%`);
        expect(desc('harvest')).toContain(String(GEAR_PARAMS.harvestCap));
        expect(desc('gambler')).toContain(String(GEAR_PARAMS.gamblerStd));
    });

    it('装備枠は「あなた」だけ3、他は2', () => {
        expect(gearSlotsFor('you')).toBe(3);
        expect(gearSlotsFor('giant')).toBe(2);
    });
});

describe('ライフ・ロック・トークンの補正', () => {
    it('頑健+1 / 剛腕の代償+3 / 賭博師のσ=5 / 堅牢の鍵=9', () => {
        expect(gearLifeBonus(['sturdy'])).toBe(1);
        expect(gearLifeBonus(['titanCost'])).toBe(3);
        expect(gearLifeBonus(['sturdy', 'titanCost'])).toBe(4);
        expect(gearLifeBonus(undefined)).toBe(0);
        expect(gearLifeStd(['gambler'], 3)).toBe(5);
        expect(gearLifeStd([], 3)).toBe(3);
        expect(gearLockBind(['ironLock'])).toBe(9);
        expect(gearLockBind([])).toBe(6);
    });

    it('トークンのライフ: 増援+1 / 軽量トークン-1 / 両方で相殺', () => {
        expect(gearTokenBindDelta(['reinforce'])).toBe(1);
        expect(gearTokenBindDelta(['lightToken'])).toBe(-1);
        expect(gearTokenBindDelta(['reinforce', 'lightToken'])).toBe(0);
    });
});

describe('adjustCostByGear', () => {
    it('ギア無しなら変えない', () => {
        expect(adjustCostByGear(4, [], ctx(3, true))).toBe(4);
        expect(adjustCostByGear(4, undefined, ctx())).toBe(4);
    });

    it('剛腕の代償: +3', () => {
        expect(adjustCostByGear(4, ['titanCost'], ctx())).toBe(7);
    });

    it('四連の極意: 4回使った直後（ちょうど4回目の次）だけ0', () => {
        expect(adjustCostByGear(4, ['quadMastery'], ctx(3))).toBe(4);
        expect(adjustCostByGear(4, ['quadMastery'], ctx(4))).toBe(0);
        expect(adjustCostByGear(4, ['quadMastery'], ctx(5))).toBe(4);
    });

    it('余韻: その手番の1つ目だけ-1、下限1', () => {
        expect(adjustCostByGear(4, ['afterglow'], ctx(0, true))).toBe(3);
        expect(adjustCostByGear(4, ['afterglow'], ctx(1, true))).toBe(4);
        expect(adjustCostByGear(4, ['afterglow'], ctx(0, false))).toBe(4);
        expect(adjustCostByGear(1, ['afterglow'], ctx(0, true))).toBe(1);
    });

    it('連鎖割引: 使うたびに-1、下限1、もともと0なら0', () => {
        expect(adjustCostByGear(4, ['chainDiscount'], ctx(0))).toBe(4);
        expect(adjustCostByGear(4, ['chainDiscount'], ctx(2))).toBe(2);
        expect(adjustCostByGear(4, ['chainDiscount'], ctx(9))).toBe(1);
        expect(adjustCostByGear(0, ['chainDiscount'], ctx(3))).toBe(0);
    });

    it('軽量トークン: トークン系だけ-1', () => {
        expect(adjustCostByGear(4, ['lightToken'], ctx(), true)).toBe(3);
        expect(adjustCostByGear(4, ['lightToken'], ctx(), false)).toBe(4);
    });

    it('プラスとマイナスの補正が重なっても下限1を割らない', () => {
        // +3 -4 = -1 → 下げる方向なので、元の4を超えず1以上
        expect(adjustCostByGear(4, ['titanCost', 'chainDiscount'], ctx(4))).toBe(3);
        expect(adjustCostByGear(2, ['chainDiscount', 'afterglow'], ctx(0, true))).toBe(1);
    });
});

describe('価格破壊', () => {
    it('対象外のスキルが決まっている（シャッフル・チャージは固定）', () => {
        expect(PRICEABLE_KEYS).not.toContain('onClickShuffle');
        expect(PRICEABLE_KEYS).not.toContain('onClickCharge');
        expect(PRICEABLE_KEYS).toContain('onClickToken');
    });

    it('加算値は ±4 の範囲、適用後は下限2（元が2未満ならそのまま）・対象外は不変', () => {
        let seed = 7;
        const rng = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        const offsets = rollPriceOffsets(rng);
        for (const k of PRICEABLE_KEYS) {
            expect(offsets[k]).toBeGreaterThanOrEqual(-GEAR_PARAMS.priceRange);
            expect(offsets[k]).toBeLessThanOrEqual(GEAR_PARAMS.priceRange);
        }
        const table = applyPriceOffsets(skillCosts, offsets);
        for (const k of PRICEABLE_KEYS) expect(table[k]).toBeGreaterThanOrEqual(Math.min(GEAR_PARAMS.priceFloor, skillCosts[k]));
        expect(table.onClickShuffle).toBe(skillCosts.onClickShuffle);
    });

    it('priceShift: 上げる方向はそのまま、下げる方向は下限2まで（元が2未満ならそのまま）', () => {
        expect(priceShift(4, 3)).toBe(7);
        expect(priceShift(4, -1)).toBe(3);
        expect(priceShift(4, -4)).toBe(2);
        expect(priceShift(2, -3)).toBe(2);
        expect(priceShift(1, -3)).toBe(1);
        expect(priceShift(1, 0)).toBe(1);
        expect(priceShift(1, 2)).toBe(3);
    });

    it('加算値が無ければ元の表をそのまま返す', () => {
        expect(applyPriceOffsets(skillCosts, undefined)).toBe(skillCosts);
    });
});

describe('ランダム付与', () => {
    it('重複なしで枠数ぶん、すべて既知のギア', () => {
        for (let k = 0; k < 30; k++) {
            const g = randomGears(3);
            expect(new Set(g).size).toBe(3);
            for (const id of g) expect(GEAR_IDS).toContain(id);
        }
    });
});

describe('sim/gear.js（ヘッドレス版の複製）と一致する', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const simGear = require('../../../sim/gear');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const simEngine = require('../../../sim/engine');

    it('ギアのID一覧と数値パラメータが同じ', () => {
        expect(simGear.GEAR_IDS).toEqual(GEAR_IDS);
        expect(simGear.GEAR_PARAMS).toEqual(GEAR_PARAMS);
    });

    it('枠数・補正関数が同じ結果を返す', () => {
        for (const c of ['you', 'giant', 'poisoner']) expect(simGear.gearSlotsFor(c)).toBe(gearSlotsFor(c as never));
        const sets = [[], ['sturdy'], ['titanCost'], ['gambler', 'ironLock'], ['reinforce', 'lightToken'], ['afterglow', 'chainDiscount', 'quadMastery']];
        for (const g of sets) {
            const gs = g as never[];
            expect(simGear.gearLifeBonus(gs)).toBe(gearLifeBonus(gs));
            expect(simGear.gearLifeStd(gs, 3)).toBe(gearLifeStd(gs, 3));
            expect(simGear.gearLockBind(gs)).toBe(gearLockBind(gs));
            expect(simGear.gearTokenBindDelta(gs)).toBe(gearTokenBindDelta(gs));
            for (let used = 0; used < 7; used++) {
                for (const echo of [false, true]) {
                    for (const token of [false, true]) {
                        for (const base of [0, 1, 2, 4, 9]) {
                            expect(simGear.adjustCostByGear(base, gs, ctx(used, echo), token)).toBe(adjustCostByGear(base, gs, ctx(used, echo), token));
                        }
                    }
                }
            }
        }
    });

    it('価格破壊: 同じ乱数列なら同じコスト表になる（skillCosts のキーも一致）', () => {
        expect(Object.keys(simEngine.skillCosts)).toEqual(Object.keys(skillCosts));
        const mk = () => {
            let seed = 99;
            return () => {
                seed = (seed * 16807) % 2147483647;
                return seed / 2147483647;
            };
        };
        const a = applyPriceOffsets(skillCosts, rollPriceOffsets(mk()));
        for (const [base, off] of [[4, -4], [2, -3], [1, -3], [1, 2], [6, 4]]) expect(simGear.priceShift(base, off)).toBe(priceShift(base, off));
        const b = simGear.applyPriceOffsets(simEngine.skillCosts, simGear.rollPriceOffsets(simEngine.skillCosts, mk()));
        for (const k of PRICEABLE_KEYS) expect(b[k]).toBe(a[k]);
    });
});

describe('AIが選ぶギア', () => {
    it('枠数以内・重複なし・存在するギアだけ', () => {
        for (const c of ['you', 'tactician', 'magician', 'giant', 'yinYangMaster', 'necromancer', 'poisoner', 'electrician', 'fighter', 'healer'] as const) {
            const gears = recommendedGears(c);
            expect(gears.length).toBeGreaterThan(0);
            expect(gears.length).toBeLessThanOrEqual(gearSlotsFor(c));
            expect(new Set(gears).size).toBe(gears.length);
            for (const g of gears) expect(GEAR_IDS).toContain(g);
        }
    });

    it('sim/gear.js の複製と一致する', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const simGear = require('../../../sim/gear');
        expect(simGear.RECOMMENDED_GEARS).toEqual(RECOMMENDED_GEARS);
        expect(simGear.ALT_RECOMMENDED_GEARS).toEqual(ALT_RECOMMENDED_GEARS);
    });

    it('別案は枠数以内・重複なし・存在するギアだけ、pickは主案か別案のどれか', () => {
        for (const c of Object.keys(ALT_RECOMMENDED_GEARS) as (keyof typeof ALT_RECOMMENDED_GEARS)[]) {
            const patterns = [recommendedGears(c), ...(ALT_RECOMMENDED_GEARS[c] ?? [])];
            for (const gears of patterns) {
                expect(gears.length).toBeLessThanOrEqual(gearSlotsFor(c));
                expect(new Set(gears).size).toBe(gears.length);
                for (const g of gears) expect(GEAR_IDS).toContain(g);
            }
            for (let i = 0; i < patterns.length; i++) {
                const picked = pickRecommendedGears(c, () => (i + 0.5) / patterns.length);
                expect(picked).toEqual(patterns[i].slice(0, gearSlotsFor(c)));
            }
        }
    });

    it('別案が無いキャラは主案を返す', () => {
        expect(pickRecommendedGears('tactician', () => 0.99)).toEqual(recommendedGears('tactician'));
    });
});
