import {
    priceShift,
    GEARS,
    GEAR_IDS,
    GEAR_PARAMS,
    adjustCostByGear,
    applyPriceOffsets,
    gearLifeBonus,
    gearLifeStd,
    gearLockStack,
    gearSlotsFor,
    gearTokenBindDelta,
    randomGears,
    recommendedGears,
    recommendedGearsAgainst,
    counterGearsFor,
    COUNTER_GEARS_FOR_YOU,
    RECOMMENDED_GEARS,
    ALT_RECOMMENDED_GEARS,
    pickRecommendedGears,
    rollPriceOffsets,
    PRICEABLE_KEYS,
    EXCLUSIVE_SKILL_KEYS,
    countVarietySquares,
    countAilmentKinds,
    lostCells,
    burnedBudCount,
    scorchGain,
    ignitedCount,
    flameCounts,
    frozenBudCount,
    rootGain,
    budCounts,
    rampStart,
    rampBonus,
    rampAfterRoll,
} from './gear';
import { skillCosts } from './skillCosts';
import { rubbleCells, applyRubble } from './gear';
import { lifeZeroVictims } from './gearTurn';

const ctx = (skillsThisTurn = 0, echoReady = false, ailments = 0, ruin = false) => ({ skillsThisTurn, echoReady, ailments, ruin });

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
        expect(desc('ironLock')).toContain(String(GEAR_PARAMS.ironLockStack));
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
        expect(gearLockStack(['ironLock'])).toBe(9);
        expect(gearLockStack([])).toBe(6);
    });

    it('トークンのライフ: 増援+2 / 軽量トークン-1 / 両方で+1', () => {
        expect(gearTokenBindDelta(['reinforce'])).toBe(2);
        expect(gearTokenBindDelta(['lightToken'])).toBe(-1);
        expect(gearTokenBindDelta(['reinforce', 'lightToken'])).toBe(1);
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

describe('新ギア（彩りの庭・病炎の契り・廃墟の底力・土壇場の防壁）', () => {
    const sq = (player: string | undefined, ...effects: string[]) => ({ player, effects: effects.map((effect) => ({ effect })) });

    it('彩りの庭: 自陣のエフェクト2種類以上のマスだけ数える', () => {
        const board = [sq('💙', '☠', '🌱'), sq('💙', '☠', '☠'), sq('⭕', '☠', '🔥'), sq('💙', '🌱', '🔥', '⚡')];
        expect(countVarietySquares(board, '💙')).toBe(2);
    });

    it('病炎の契り: 毒・火炎の種類数ぶん、固有以外のスキルを-1（下限1）', () => {
        const board = [sq('💙', '☠'), sq('💙', '☠', '🔥'), sq('⭕', '🔥')];
        expect(countAilmentKinds(board, '💙')).toBe(2);
        expect(countAilmentKinds(board, '⭕')).toBe(1);
        expect(adjustCostByGear(5, ['ailmentPact'], ctx(0, false, 2), false, 'onClickShuffle')).toBe(3);
        expect(adjustCostByGear(5, ['ailmentPact'], ctx(0, false, 2), false, EXCLUSIVE_SKILL_KEYS[0])).toBe(5);
        expect(adjustCostByGear(1, ['ailmentPact'], ctx(0, false, 2), false, 'onClickShuffle')).toBe(1);
    });

    it('廃墟の底力: 有効な間は全スキル-1（下限1）', () => {
        expect(adjustCostByGear(4, ['ruinSurge'], ctx(0, false, 0, true))).toBe(3);
        expect(adjustCostByGear(4, ['ruinSurge'], ctx())).toBe(4);
        expect(adjustCostByGear(1, ['ruinSurge'], ctx(0, false, 0, true))).toBe(1);
    });

    it('lostCells: 持ち主でなくなったマスだけ（着手マスは除く）', () => {
        expect(lostCells(['💙', '💙', '⭕'], ['💙', undefined, '⭕'], '💙', null)).toEqual([1]);
        expect(lostCells(['💙', '💙', '⭕'], ['⭕', undefined, '⭕'], '💙', 0)).toEqual([1]);
    });
});

describe('下位キャラ向けギア（焦土・灰の供物・凍てつく根）', () => {
    const sq = (player: string | undefined, ...effects: string[]) => ({ player, effects: effects.map((effect) => ({ effect })) });

    it('焦土: 敵の🌱が🔥で消えた数×2、上限6。自分の🌱や🔥のないマスは数えない', () => {
        const board = [sq('⭕', '🔥'), sq('💙', '🔥'), sq('⭕')];
        expect(burnedBudCount(['⭕', '💙', '⭕'], [2, 2, 2], board, '💙')).toBe(2);
        // 🍂（枯れ葉）も🌱と同じく燃えて消えれば数える
        expect(burnedBudCount(['⭕', '⭕'], [2, 1], [sq('⭕', '🔥'), sq('⭕', '🔥', '🍂')], '💙')).toBe(2);
        expect(budCounts([sq('⭕', '🌱', '🍂', '🍂')])).toEqual([3]);
        expect(scorchGain(2)).toBe(4);
        expect(scorchGain(10)).toBe(6);
    });

    it('灰の供物: 敵のマスで🔥が増えた数だけ、全スキルのコストを下げる(重複・下限1)', () => {
        const board = [sq('⭕', '🔥'), sq('💙', '🔥'), sq('⭕', '🔥', '🔥'), sq('⭕')];
        expect(ignitedCount(['⭕', '💙', '⭕', '⭕'], [0, 0, 1, 0], board, '💙')).toBe(2);
        expect(flameCounts(board)).toEqual([1, 1, 2, 0]);
        expect(adjustCostByGear(5, ['ashOffering'], ctx(), false, undefined)).toBe(5);
        expect(adjustCostByGear(5, ['ashOffering'], { skillsThisTurn: 0, echoReady: false, ash: 3 })).toBe(2);
        expect(adjustCostByGear(2, ['ashOffering'], { skillsThisTurn: 0, echoReady: false, ash: 3 })).toBe(1);
    });

    it('凍てつく根: 氷結中のマスの🌱を敵味方問わず数え、魔力は上限なし', () => {
        const board = [sq('💙', '🌱', '❄'), sq('⭕', '🌱', '🌱', '❄'), sq('⭕', '🌱'), sq('⭕', '🌱', '🌱', '🌱', '❄')];
        expect(frozenBudCount(board)).toBe(6);
        expect(rootGain(6)).toBe(6);
        expect(rootGain(2)).toBe(2);
        expect(budCounts(board)).toEqual([1, 2, 1, 3]);
    });
});

describe('雪だるま（ライフ期待値の積み上げ）', () => {
    it('最初は+0で、引くたびに+1ずつ積み上がる', () => {
        let r = rampStart();
        expect(rampBonus(r)).toBe(0);
        r = rampAfterRoll(r, 5);
        r = rampAfterRoll(r, 5);
        r = rampAfterRoll(r, 5);
        expect(rampBonus(r)).toBe(3);
    });

    it('10以上のライフが3回出たら、積み上げと回数がリセットされる(9以下は数えない。最初に引いた分も数える)', () => {
        let r = rampAfterRoll(rampStart(), 10); // 最初の10以上も数える
        expect(r).toEqual({ stack: 1, hits: 1 });
        r = rampAfterRoll(r, 9);
        expect(r).toEqual({ stack: 2, hits: 1 });
        r = rampAfterRoll(r, 14);
        expect(r).toEqual({ stack: 3, hits: 2 });
        r = rampAfterRoll(r, 10);
        expect(r).toEqual({ stack: 0, hits: 0 });
        expect(rampBonus(r)).toBe(0); // リセット後は次の抽選が+0
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

describe('春雷（springThunderThaw）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { springThunderThaw } = require('./gear');
    const empty = () => Array.from({ length: 16 }, () => ({ player: undefined as any, bind: 0, effects: [] as any[] }));
    const mine = (b: any[], cells: number[]) => cells.forEach((i) => (b[i] = { player: '💙', bind: 3, effects: [] }));
    it('自陣のリーチの4つ目が氷結した空きマスなら、その❄を1つ解く', () => {
        const b = empty();
        mine(b, [0, 1, 2]);
        b[3] = { player: undefined, bind: 0, effects: [{ effect: '❄' }, { effect: '❄' }] }; // ❄が2つ
        expect(springThunderThaw(b, '💙')).toEqual([3]);
        expect(b[3].effects.filter((e: any) => e.effect === '❄').length).toBe(1); // 1つだけ解く
        expect(springThunderThaw(b, '💙')).toEqual([3]);
        expect(b[3].effects.length).toBe(0); // 2回目で解けきる
    });
    it('敵のコマが入った列・リーチでない列・凍っていない空きマスは対象外', () => {
        const b = empty();
        mine(b, [0, 1]);
        b[2] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] }; // 2つしか無い列
        expect(springThunderThaw(b, '💙')).toEqual([]);
        const c = empty();
        mine(c, [0, 1, 2]);
        c[3] = { player: undefined, bind: 0, effects: [] }; // 凍っていない空き
        expect(springThunderThaw(c, '💙')).toEqual([]);
        const d = empty();
        mine(d, [0, 1]);
        d[2] = { player: '⭕', bind: 3, effects: [] };
        d[3] = { player: undefined, bind: 0, effects: [{ effect: '❄' }] }; // 敵のコマが入った列
        expect(springThunderThaw(d, '💙')).toEqual([]);
    });
});

describe('「あなた」の相手別ギア', () => {
    it('相手が1キャラで専用ギアがあればそれ、複数キャラ・専用なしなら通常の推奨', () => {
        expect(recommendedGearsAgainst('you', ['poisoner'])).toEqual(['lastStand', 'spellWard', 'emptyLock']);
        expect(recommendedGearsAgainst('you', ['poisoner', 'poisoner'])).toEqual(['lastStand', 'spellWard', 'emptyLock']);
        expect(recommendedGearsAgainst('you', ['poisoner', 'giant'])).toEqual(recommendedGears('you'));
        expect(recommendedGearsAgainst('you', ['magician'])).toEqual(['lastStand', 'sturdy', 'budSeed']);
        expect(recommendedGearsAgainst('you', ['giant'])).toEqual(['lastStand', 'emptyLock', 'luckyPurse']);
        expect(recommendedGearsAgainst('you', ['tactician'])).toEqual(recommendedGears('you'));
        expect(recommendedGearsAgainst('magician', ['poisoner'])).toEqual(recommendedGears('magician'));
    });
    it('専用ギアはすべて実在し、枠数に収まる', () => {
        for (const g of Object.values(COUNTER_GEARS_FOR_YOU)) {
            expect(g!.length).toBeLessThanOrEqual(gearSlotsFor('you'));
            for (const id of g!) expect(GEAR_IDS).toContain(id);
        }
    });
});

describe('普請道楽（オブジェクトのギア）', () => {
    const own = { skillsThisTurn: 0, echoReady: false, ownObjects: true };
    const none = { skillsThisTurn: 0, echoReady: false, ownObjects: false };
    it('自陣にオブジェクトが無いときはオブジェクトを設置するスキルがコスト-2、あれば全スキル-3（設置スキルの-2は無いときだけ。重ならない）。下限1', () => {
        expect(adjustCostByGear(8, ['buildMania'], none, false, 'onClickBigTree')).toBe(6);
        expect(adjustCostByGear(5, ['buildMania'], none, false, 'onClickFort')).toBe(3);
        expect(adjustCostByGear(4, ['buildMania'], none, false, 'onClickBibine')).toBe(4); // 設置でもオブジェクトも無いスキルは変わらない
        expect(adjustCostByGear(4, ['buildMania'], own, false, 'onClickBibine')).toBe(1);
        expect(adjustCostByGear(8, ['buildMania'], own, false, 'onClickBigTree')).toBe(5); // 設置スキルも-3だけ（-2は上乗せされない）
        // 八百万の祈り（龍神の巫女）も建造物を置くスキルなので、オブジェクトが無いときは-2、ある間は-3
        expect(adjustCostByGear(4, ['buildMania'], none, false, 'onClickPrayer')).toBe(2);
        expect(adjustCostByGear(4, ['buildMania'], own, false, 'onClickPrayer')).toBe(1);
        expect(adjustCostByGear(5, ['buildMania'], own, false, 'onClickFort')).toBe(2);
        expect(adjustCostByGear(3, ['buildMania'], own, false, 'onClickBibine')).toBe(1); // 下限1
        expect(adjustCostByGear(1, ['buildMania'], own, false, 'onClickShuffle')).toBe(1);
    });
    it('ギアを持たない席には何も起きない。壊す・強くするスキルは設置ではないので-2の対象外', () => {
        expect(adjustCostByGear(8, [], own, false, 'onClickBigTree')).toBe(8);
        expect(adjustCostByGear(6, ['buildMania'], none, false, 'onClickDuplicate')).toBe(6);
    });
});

describe('死神の鎌（ライフ0の駒を壊す）', () => {
    const sq = (player: '💙' | '⭕' | undefined, bind: number, ...effects: string[]) => ({ player, bind, effects: effects.map((effect) => ({ effect })) } as never);
    const chars = ['you', 'electrician'] as const;

    it('誰かが装備していれば、誰の駒でもライフ0を壊す。氷結・ロック・⚡無敵・ライフありは壊さない', () => {
        const board = [sq('💙', 0), sq('⭕', 0), sq('⭕', 0, '🔑'), sq('⭕', 0, '❄'), sq('⭕', 0, '⚡'), sq('💙', 3), sq(undefined, 0)];
        expect(lifeZeroVictims(board, chars, [[], ['reaper']])).toEqual([0, 1]);
        expect(lifeZeroVictims(board, chars, [[], []])).toEqual([]);
        expect(gearLifeBonus(['reaper'])).toBe(2);
    });
});

describe('瓦礫の礎', () => {
    type Sq = import('../../types/SquareInfo').SquareInfo;
    const E = (): Sq => ({ player: undefined, bind: 0, effects: [] });
    const fort = (p: '💙' | '⭕'): Sq => ({ player: p, bind: 5, effects: [], object: 'fort' });
    const boulder = (p: '💙' | '⭕'): Sq => ({ player: p, bind: 5, effects: [], object: 'boulder' });
    const mk = (n: number): Sq[] => Array.from({ length: n }, E);

    it('自陣の大岩以外のオブジェクトが壊されて空きマスになると、そのマスが対象になる', () => {
        const prev = mk(16);
        prev[3] = fort('💙');
        prev[5] = fort('💙');
        prev[9] = boulder('💙');
        prev[12] = fort('⭕');
        const next = prev.map((sq) => ({ ...sq }));
        next[3] = E(); // 壊された
        next[9] = E(); // 大岩は対象外
        next[12] = E(); // 敵のオブジェクトは対象外
        expect(rubbleCells(prev, next, '💙')).toEqual([3]);
    });

    it('乗っ取られたマスや、まだオブジェクトが残るマスは対象外', () => {
        const prev = mk(16);
        prev[3] = fort('💙');
        prev[5] = fort('💙');
        const next = prev.map((sq) => ({ ...sq }));
        next[3] = { player: '⭕', bind: 2, effects: [] };
        next[5] = { ...fort('💙'), bind: 1 };
        expect(rubbleCells(prev, next, '💙')).toEqual([]);
    });

    it('壊された位置に2ターンのロック付きの大岩が置かれる', () => {
        const prev = mk(16);
        prev[3] = fort('💙');
        const next = mk(16);
        const r = applyRubble(prev, next, '💙');
        expect(r.cells).toEqual([3]);
        expect(r.board[3].object).toBe('boulder');
        expect(r.board[3].player).toBe('💙');
        expect(r.board[3].effects.some((e) => e.effect === '🔑')).toBe(true);
        expect(GEAR_PARAMS.rubbleMagic).toBe(1);
    });
});

describe('相手キャラ別の専用ギア（counterGearsFor）', () => {
    it('相手が1種類で専用ギアがあるときだけそれを使う。他の相手・複数種類・専用が無い組み合わせは通常の推奨', () => {
        expect(counterGearsFor('tactician', ['cryomancer'])).toEqual(['springThunder', 'priceWreck']);
        expect(counterGearsFor('poisoner', ['cryomancer', 'cryomancer'])).toEqual(['springThunder', 'spellWard']);
        expect(counterGearsFor('keysmith', ['pyromancer'])).toEqual(['spellWard', 'lockBloom']); // 鍛冶師の🔥・火遁を呪詛除けで止める
        expect(counterGearsFor('keysmith', ['yinYangMaster'])).toEqual(['reaper', 'lockBloom']);
        expect(counterGearsFor('keysmith', ['electrician'])).toEqual(['reaper', 'lockBloom']);
        expect(counterGearsFor('keysmith', ['necromancer'])).toEqual(['harvest', 'lockBloom']);
        expect(counterGearsFor('keysmith', ['magician'])).toBeUndefined();
        expect(counterGearsFor('tactician', ['magician'])).toBeUndefined();
        expect(counterGearsFor('tactician', ['giant'])).toBeUndefined();
        expect(counterGearsFor('tactician', ['cryomancer', 'magician'])).toBeUndefined();
        expect(counterGearsFor('giant', ['cryomancer'])).toBeUndefined();
        expect(counterGearsFor('giant', ['magician'])).toBeUndefined();
        expect(counterGearsFor('giant', ['tactician'])).toBeUndefined();
        expect(counterGearsFor('pyromancer', ['yinYangMaster'])).toEqual(['afterglow', 'snowball']);
        expect(counterGearsFor('necromancer', ['cryomancer'])).toBeUndefined();
        expect(counterGearsFor('cryomancer', ['electrician'])).toEqual(['lightToken', 'reaper']);
        expect(counterGearsFor('cryomancer', ['giant'])).toBeUndefined();
        // 氷室の番人: 鍛冶師・毒使いには術中の加護+死神の鎌（対鍛冶師 9〜12→72〜74%）。複数種類の相手・他のキャラには通常の推奨
        expect(counterGearsFor('cryomancer', ['pyromancer'])).toEqual(['spellWard', 'reaper']);
        expect(counterGearsFor('cryomancer', ['poisoner'])).toEqual(['spellWard', 'reaper']);
        expect(counterGearsFor('cryomancer', ['pyromancer', 'poisoner'])).toBeUndefined();
        expect(counterGearsFor('cryomancer', ['magician'])).toEqual(['budSeed', 'reaper']);
        expect(counterGearsFor('cryomancer', ['keysmith'])).toEqual(['lightToken', 'reaper']);
        expect(counterGearsFor('cryomancer', ['tactician'])).toBeUndefined();
        expect(recommendedGearsAgainst('cryomancer', ['pyromancer'])).toEqual(['spellWard', 'reaper']);
        expect(recommendedGearsAgainst('cryomancer', ['tactician'])).toEqual(recommendedGears('cryomancer'));
        expect(recommendedGearsAgainst('tactician', ['cryomancer'])).toEqual(['springThunder', 'priceWreck']);
        expect(recommendedGearsAgainst('tactician', ['giant'])).toEqual(recommendedGears('tactician'));
    });
});

describe('龍神の巫女の専用ギア', () => {
    it('相手が氷室の番人だけのときは、普請道楽＋春雷を使う。ほかの相手は通常の推奨', () => {
        expect(counterGearsFor('dragonMiko', ['cryomancer'])).toEqual(['buildMania', 'springThunder']);
        expect(counterGearsFor('dragonMiko', ['giant'])).toBeUndefined();
        expect(recommendedGearsAgainst('dragonMiko', ['cryomancer'])).toEqual(['buildMania', 'springThunder']);
        expect(recommendedGearsAgainst('dragonMiko', ['giant'])).toEqual(['buildMania', 'lastStand']);
    });
});
