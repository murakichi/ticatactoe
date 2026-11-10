import AIPlayer from './AIPlayer';
import { SquareInfo } from '../../types/SquareInfo';

describe('鍵師AI: 空きマスのロックを優先して撃つ（#439）', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    // 行0に💙が2つ(0,1)あり、2が空き(3つ並びの要)。相手のリーチは無い
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[1] = { player: '💙', bind: 4, effects: [] };
        return b;
    };
    const run = (character: 'keysmith' | 'you', magic: number, b: SquareInfo[] = board()) => {
        const ai = new AIPlayer('💙', character, ['⭕'], [character, 'you'], undefined, false, false); // 空蔵ギアなし
        return ai.makeMove(b, magic, skillCosts, 2, 5, [], false);
    };

    it('ギアが無くても、自分の列の要になる空きマスをロックする。ロックしたマスに置く手を選ぶ', () => {
        const r = run('keysmith', 6);
        expect(r.skills).toEqual(['onClickUseLock']);
        expect(r.lockTargets).toHaveLength(1);
        expect(board()[r.lockTargets![0]].player).toBeUndefined();
        expect(r.move).not.toBeNull();
    });
    it('鍵師でなければ、空蔵が無いのでロックしない', () => {
        expect(run('you', 6).lockTargets).toBeUndefined();
    });
    it('魔力がロックのコストに足りなければロックしない', () => {
        expect(run('keysmith', 0).lockTargets).toBeUndefined();
    });
    it('ロック中の空きマスが上限(2)に達していれば、空きマスのロック判断ではかけない（誰が掛けたかを問わず数える）', () => {
        // 二列並びのコンボが成立しない盤面（行0の残りに敵のコマを置く）で、空きマスのロック判断だけを見る
        const b = board();
        b[3] = { player: '⭕', bind: 4, effects: [] };
        b[8] = { player: undefined, bind: 0, effects: [{ effect: '🔑', stack: 6 }] };
        b[9] = { player: undefined, bind: 0, effects: [{ effect: '🔑', stack: 6 }] };
        expect(run('keysmith', 6, b).lockTargets).toBeUndefined();
    });
    it('ライフが尽きかけ（1以下）の、列づくりに効いている自陣のコマを先にロックして守る', () => {
        const b = board();
        b[0] = { player: '💙', bind: 1, effects: [] }; // 奪われる直前
        const r = run('keysmith', 6, b);
        expect(r.skills).toEqual(['onClickUseLock']);
        expect(r.lockTargets).toEqual([0]);
    });
    it('ライフに余裕のある自陣のコマは、空きマスのロックを優先する（自陣のコマはロックしない）', () => {
        const r = run('keysmith', 6);
        expect(board()[r.lockTargets![0]].player).toBeUndefined();
    });
    it('すでにロック中の自陣のコマには重ねてロックしない', () => {
        const b = board();
        b[0] = { player: '💙', bind: 1, effects: [{ effect: '🔑', stack: 5 }] };
        expect(run('keysmith', 6, b).lockTargets?.includes(0) ?? false).toBe(false);
    });
    describe('封鎖の断（払えれば撃つ）', () => {
        const seal = (b: SquareInfo[], magic: number) => run('keysmith', magic, b);
        // コンボ（二列並び）も空きマスのロックも成立しない盤面: 自陣のコマが1つだけ
        const plain = (): SquareInfo[] => {
            const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
            b[0] = { player: '💙', bind: 4, effects: [] };
            return b;
        };
        it('払える魔力があれば、敵のリーチやロックが無くても撃つ（ターン終了）', () => {
            const r = seal(plain(), 30);
            expect(r.skills).toContain('onClickSeal');
            expect(r.move).toBeNull(); // ターン終了スキルなので着手しない
        });
        it('魔力が足りなければ撃たない', () => {
            expect(seal(plain(), 3).skills).not.toContain('onClickSeal');
        });
        it('自分にリーチがあるときは撃たない（ターン終了スキルを撃つと勝ち手を逃す）', () => {
            const b = plain();
            b[1] = { player: '💙', bind: 4, effects: [] };
            b[2] = { player: '💙', bind: 4, effects: [] }; // 行0: 💙💙💙 _ （リーチ）
            expect(seal(b, 30).skills).not.toContain('onClickSeal');
        });
    });
    describe('二列並びのコンボ（片方をロックして、もう片方に置く）', () => {
        const combo = (b: SquareInfo[], magic = 6) => run('keysmith', magic, b);

        it('敵のコマが無い列に自陣が2つ並び、残り2マスが空きなら、片方をロックしてもう片方に置く', () => {
            const r = combo(board()); // 行0: 💙💙 _ _
            expect(r.skills).toEqual(['onClickUseLock']);
            expect(r.lockTargets).toHaveLength(1);
            const lock = r.lockTargets![0];
            expect([2, 3]).toContain(lock);
            expect(r.move).toBe(lock === 2 ? 3 : 2); // もう片方に置く
        });
        it('敵にリーチがあるときは、止めるのが先でコンボは撃たない', () => {
            const b = board();
            b[4] = { player: '⭕', bind: 4, effects: [] };
            b[5] = { player: '⭕', bind: 4, effects: [] };
            b[6] = { player: '⭕', bind: 4, effects: [] }; // 行1: ⭕⭕⭕ _
            expect(combo(b).lockTargets).not.toEqual(expect.arrayContaining([2]));
            expect(combo(b).move).toBe(7); // 敵のリーチの最後のマスを塞ぐ
        });
        it('ライフが足りない（1以下）二列では、コンボではなく自陣のコマのロックを優先する', () => {
            const b = board();
            b[0] = { player: '💙', bind: 1, effects: [] };
            expect(combo(b).lockTargets).toEqual([0]);
        });
        it('敵のコマが混ざっている列ではコンボを撃たない', () => {
            const b = board();
            b[3] = { player: '⭕', bind: 4, effects: [] }; // 行0: 💙💙 _ ⭕
            expect(combo(b).lockTargets?.length ?? 0).toBeLessThanOrEqual(1);
            expect(combo(b).move).not.toBe(3);
        });
        it('ロック中の空きマスがコンボの上限(3)に達していれば撃たない', () => {
            const b = board();
            for (const i of [8, 9, 10]) b[i] = { player: undefined, bind: 0, effects: [{ effect: '🔑', stack: 6 }] };
            expect(combo(b).lockTargets).toBeUndefined();
        });
        it('魔力がロックのコストに足りなければ撃たない', () => {
            expect(combo(board(), 0).lockTargets).toBeUndefined();
        });
    });
    it('価値の低いマスはロックしない（コマが1つだけの盤面）', () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        expect(run('keysmith', 6, b).lockTargets).toBeUndefined();
    });
});

