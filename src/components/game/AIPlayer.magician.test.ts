import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';
import { emptyBoard, put } from './aiTestUtils';

describe('魔法使いAI: 撃てるスキルが無いとき軽減札→引き直し（旧sim AI の discountPlan>=2）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const mk = (character: 'magician' | 'giant' | 'poisoner' = 'magician') => {
        const ai = new AIPlayer('💙', character, ['⭕'], [character, 'you']);
        ai.rerollsLeft = 2;
        return ai;
    };
    const board = () => Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] } as SquareInfo));
    const run = (ai: AIPlayer, magic: number, hand: number[]) => ai.makeMove(board(), magic, skillCosts, 2, 5, hand, false);

    it('手札が軽減札だけで魔力に余裕があれば、軽減札を撃ってから引き直す', () => {
        const r = run(mk(), 12, [60, 53]);
        expect(r.reroll).toBeDefined();
        expect(r.reroll?.discount).toBeDefined();
        expect(r.skills).toEqual([]);
    });
    it('魔力が足りない（軽減札+シャッフル+撃つ分）ときは引き直さない', () => {
        expect(run(mk(), 4, [53]).reroll).toBeUndefined();
    });
    it('引き直しの回数が残っていなければ引き直さない', () => {
        const ai = mk();
        ai.rerollsLeft = 0;
        expect(run(ai, 12, [53]).reroll).toBeUndefined();
    });
    it('魔法使い以外は、魔力が有り余っていなければ引き直さない', () => {
        expect(run(mk('giant'), 11, [53]).reroll).toBeUndefined();
    });
    it('魔法使い以外も、魔力が有り余っていて撃てるスキルが無ければ、軽減札を使わずシャッフルだけ行う', () => {
        const r = run(mk('poisoner'), 12, [53]);
        expect(r.reroll).toEqual({});
        expect(r.skills).toEqual([]);
    });
    it('魔法使い以外が有り余っていても、引き直しの回数が残っていなければ引き直さない', () => {
        const ai = mk('poisoner');
        ai.rerollsLeft = 0;
        expect(run(ai, 12, [53]).reroll).toBeUndefined();
    });
    it('引き直しの途中（軽減済み）は、魔力に余裕があればシャッフルだけ行う', () => {
        const ai = mk();
        ai.discountActive = true;
        ai.rerollsLeft = 1;
        const r = run(ai, 12, [53]);
        expect(r.reroll).toEqual({});
        expect(run(ai, 2, [53]).reroll).toBeUndefined();
    });
});

describe('魔法使いAI: バッズ駒を1手番に複数ロックする（旧sim AI の magLockN=3）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const budBoard = (cells: number[]) => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        cells.forEach((i) => (b[i] = { player: '💙', bind: 4, effects: [{ effect: '🌱' }] }));
        return b;
    };
    const run = (cells: number[], magic: number) => {
        const ai = new AIPlayer('💙', 'magician', ['⭕'], ['magician', 'you']);
        return ai.makeMove(budBoard(cells), magic, skillCosts, 2, 5, [], false);
    };
    it('バッズ駒が複数あり魔力が足りれば、最大3つまで順にロックする', () => {
        const r = run([0, 2, 5, 7], 9);
        expect(r.chargeClicks?.map((c) => c.skill)).toEqual(['onClickUseLock', 'onClickUseLock', 'onClickUseLock']);
        expect(r.chargeClicks?.map((c) => c.target)).toEqual([0, 2, 5]);
    });
    it('魔力で払える数までに減らす', () => {
        const r = run([0, 2, 5], skillCosts.onClickUseLock * 2);
        expect(r.chargeClicks?.length).toBe(2);
    });
    it('1つだけなら従来どおり lockTargets で返す', () => {
        const r = run([5], 9);
        expect(r.skills).toEqual(['onClickUseLock']);
        expect(r.lockTargets).toEqual([5]);
        expect(r.chargeClicks).toBeUndefined();
    });
    it('魔法使い以外は複数ロックしない', () => {
        const ai = new AIPlayer('💙', 'giant', ['⭕'], ['giant', 'you']);
        const r = ai.makeMove(budBoard([0, 1, 2]), 9, skillCosts, 2, 5, [], false);
        expect(r.chargeClicks?.filter((c) => c.skill === 'onClickUseLock').length ?? 0).toBe(0);
    });
});

describe('魔法使いはネクロマンサー相手に審判の日を撃たない (旧sim AI noJudgeNecro と同じ)', () => {
    // 💙(魔法使い)の周りに⭕のコマが固まっていて、審判の日なら2つ以上巻き込める盤面
    const board = () => {
        const b = emptyBoard();
        [5, 6, 9, 10].forEach((i) => put(b, i, '⭕', 4));
        return b;
    };
    const plan = (foe: 'tactician' | 'necromancer') => {
        const ai = new AIPlayer('💙', 'magician', ['⭕'], ['magician', foe]);
        return ai.makeMove(board(), 20, { onClickToken: 4, onClickLock: 2, onClickUseLock: 2 } as never, 2, 4, [], false, 0, 0, 5);
    };

    it('ネクロマンサー相手なら審判の日を撃たない', () => {
        expect(plan('necromancer').skills).not.toContain('onClickJudgeDay');
    });
    it('ほかの相手なら審判の日を撃つ', () => {
        expect(plan('tactician').skills).toContain('onClickJudgeDay');
    });
});

