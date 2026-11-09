import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';

describe('鍛冶師AI: 軽減札で業火を安く撃つ', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const setup = (magic: number, hand: number[]) => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'you']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        [1, 2, 3].forEach((i) => (b[i] = { player: '⭕', bind: 5, effects: [] }));
        return ai.makeMove(b, magic, skillCosts, 2, 5, hand, false);
    };
    it('魔力が足りないとき、軽減札を先に撃ってから業火を撃つ', () => {
        const r = setup(6, [58, 0, 3]);
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickClearance', 'onClickInferno']);
    });
    it('軽減札が手札にない・魔力が足りなければ業火は撃たない', () => {
        // 火遁(固有)は撃つが、業火は撃たない
        expect(setup(6, [0, 3, 5]).chargeClicks?.map((c) => c.skill)).toEqual(['onClickIgnite']);
        expect(setup(3, [58, 0, 3]).chargeClicks?.map((c) => c.skill)).not.toContain('onClickInferno');
    });
    it('業火のあと、敵のコマが自陣より2つ以上多く壊れるならバーンアウトを撃つ（🔥合計4以上でタダ）', () => {
        const r = setup(9, [61, 0, 3]);
        // 火遁(固有)→業火→バーンアウトの順。火遁で魔力を使っても業火が撃てるときだけ火遁を撃つ
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickIgnite', 'onClickInferno', 'onClickBurnout']);
        expect(setup(9, [0, 3, 5]).chargeClicks?.map((c) => c.skill)).toEqual(['onClickIgnite', 'onClickInferno']);
    });
    it('鍛冶師は軽減札を固定しない（固定すると勝ち数が下がった）', () => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'you']);
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        expect(ai.chooseLocks(b, 2, 5, [53, 3, 60])).not.toEqual(expect.arrayContaining([53, 60]));
    });
});

describe('鍛冶師AI: 空蔵で自分の列の要になる空きマスを先にロックする（旧sim AI の EL_AI）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    // 行0に💙が2つ(0,1)あり、2が空き(3つ並びの要)。相手のリーチは無い
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[1] = { player: '💙', bind: 4, effects: [] };
        return b;
    };
    const run = (hasEmptyLock: boolean, magic: number, b: SquareInfo[] = board()) => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'you'], undefined, false, hasEmptyLock);
        return ai.makeMove(b, magic, skillCosts, 2, 5, [], false);
    };

    it('空蔵を装備していれば、空きマスをロックする（lockTargets に空きマスが入る）', () => {
        const r = run(true, 6);
        expect(r.skills).toEqual(['onClickUseLock']);
        expect(r.lockTargets).toHaveLength(1);
        expect(board()[r.lockTargets![0]].player).toBeUndefined();
    });
    it('空蔵を装備していなければロックしない', () => {
        expect(run(false, 6).lockTargets).toBeUndefined();
    });
    it('魔力がロックのコストに足りなければロックしない', () => {
        expect(run(true, 1).lockTargets).toBeUndefined();
    });
    it('自分がかけた空きマスロックが上限(2)に達していればかけない', () => {
        const b = board();
        b[2] = { player: undefined, bind: 0, effects: [{ effect: '🔑', stack: 6, owner: 1 }] };
        b[3] = { player: undefined, bind: 0, effects: [{ effect: '🔑', stack: 6, owner: 1 }] };
        expect(run(true, 6, b).lockTargets).toBeUndefined();
    });
});

describe('鍛冶師AI: 固有の火遁で敵コマを燃やす（旧sim AI の igniteSig=1 / igniteSkip=1）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 4, effects: [] };
        b[6] = { player: '⭕', bind: 2, effects: [] };
        return b;
    };
    const run = (foe: 'you' | 'necromancer', magic: number, b: SquareInfo[] = board()) => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', foe]);
        return ai.makeMove(b, magic, skillCosts, 2, 5, [], false);
    };

    it('魔力が足りれば、ライフが残る敵コマに火遁を撃つ（ライフの高いほう）', () => {
        const r = run('you', 6);
        const click = r.chargeClicks?.find((c) => c.skill === 'onClickIgnite');
        expect(click).toBeDefined();
        expect(click?.target).toBe(5);
    });
    it('魔力が火遁のコストに足りなければ撃たない', () => {
        expect(run('you', 0).chargeClicks?.some((c) => c.skill === 'onClickIgnite') ?? false).toBe(false);
    });
    it('ネクロマンサーが相手のときは撃たない（墓地が増えて蘇生の資源になる）', () => {
        expect(run('necromancer', 6).chargeClicks?.some((c) => c.skill === 'onClickIgnite') ?? false).toBe(false);
    });
    it('すでに🔥が付いた敵コマは狙わない（残りの敵コマを狙う）', () => {
        const b = board();
        b[5] = { player: '⭕', bind: 4, effects: [{ effect: '🔥' }] };
        const click = run('you', 6, b).chargeClicks?.find((c) => c.skill === 'onClickIgnite');
        expect(click?.target).toBe(6);
    });
});

