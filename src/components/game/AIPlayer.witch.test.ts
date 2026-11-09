import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { emptyBoard, put } from './aiTestUtils';

describe('🍂落ち葉スキルのAI使用', () => {
    const costs = { onClickLeafToken: 3, onClickTwinLeafToken: 5, onClickDoubleLeafToken: 6, onClickBonfire: 3, onClickMulch: 2, onClickAutumn: 4 } as any;
    const lone = () => {
        const b = emptyBoard();
        put(b, 0, '💙');
        put(b, 15, '⭕');
        return b;
    };

    it('pickLeafToken: ダブル(空き4以上)→双子→1枚の順に、払える最初のものを選ぶ', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        expect(ai.pickLeafToken([62, 63, 64], 10, 10, costs)).toEqual({ skill: 'onClickDoubleLeafToken', cost: 6 });
        expect(ai.pickLeafToken([62, 63, 64], 10, 5, costs)).toEqual({ skill: 'onClickTwinLeafToken', cost: 5 });
        expect(ai.pickLeafToken([62, 63, 64], 10, 3, costs)).toEqual({ skill: 'onClickLeafToken', cost: 3 });
        expect(ai.pickLeafToken([62, 63, 64], 10, 2, costs)).toBeNull();
        expect(ai.pickLeafToken([0, 1], 10, 10, costs)).toBeNull();
        expect(ai.pickLeafToken([64], 3, 10, costs)).toBeNull(); // 空きが足りない
    });

    it('トークンを撃てる手番では、🍂付きトークンを普通のトークンより先に撃つ（固有トークン持ち以外）', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const r = ai.makeMove(lone(), 10, { ...costs, onClickToken: 4 } as any, 0, 5, [62, 3, 0], false);
        expect(r.skills).toContain('onClickLeafToken');
        expect(r.skills).not.toContain('onClickToken');
    });

    it('焚き火の唄: 敵陣の🍂が2枚以上あるときだけ撃つ', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        const b = lone();
        b[15] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }, { effect: '🍂' }] };
        const r = ai.makeMove(b, 10, costs, 0, 5, [66, 0, 1], false);
        expect(r.chargeClicks?.map((c) => c.skill)).toContain('onClickBonfire');
        const one = lone();
        one[15] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }] };
        expect(ai.makeMove(one, 10, costs, 0, 5, [66, 0, 1], false).chargeClicks?.map((c) => c.skill) ?? []).not.toContain('onClickBonfire');
    });
});

describe('霜枯れのAI使用', () => {
    const costs = { onClickLeafFrost: 3 } as any;
    const leafy = () => {
        const b = emptyBoard();
        put(b, 0, '💙'); put(b, 1, '💙'); put(b, 15, '⭕');
        b[0] = { ...b[0], effects: [{ effect: '🍂' }] };
        b[1] = { ...b[1], effects: [{ effect: '🍂' }] };
        return b;
    };
    it('煉獄の鍛冶師が敵にいて、自陣の🍂マスが2つ以上あるときだけ撃つ', () => {
        const withPyro = new AIPlayer('💙', 'you', ['⭕'], ['you', 'pyromancer']);
        expect(withPyro.makeMove(leafy(), 10, costs, 0, 5, [69, 0, 1], false).skills).toContain('onClickLeafFrost');
        const noPyro = new AIPlayer('💙', 'you', ['⭕'], ['you', 'giant']);
        expect(noPyro.makeMove(leafy(), 10, costs, 0, 5, [69, 0, 1], false).skills).not.toContain('onClickLeafFrost');
        const one = leafy();
        one[1] = { ...one[1], effects: [] };
        expect(withPyro.makeMove(one, 10, costs, 0, 5, [69, 0, 1], false).skills).not.toContain('onClickLeafFrost');
    });
});