describe('魔法使いは相手リーチを全て崩せる審判の日なら、リーチがあっても撃つ (旧sim AI judgeUnderThreat と同じ)', () => {
    // ⭕が上段 0,1,2 の3つ揃い(3が空き=リーチ)。中心1の審判の日で 0,1,2 が壊れて列が崩れる
    const board = (extraReach = false) => {
        const b = emptyBoard();
        [0, 1, 2].forEach((i) => put(b, i, '⭕', 4));
        if (extraReach) [8, 9, 10].forEach((i) => put(b, i, '⭕', 4)); // 別の列にもリーチ=1回では崩せない
        return b;
    };
    const plan = (b: SquareInfo[], foe: 'tactician' | 'necromancer' = 'tactician') => {
        const ai = new AIPlayer('💙', 'magician', ['⭕'], ['magician', foe]);
        return ai.makeMove(b, 20, { onClickToken: 4, onClickLock: 2, onClickUseLock: 2 } as never, 2, 4, [], false, 0, 0, 5);
    };

    it('リーチの列を全て崩せるなら審判の日を撃つ', () => {
        expect(plan(board()).skills).toContain('onClickJudgeDay');
    });
    it('1回で全てのリーチを崩せないなら撃たない', () => {
        expect(plan(board(true)).skills).not.toContain('onClickJudgeDay');
    });
    it('ネクロマンサー相手なら撃たない', () => {
        expect(plan(board(), 'necromancer').skills).not.toContain('onClickJudgeDay');
    });
});

describe('魔法使いは軍師が相手のとき、純増2の審判の日は撃たず純増3から撃つ', () => {
    const board = (n: number) => {
        const b = emptyBoard();
        [5, 6, 9, 10].slice(0, n).forEach((i) => put(b, i, '⭕', 4));
        return b;
    };
    const plan = (foe: 'tactician' | 'giant', n: number) => {
        const ai = new AIPlayer('💙', 'magician', ['⭕'], ['magician', foe]);
        return ai.makeMove(board(n), 20, { onClickToken: 4, onClickLock: 2, onClickUseLock: 2 } as never, 2, 4, [], false, 0, 0, 5);
    };
    it('軍師相手: 純増2は撃たない／純増3は撃つ', () => {
        expect(plan('tactician', 2).skills).not.toContain('onClickJudgeDay');
        expect(plan('tactician', 3).skills).toContain('onClickJudgeDay');
    });
    it('ほかの相手なら純増2でも撃つ', () => {
        expect(plan('giant', 2).skills).toContain('onClickJudgeDay');
    });
});

describe('魔法使いは特売・返し特売・一寸の虫を手札に固定する', () => {
    const locks = (hand: number[]) => new AIPlayer('💙', 'magician', ['⭕'], ['magician', 'tactician']).chooseLocks(emptyBoard(), 5, 5, hand);
    it('特売(53)と一寸の虫(92)が手札にあれば固定する', () => {
        expect(locks([92, 53, 2])).toEqual(expect.arrayContaining([92, 53]));
    });
    it('返し特売(60)も固定対象（固定は最大2枚）', () => {
        expect(locks([60, 92, 13])).toEqual(expect.arrayContaining([60, 92]));
        expect(locks([53, 60, 92]).length).toBeLessThanOrEqual(2);
    });
    it('バッズ系(2)は固定しない（序盤の空きが多くても優先固定ではなく、固定対象の札が先頭に来る）', () => {
        expect(locks([2, 53, 13])[0]).toBe(53);
    });
});

describe('魔法使いは氷室が相手のとき審判の日より先に自陣のコマをロックする (旧sim AI lockFirstCryo と同じ)', () => {
    // 💙(魔法使い)のコマ 0(🌱付き)・6・11。⭕のコマ 5・10・12・15。氷室は ロックされていないコマを凍らせる
    const board = () => {
        const b = emptyBoard();
        [0, 6, 11].forEach((i) => put(b, i, '💙', 4));
        b[0] = { ...b[0], effects: [{ effect: '🌱' }] };
        [5, 10, 12, 15].forEach((i) => put(b, i, '⭕', 4));
        return b;
    };
    const planOf = (foe: 'tactician' | 'cryomancer' | 'pyromancer') => {
        const ai = new AIPlayer('💙', 'magician', ['⭕'], ['magician', foe]);
        return ai.makeMove(board(), 20, { onClickToken: 4, onClickUseLock: 2 } as never, 2, 4, [], false, 0, 0, 5);
    };
    const lockTargetsOf = (foe: 'tactician' | 'cryomancer' | 'pyromancer') => {
        const r = planOf(foe);
        return [...(r.lockTargets ?? []), ...(r.chargeClicks ?? []).map((c) => c.target)];
    };

    it('氷室が相手のときは先にロックしない（手札固定を入れた後は、ロックに魔力を回すと裏目: 対氷室 35.0→66.0%）', () => {
        expect(lockTargetsOf('cryomancer')).toEqual([]);
    });
    it('鍛冶師（🔥はロック中のコマに付かない）が相手のときも同じく全てロックする', () => {
        const targets = lockTargetsOf('pyromancer');
        expect(targets[0]).toBe(0);
        expect([...targets].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 6, 11]);
    });
    it('ほかの相手なら従来どおり審判の日を撃つ（ロックを先にしない）', () => {
        expect(planOf('tactician').skills).toContain('onClickJudgeDay');
        expect(lockTargetsOf('tactician')).toEqual([]);
    });
});