describe('鍛冶師AI: 飛び火(idx 97)はランダムな敵2マスに🔥を撃つ', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 4, effects: [] };
        b[6] = { player: '⭕', bind: 4, effects: [] };
        return b;
    };
    const run = (hand: number[], magic: number, foe: 'you' | 'necromancer' = 'you', b: SquareInfo[] = board()) => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', foe]);
        return ai.makeMove(b, magic, skillCosts, 2, 5, hand, false).chargeClicks ?? [];
    };

    it('手札に飛び火があり、敵コマが2つ以上あれば撃つ', () => {
        expect(run([97], 8).some((c) => c.skill === 'onClickSpark')).toBe(true);
    });
    it('敵コマが1つしかなければ撃たない', () => {
        const b = board();
        b[6] = { player: undefined, bind: 0, effects: [] };
        expect(run([97], 8, 'you', b).some((c) => c.skill === 'onClickSpark')).toBe(false);
    });
    it('手札に無ければ撃たない。ネクロマンサーが相手のときも撃たない', () => {
        expect(run([], 8).some((c) => c.skill === 'onClickSpark')).toBe(false);
        expect(run([97], 8, 'necromancer').some((c) => c.skill === 'onClickSpark')).toBe(false);
    });
});

describe('鍛冶師AI: 火口(idx 87)は🌱か🍂のある敵コマを火遁より先に燃やす（旧sim AI の火口と同一）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 6, effects: [] };
        b[6] = { player: '⭕', bind: 3, effects: [{ effect: '🌱' }] };
        return b;
    };
    const run = (hand: number[], magic: number, foe: 'you' | 'necromancer' = 'you') => {
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', foe]);
        return ai.makeMove(board(), magic, skillCosts, 2, 5, hand, false);
    };

    it('手札に火口があれば🌱のある敵コマに撃ち、そのあと火遁は残りのコマに撃つ', () => {
        const clicks = run([87], 8).chargeClicks ?? [];
        expect(clicks.find((c) => c.skill === 'onClickTinder')?.target).toBe(6);
        expect(clicks.find((c) => c.skill === 'onClickIgnite')?.target).toBe(5);
    });
    it('氷結(❄)した敵コマにも火口を撃つ（🌱🍂の無い盤面でも）', () => {
        const b = board();
        b[6] = { player: '⭕', bind: 3, effects: [{ effect: '❄' }] };
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'you']);
        const clicks = ai.makeMove(b, 8, skillCosts, 2, 5, [87], false).chargeClicks ?? [];
        expect(clicks.find((c) => c.skill === 'onClickTinder')?.target).toBe(6);
    });
    it('手札に火口が無ければ撃たない', () => {
        expect(run([], 8).chargeClicks?.some((c) => c.skill === 'onClickTinder') ?? false).toBe(false);
    });
    it('ネクロマンサーが相手のときは撃たない', () => {
        expect(run([87], 8, 'necromancer').chargeClicks?.some((c) => c.skill === 'onClickTinder') ?? false).toBe(false);
    });
});

describe('鍛冶師AI: 相手に魔法使いがいるとき火口を手札に固定する（旧sim AI の tinderLock=2）', () => {
    const board = () => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] } as SquareInfo));
    const locks = (foe: 'magician' | 'you') => new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', foe]).chooseLocks(board(), 0, 5, [87, 0, 1]);

    it('相手に魔法使いがいれば火口(87)を固定する', () => {
        expect(locks('magician')).toContain(87);
    });
    it('魔女がいても固定する', () => {
        expect(new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'witch']).chooseLocks(board(), 0, 5, [87, 0, 1])).toContain(87);
    });
    it('魔法使いがいなければ固定しない', () => {
        expect(locks('you')).not.toContain(87);
    });
});

describe('鍛冶師AI: 火遁は魔法使いの🌱コマを優先して燃やす（旧sim AI の igniteBud）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    it('ライフが同じ敵コマが2つあるとき、魔法使いなら🌱のあるほうを狙う', () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 4, effects: [] };
        b[10] = { player: '⭕', bind: 4, effects: [{ effect: '🌱' }] };
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'magician']);
        const click = ai.makeMove(b, 6, skillCosts, 2, 5, [], false).chargeClicks?.find((c) => c.skill === 'onClickIgnite');
        expect(click?.target).toBe(10);
    });
    it('魔法使い以外の相手なら🌱の有無は考えない（ライフが同じなら先に見つかったマス）', () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 4, effects: [] };
        b[10] = { player: '⭕', bind: 4, effects: [{ effect: '🌱' }] };
        const ai = new AIPlayer('💙', 'pyromancer', ['⭕'], ['pyromancer', 'you']);
        const click = ai.makeMove(b, 6, skillCosts, 2, 5, [], false).chargeClicks?.find((c) => c.skill === 'onClickIgnite');
        expect(click?.target).toBe(5);
    });
});