describe('凩の魔女は対策ロックを撃たない (旧sim AI witchNoAnti)', () => {
    const costs = { onClickUseLock: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    const board = () => {
        const b = emptyBoard();
        [0, 1].forEach((i) => put(b, i, '💙', 1));
        return b;
    };

    it('敵がネクロ・毒使いでも、低bindの自コマをロックしない（魔力を🍂トークンに回す）', () => {
        for (const foe of ['necromancer', 'poisoner'] as const) {
            const ai = new AIPlayer('💙', 'witch', ['⭕'], ['witch', foe]);
            const r = ai.makeMove(board(), 10, costs, 0, 4, [], false);
            expect(r.skills ?? []).not.toContain('onClickUseLock');
        }
    });
});

describe('凩の魔女は🍂トークンの分の魔力を温存する (旧sim AI witchReserve)', () => {
    const costs = { onClickAddLife: 3, onClickLeafToken: 3, onClickUseLock: 2, onClickDoubleLock: 3, onClickTripleLock: 4 } as any;
    const board = () => {
        const b = emptyBoard();
        put(b, 0, '💙', 1);
        return b;
    };

    it('魔力が🍂トークン1枚ぶんしか無いとき、ライフ3に使わず🍂トークンを撃つ', () => {
        const ai = new AIPlayer('💙', 'witch', ['⭕'], ['witch', 'you']);
        const r = ai.makeMove(board(), 4, costs, 0, 1, [0, 62], false);
        expect(r.skills ?? []).toContain('onClickLeafToken');
        expect(r.skills ?? []).not.toContain('onClickAddLife');
    });
});

describe('コストの計算順: 敵の🍂の増加分を先に足し、魔女のパッシブの減少分をそのあとに引く', () => {
    it('魔女: 敵の🍂3枚だけの盤面で、コスト2は2のまま（以前は下限1のあとに+3で4）', () => {
        const b = emptyBoard();
        put(b, 4, '⭕', 3);
        b[4] = { ...b[4], effects: [{ effect: '🍂' }, { effect: '🍂' }, { effect: '🍂' }] };
        const ai = new AIPlayer('💙', 'witch', ['⭕'], ['witch', 'you']);
        ai.updateShield(b);
        expect(ai.calculateAICost(2)).toBe(2);
        expect(ai.calculateAICost(7)).toBe(7);
    });
    it('魔女以外: 敵の🍂の増加分はそのまま乗る', () => {
        const b = emptyBoard();
        put(b, 4, '⭕', 3);
        b[4] = { ...b[4], effects: [{ effect: '🍂' }, { effect: '🍂' }] };
        const ai = new AIPlayer('💙', 'you', ['⭕'], ['you', 'you']);
        ai.updateShield(b);
        expect(ai.calculateAICost(3)).toBe(5);
    });
});

describe('裸の王様のAI使用', () => {
    const costs = { onClickStrip: 4 } as any;
    const quiet = () => {
        const b = emptyBoard();
        put(b, 0, '💙');
        put(b, 15, '⭕');
        return b;
    };
    it('相手の有効なギアが2つ以上あるときに使う。1つ以下・スキルがスロットに無いときは使わない', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        ai.oppGearCount = 2;
        expect(ai.makeMove(quiet(), 10, costs, 0, 5, [76, 0, 1], false).skills).toContain('onClickStrip');
        expect(ai.makeMove(quiet(), 10, costs, 0, 5, [0, 1, 2], false).skills).not.toContain('onClickStrip');
        ai.oppGearCount = 1;
        expect(ai.makeMove(quiet(), 10, costs, 0, 5, [76, 0, 1], false).skills).not.toContain('onClickStrip');
    });
    it('自分にリーチがあって、相手に使える土壇場の防壁があるときは、ギアが1つでも使う', () => {
        const ai = new AIPlayer('💙', 'you', ['⭕']);
        ai.oppGearCount = 1;
        ai.oppLastStand = true;
        const b = quiet();
        [1, 2, 3].forEach((i) => put(b, i + 4, '💙')); // 5,6,7 の3つ → 4 に置けば勝ち
        expect(ai.makeMove(b, 10, costs, 0, 5, [76, 0, 1], false).skills).toContain('onClickStrip');
        expect(ai.makeMove(quiet(), 10, costs, 0, 5, [76, 0, 1], false).skills).not.toContain('onClickStrip');
    });
});