describe('鍵師AI: 芽吹きの錠でバッズを付ける', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[5] = { player: '💙', bind: 2, effects: [] };
        return b;
    };
    const run = (bloom: boolean) => {
        const ai = new AIPlayer('💙', 'keysmith', ['⭕'], ['keysmith', 'you'], undefined, false, false, undefined, bloom);
        return ai.makeMove(board(), 6, skillCosts, 2, 5, [11, 2, 0], false);
    };
    it('ライフ2以下でバッズの無い自陣のコマをロックする', () => {
        const r = run(true);
        expect(r.skills).toContain('onClickUseLock');
        expect(r.lockTargets).toEqual([5]);
    });
    it('魔力が封鎖の断(9〜10)に届くなら、安いロックではなく封鎖の断を優先する（無料の1回を封鎖の断に使う）', () => {
        const ai = new AIPlayer('💙', 'keysmith', ['⭕'], ['keysmith', 'you'], undefined, false, false, undefined, true);
        const r = ai.makeMove(board(), 14, skillCosts, 2, 5, [11, 2, 0], false);
        expect(r.skills).toEqual(['onClickSeal']);
    });
    it('ギアが無ければこの盤面ではロックしない（ライフ2は守りの対象ではない）', () => {
        expect(run(false).lockTargets).toBeUndefined();
    });
});

describe('鍵師AI: 封鎖の断のために魔力を貯める', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    const board = () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        b[0] = { player: '💙', bind: 4, effects: [] };
        b[5] = { player: '⭕', bind: 4, effects: [] };
        return b;
    };
    const run = (character: 'keysmith' | 'you', magic: number) => {
        const ai = new AIPlayer('💙', character, ['⭕'], [character, 'you'], undefined, false, false);
        return ai.makeMove(board(), magic, skillCosts, 2, 5, [2, 11, 10], false);
    };
    it('封鎖の断のコストに届かず、守りも要らないときは、手札のスキルを撃たず魔力を貯める', () => {
        const r = run('keysmith', 5);
        expect(r.skills.filter((sk) => sk !== 'onClickUseLock')).toEqual([]);
        expect(r.chargeClicks ?? []).toEqual([]);
    });
    it('鍵師以外は、同じ場面で手札のスキルを撃つ', () => {
        expect(run('you', 8).skills.length).toBeGreaterThan(0);
    });
});

describe('鍵師AI: 敵コマの奪取で完成する勝ちを、封鎖の断より優先する', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { skillCosts } = require('./skillCosts');
    it('対角線 0,5,15 が自分で、10 がライフ0の敵コマ。魔力が余っていても封鎖の断を撃たず、10 を奪って勝つ', () => {
        const b: SquareInfo[] = Array.from({ length: 16 }, () => ({ player: undefined, bind: 0, effects: [] }));
        for (const i of [0, 5, 15]) b[i] = { player: '💙', bind: 0, effects: [] };
        b[10] = { player: '⭕', bind: 0, effects: [] };
        const ai = new AIPlayer('💙', 'keysmith', ['⭕'], ['keysmith', 'you'], undefined, false, false);
        const r = ai.makeMove(b, 136, skillCosts, 2, 5, [], false);
        expect(r.skills).not.toContain('onClickSeal');
        expect(r.move).toBe(10);
    });
});
