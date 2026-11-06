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