describe('AIPlayer 対魔女の新スキル(初霜・吹き寄せ・山焼き・無礼講・一寸の虫に魂なし)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const mk = (me: string, foe: string, deck?: number[]) => new AIPlayer('💙', me as 'you', ['⭕'], [me, foe] as never, undefined, false, false, deck);
    const leafBoard = (): SquareInfo[] => {
        const b = emptyBoard();
        b[4] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }] };
        b[5] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }] };
        return b;
    };

    it('魔女が相手のとき、初霜/吹き寄せ/山焼きを手札に固定する。魔女以外が相手なら固定しない', () => {
        const hand = [93, 94, 95, 3];
        expect(mk('you', 'witch').chooseLocks(emptyBoard(), 0, 5, hand)).toEqual(expect.arrayContaining([93, 94]));
        expect(mk('you', 'giant').chooseLocks(emptyBoard(), 0, 5, hand)).not.toContain(93);
    });

    it('魔女が相手で、新スキルが手札に無くデッキにあり、魔力に余裕があれば引き直す。手札にあれば引き直さない', () => {
        const ai = mk('tactician', 'witch', [3, 9, 93, 94, 95]);
        ai.rerollsLeft = 2;
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [3, 9, 11], false).reroll).toBeDefined();
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [3, 93, 11], false).reroll).toBeUndefined();
        ai.rerollsLeft = 0;
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [3, 9, 11], false).reroll).toBeUndefined();
    });

    it('陰陽師が魔女と戦うとき、一寸の虫に魂なし(92)が手札に無くデッキにあり、魔力に余裕があれば引き直す。手札にあれば固定する', () => {
        const ai = mk('yinYangMaster', 'witch', [0, 2, 3, 5, 6, 8, 10, 92, 71, 72, 73, 53]);
        ai.rerollsLeft = 8;
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [0, 2, 3], false).reroll).toBeDefined();
        expect(ai.makeMove(emptyBoard(), 3, skillCosts, 2, 5, [0, 2, 3], false).reroll).toBeUndefined(); // シャッフルのあとに魔力3が残らない
        expect(ai.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [0, 2, 92], false).reroll).toBeUndefined(); // 手札にある
        expect(ai.chooseLocks(emptyBoard(), 0, 5, [0, 92, 71])).toEqual([92, 71]);
        const noCard = mk('yinYangMaster', 'witch', [0, 2, 3, 5, 6, 8, 10, 71, 72, 73, 53, 12]); // デッキに92が無ければ探さない
        noCard.rerollsLeft = 8;
        expect(noCard.makeMove(emptyBoard(), 8, skillCosts, 2, 5, [0, 2, 3], false).reroll).toBeUndefined();
    });

    it('手札が全て固定されている引き直しは、固定を1つ外してから行う（3枠とも固定したままではシャッフルしても札が変わらない）', () => {
        const ai = mk('yinYangMaster', 'witch', [0, 2, 3, 5, 6, 8, 10, 92, 71, 72, 73, 53]);
        ai.rerollsLeft = 8;
        expect(ai.chooseLocks(emptyBoard(), 0, 5, [71, 73, 53])).toHaveLength(3); // 全て固定される手札
        expect(ai.makeMove(emptyBoard(), 20, skillCosts, 2, 5, [71, 73, 53], false).reroll).toBeDefined(); // 92を探す
        expect(ai.locksForReroll([71, 73, 53], 3)).toEqual([71, 73]); // 無くても組める特売(53)を外す
        expect(ai.locksForReroll([71, 73, 92], 3)).toEqual([71, 73]); // 特売が無ければ最後の固定を外す
        expect(ai.locksForReroll([71, 73], 3)).toEqual([71, 73]); // 空き枠があれば外さない
        expect(ai.locksForReroll([], 3)).toEqual([]);
    });

    it('敵の🍂が2枚以上あれば吹き寄せ・山焼き、敵の🍂のコマがあれば初霜を撃つ', () => {
        expect(mk('you', 'witch').makeMove(leafBoard(), 22, skillCosts, 2, 5, [94], false).skills).toContain('onClickGather');
        expect(mk('you', 'witch').makeMove(leafBoard(), 22, skillCosts, 2, 5, [95], false).skills).toContain('onClickBurnOff');
        const one = emptyBoard();
        one[4] = { player: '⭕', bind: 5, effects: [{ effect: '🍂' }] };
        expect(mk('you', 'witch').makeMove(one, 22, skillCosts, 2, 5, [93], false).skills).toContain('onClickFirstFrost');
        expect(mk('you', 'witch').makeMove(one, 22, skillCosts, 2, 5, [93], true).skills).not.toContain('onClickFirstFrost'); // トークンはターン1回
    });

    it('高いトークンを撃つ予定なら、先に無礼講を撃つ（トークンが無礼講より安いときは撃たない）', () => {
        const r = mk('you', 'witch').makeMove(leafBoard(), 22, skillCosts, 2, 5, [95, 96], false).skills;
        expect(r.indexOf('onClickFreeToken')).toBeGreaterThanOrEqual(0);
        expect(r.indexOf('onClickFreeToken')).toBeLessThan(r.indexOf('onClickBurnOff'));
        const cheap = mk('you', 'witch');
        expect(cheap.makeMove(emptyBoard(), 22, skillCosts, 2, 5, [3, 96], false).skills).not.toContain('onClickFreeToken');
        const active = mk('you', 'witch');
        active.tokenFree = true;
        expect(active.makeMove(leafBoard(), 22, skillCosts, 2, 5, [95, 96], false).skills).not.toContain('onClickFreeToken');
    });

    it('一寸の虫に魂なし: 壊せる（ライフ3以下の）敵コマが2個以上のとき撃つ', () => {
        const b = emptyBoard();
        b[4] = { player: '⭕', bind: 3, effects: [] };
        b[5] = { player: '⭕', bind: 2, effects: [] };
        expect(mk('you', 'witch').makeMove(b, 22, skillCosts, 2, 5, [92], false).skills).toContain('onClickSmallFry');
        b[5] = { player: '⭕', bind: 6, effects: [] };
        expect(mk('you', 'witch').makeMove(b, 22, skillCosts, 2, 5, [92], false).skills).not.toContain('onClickSmallFry');
    });
});
